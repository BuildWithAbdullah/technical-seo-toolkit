/**
 * sitemap.test.mjs
 *
 * Three of these tests exist because the checker was wrong.
 *
 * The lastmod rule validated the shape of a date and not the date, so
 * 2026-02-30 and 2026-13-01 both passed. That is the exact fault the pattern is
 * about: Google ignores a lastmod it cannot parse, and says nothing anywhere
 * when it does.
 *
 * A file whose root element was neither urlset nor sitemapindex produced zero
 * problems, because the URL loop iterated an empty list and finished. A sitemap
 * saved from the wrong template, or an HTML error page served at the sitemap
 * URL, came back clean.
 *
 * And there was a finding for a file that was both an index and a urlset which
 * could never fire, because a document with two root elements is not well-formed
 * XML and was caught one guard earlier. It is gone.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { run, runFull, sitemap, url } from './helpers.mjs';

test('a minimal valid sitemap is clean', () => {
  assert.deepEqual(run('sitemap', sitemap(url('https://example.com/a'))), []);
});

test('a sitemap index is checked, and it used to be checked for nothing at all', () => {
  // This is the defect that hid behind the best-named test in the repository.
  // The test here used to be called "a sitemap index is read as an index and
  // not held to the URL rules" and it asserted that an index produced no
  // findings. That reads like a deliberate distinction between two file
  // formats. What it actually required was that the checker return
  // immediately on seeing a sitemapindex root, so an index with a relative
  // loc, an http loc, a duplicate entry and an unparseable lastmod was
  // reported completely clean. That is the file most large sites submit, and
  // every fault in it costs a whole child sitemap rather than one URL.
  const problems = runFull('sitemap', [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <sitemap><loc>/sitemaps/products.xml</loc><lastmod>2026-01-15</lastmod></sitemap>',
    '  <sitemap><loc>http://example.com/sitemaps/a.xml</loc><lastmod>15 January 2026</lastmod></sitemap>',
    '  <sitemap><loc>http://example.com/sitemaps/a.xml</loc><lastmod>2026-01-15</lastmod></sitemap>',
    '</sitemapindex>',
  ].join('\n'));
  assert.deepEqual(
    [...new Set(problems.map((p) => p.id))].sort(),
    [
      'sitemap-index-duplicate-loc',
      'sitemap-index-lastmod-invalid',
      'sitemap-index-loc-non-https',
      'sitemap-index-loc-relative',
    ]
  );
});

test('a correct sitemap index is clean, so the rules above are about the file and not the format', () => {
  assert.deepEqual(
    run('sitemap', [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      '  <sitemap><loc>https://example.com/sitemaps/products.xml</loc><lastmod>2026-01-15</lastmod></sitemap>',
      '</sitemapindex>',
    ].join('\n')),
    []
  );
});

test('the index findings are separate ids from the urlset ones', () => {
  // Deliberate, because the cost differs by three orders of magnitude: a bad
  // loc in a urlset loses one URL and a bad loc in an index loses every URL in
  // a child sitemap. Sharing the id would make the two indistinguishable in a
  // report and in the catalogue.
  const index = runFull('sitemap', [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <sitemap><loc>/relative.xml</loc><lastmod>2026-01-15</lastmod></sitemap>',
    '</sitemapindex>',
  ].join('\n'));
  assert.deepEqual(index.map((p) => p.id), ['sitemap-index-loc-relative']);
  assert.ok(!index.some((p) => p.id === 'sitemap-loc-relative'));
});

test('malformed XML is reported with the line it failed on', () => {
  const problems = runFull('sitemap', '<?xml version="1.0"?>\n<urlset><url><loc>https://example.com/a</loc></urlset>');
  assert.deepEqual(problems.map((p) => p.id), ['sitemap-not-well-formed']);
  assert.match(problems[0].message, /line \d+/);
});

test('a well-formed file that is not a sitemap is reported, not passed', () => {
  // Regression. This used to come back clean.
  const problems = runFull('sitemap', '<?xml version="1.0"?>\n<pages><url><loc>https://example.com/a</loc></url></pages>');
  assert.deepEqual(problems.map((p) => p.id), ['sitemap-no-urlset']);
  assert.match(problems[0].message, /<pages>/, 'the message should name the root element it found');
});

test('an empty urlset is reported, because a sitemap that says nothing was still submitted', () => {
  // This used to assert that an empty urlset is clean. An empty sitemap is a
  // file somebody built, submitted and is now waiting on, and the most common
  // cause is a generator that found no published posts. Reporting it clean is
  // reporting that the submission worked.
  assert.deepEqual(run('sitemap', sitemap('')), ['sitemap-empty']);
});

test('an empty sitemap index is reported too, and under its own id', () => {
  assert.deepEqual(
    run('sitemap', '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>'),
    ['sitemap-index-empty']
  );
});

test('a relative loc is reported, and an http loc is reported as costing a redirect', () => {
  assert.deepEqual(run('sitemap', sitemap(url('/a'))), ['sitemap-loc-relative']);
  const problems = runFull('sitemap', sitemap(url('http://example.com/a')));
  assert.deepEqual(problems.map((p) => p.id), ['sitemap-loc-non-https']);
  assert.match(problems[0].message, /redirect/);
});

test('a duplicated URL is reported once, on the second occurrence', () => {
  const problems = runFull('sitemap', sitemap([url('https://example.com/a'), url('https://example.com/a')].join('\n')));
  assert.deepEqual(problems.map((p) => p.id), ['sitemap-duplicate-loc']);
});

test('a missing lastmod is reported', () => {
  assert.deepEqual(run('sitemap', sitemap(url('https://example.com/a', ''))), ['sitemap-lastmod-missing']);
});

test('every W3C datetime shape the protocol allows is accepted', () => {
  for (const value of [
    '2026',
    '2026-01',
    '2026-01-15',
    '2026-01-15T10:30Z',
    '2026-01-15T10:30:00Z',
    '2026-01-15T10:30:00.123Z',
    '2026-01-15T10:30:00+05:00',
    '2026-01-15T10:30:00-05:00',
  ]) {
    assert.deepEqual(
      run('sitemap', sitemap(url('https://example.com/a', `<lastmod>${value}</lastmod>`))),
      [],
      `${value} is a valid W3C datetime`
    );
  }
});

test('a date in the wrong format is reported as ignored', () => {
  const problems = runFull('sitemap', sitemap(url('https://example.com/a', '<lastmod>15/01/2026</lastmod>')));
  assert.deepEqual(problems.map((p) => p.id), ['sitemap-lastmod-invalid']);
  assert.match(problems[0].message, /ignored/);
});

test('a date with a valid shape and an impossible value is reported', () => {
  // Regression. All four of these matched the shape pattern and passed.
  for (const value of ['2026-02-30', '2026-13-01', '2026-00-10', '2026-04-31']) {
    assert.deepEqual(
      run('sitemap', sitemap(url('https://example.com/a', `<lastmod>${value}</lastmod>`))),
      ['sitemap-lastmod-invalid'],
      `${value} is not a date`
    );
  }
});

test('a leap day is accepted in a leap year and rejected otherwise', () => {
  assert.deepEqual(run('sitemap', sitemap(url('https://example.com/a', '<lastmod>2024-02-29</lastmod>'))), []);
  assert.deepEqual(
    run('sitemap', sitemap(url('https://example.com/a', '<lastmod>2026-02-29</lastmod>'))),
    ['sitemap-lastmod-invalid']
  );
});

test('a lastmod in the future is reported', () => {
  assert.deepEqual(
    run('sitemap', sitemap(url('https://example.com/a', '<lastmod>2099-01-01</lastmod>'))),
    ['sitemap-lastmod-future']
  );
});

test('today is not in the future', () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.deepEqual(run('sitemap', sitemap(url('https://example.com/a', `<lastmod>${today}</lastmod>`))), []);
});

test('priority and changefreq are reported together as one finding per URL', () => {
  const problems = runFull('sitemap', sitemap(url('https://example.com/a', '<lastmod>2026-01-15</lastmod><priority>0.8</priority><changefreq>daily</changefreq>')));
  assert.deepEqual(problems.map((p) => p.id), ['sitemap-priority-or-changefreq']);
});

test('either of priority and changefreq alone is enough', () => {
  assert.deepEqual(
    run('sitemap', sitemap(url('https://example.com/a', '<lastmod>2026-01-15</lastmod><priority>0.8</priority>'))),
    ['sitemap-priority-or-changefreq']
  );
  assert.deepEqual(
    run('sitemap', sitemap(url('https://example.com/a', '<lastmod>2026-01-15</lastmod><changefreq>weekly</changefreq>'))),
    ['sitemap-priority-or-changefreq']
  );
});

test('fifty thousand URLs is within the limit and one more is not', () => {
  const rows = (n) => {
    const out = [];
    for (let i = 0; i < n; i++) out.push(url(`https://example.com/p/${i}`));
    return out.join('\n');
  };
  assert.deepEqual(run('sitemap', sitemap(rows(50000))), []);
  assert.deepEqual(run('sitemap', sitemap(rows(50001))), ['sitemap-too-many-urls']);
});
