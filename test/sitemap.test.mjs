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

test('a sitemap index is read as an index and not held to the URL rules', () => {
  assert.deepEqual(
    run('sitemap', '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex><sitemap><loc>https://example.com/s1.xml</loc></sitemap></sitemapindex>'),
    []
  );
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

test('an empty urlset is clean', () => {
  assert.deepEqual(run('sitemap', sitemap('')), []);
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
