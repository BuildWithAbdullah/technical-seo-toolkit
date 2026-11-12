/**
 * defects.test.mjs
 *
 * One test per fault found in the 12 November 2026 rebuild, each one pairing
 * the artefact that was reported wrongly with the artefact that must still be
 * reported correctly.
 *
 * Every fault below had shipped. They are gathered in one file rather than
 * spread through the per-kind files because the pairing is the point: a fix
 * that silences a false positive is only a fix if the true positive beside it
 * still fires, and a fix that adds a finding is only a fix if the correct
 * artefact stays clean. Half of these were false positives, where the checker
 * reported a fault in markup that was right, and a false positive costs more
 * than a missing check because it teaches the reader to stop reading the
 * output.
 *
 * Four of them were found by splitting one weak finding into the reasons it
 * was covering. That is the highest yielding rule this repository has: an
 * absent canonical, an empty one and a relative one are three faults with
 * three causes and three fixes, and while they shared an id the empty one was
 * reported as clean.
 *
 * Two of them were found by reading the existing tests as claims rather than
 * as coverage, which is a different exercise from reading the code. Both are
 * marked below. A test whose name states a mechanism is where to start,
 * because the name is doing the convincing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { run, runFull, page, ld, cluster } from './helpers.mjs';
import { hreflangShape, robotsRuleMatcher } from '../tools/checkers.mjs';

const sitemapIndex = (inner) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${inner}\n</sitemapindex>`;

// ---------------------------------------------------------------------------
// 1. An empty canonical href was reported clean.
// ---------------------------------------------------------------------------

test('an empty canonical href is reported, and it used to be reported as clean', () => {
  // The single most common canonical fault on a templated site is a canonical
  // whose href is an unrendered variable. The hrefs were collected with
  // filter(Boolean), so an empty one was dropped before any rule saw it and
  // the document came back with nothing at all.
  assert.deepEqual(run('canonical', page('<link rel="canonical" href="">')), ['canonical-empty-href']);
  assert.deepEqual(run('canonical', page('<link rel="canonical">')), ['canonical-empty-href']);
});

test('a whitespace canonical href is the same fault and no longer named as a relative URL', () => {
  // The whitespace spelling did produce a finding, and it was the wrong one:
  // canonical-relative, which sends the reader to make the URL absolute when
  // the actual problem is that the template rendered nothing.
  const problems = runFull('canonical', page('<link rel="canonical" href="   ">'));
  assert.deepEqual(problems.map((p) => p.id), ['canonical-empty-href']);
  assert.match(problems[0].message, /template/);
});

test('a genuinely relative canonical is still reported as relative', () => {
  assert.deepEqual(run('canonical', page('<link rel="canonical" href="/about/">')), ['canonical-relative']);
});

test('a correct canonical is still clean', () => {
  assert.deepEqual(run('canonical', page('<link rel="canonical" href="https://example.com/about/">')), []);
});

// ---------------------------------------------------------------------------
// 2. A heading whose only content was an image with alt text was called empty.
// ---------------------------------------------------------------------------

test('a heading holding one image with alt text is not an empty heading', () => {
  // False positive on a shape that is correct, common and deliberate: a
  // wordmark or a section graphic inside a heading, named by its alt text. The
  // check read the text content only, and an image contributes none.
  assert.deepEqual(run('headings', page('', '<h1>Title</h1><h2><img src="/a.svg" alt="Pricing"></h2>')), []);
});

test('an aria-label also names a heading', () => {
  assert.deepEqual(run('headings', page('', '<h1>Title</h1><h2 aria-label="Pricing"><span></span></h2>')), []);
});

test('a heading with an image whose alt is empty is still an empty heading', () => {
  // The contrast case. An image with an empty alt is decorative by
  // declaration, so the heading really does name nothing.
  assert.deepEqual(run('headings', page('', '<h1>Title</h1><h2><img src="/a.svg" alt=""></h2>')), ['heading-empty']);
  assert.deepEqual(run('headings', page('', '<h1>Title</h1><h2></h2>')), ['heading-empty']);
});

// ---------------------------------------------------------------------------
// 3. A sitemap index was checked for nothing at all.
//    Found by reading a test as a claim: see test/sitemap.test.mjs.
// ---------------------------------------------------------------------------

test('a sitemap index with four faults in it reports four faults', () => {
  const problems = run('sitemap', sitemapIndex([
    '  <sitemap><loc>/sitemaps/a.xml</loc><lastmod>2026-01-15</lastmod></sitemap>',
    '  <sitemap><loc>http://example.com/sitemaps/b.xml</loc><lastmod>last Tuesday</lastmod></sitemap>',
    '  <sitemap><loc>http://example.com/sitemaps/b.xml</loc><lastmod>2026-01-15</lastmod></sitemap>',
  ].join('\n')));
  assert.deepEqual([...new Set(problems)].sort(), [
    'sitemap-index-duplicate-loc',
    'sitemap-index-lastmod-invalid',
    'sitemap-index-loc-non-https',
    'sitemap-index-loc-relative',
  ]);
});

test('a correct sitemap index is clean', () => {
  assert.deepEqual(
    run('sitemap', sitemapIndex('  <sitemap><loc>https://example.com/sitemaps/a.xml</loc><lastmod>2026-01-15</lastmod></sitemap>')),
    []
  );
});

// ---------------------------------------------------------------------------
// 4. hreflang values were judged case sensitively, and numeric regions were
//    rejected outright.
// ---------------------------------------------------------------------------

test('every spelling of a valid hreflang value is accepted', () => {
  for (const value of ['en', 'EN', 'en-GB', 'en-gb', 'EN-GB', 'zh-Hant', 'zh-hant', 'zh-Hant-TW', 'zh-hant-tw', 'es-419', 'fil', 'x-default', 'X-Default']) {
    assert.equal(hreflangShape(value), 'valid', `${value} should be accepted`);
  }
});

test('a value that is not a language in any spelling is still rejected', () => {
  for (const value of ['english', 'en_GB', 'en-gbr', 'e', 'en-GB-extra-bits']) {
    assert.equal(hreflangShape(value), 'invalid', `${value} should be rejected`);
  }
});

test('es-419 is accepted, and it is the standard value for Latin American Spanish', () => {
  // A region subtag may be two letters or a three digit UN M.49 code. The old
  // pattern allowed only the first, so a correctly built Latin American
  // cluster was reported as using an invalid value.
  assert.deepEqual(
    run('hreflang', cluster([
      ['https://example.com/es/', [['es-419', 'https://example.com/es/'], ['x-default', 'https://example.com/es/']]],
    ])),
    []
  );
});

// ---------------------------------------------------------------------------
// 5. An entity defined in place with its own @id was reported as inlined.
// ---------------------------------------------------------------------------

test('an entity defined in place with its own @id is not a restatement', () => {
  // False positive on the shape Google documents and recommends. Defining the
  // publisher under the page, with an @id so the rest of the site can
  // reference it, is the correct answer, and the rule flagged it because it
  // only counted keys.
  const body = page(ld(JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': 'https://example.com/p#page',
    publisher: { '@type': 'Organization', '@id': 'https://example.com/#org', name: 'Acme', url: 'https://example.com/' },
  })));
  assert.deepEqual(run('jsonld-graph', body), []);
});

test('an entity restated under a node when it is already defined at the top level is reported', () => {
  const body = page(ld(JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': 'https://example.com/#org', name: 'Acme', url: 'https://example.com/' },
      { '@type': 'WebPage', '@id': 'https://example.com/p#page', publisher: { '@type': 'Organization', '@id': 'https://example.com/#org', name: 'Acme', url: 'https://example.com/' } },
    ],
  })));
  assert.deepEqual(run('jsonld-graph', body), ['jsonld-inlined-entity']);
});

test('an entity inlined with no @id at all is still reported', () => {
  const body = page(ld(JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': 'https://example.com/p#page',
    publisher: { '@type': 'Organization', name: 'Acme', url: 'https://example.com/' },
  })));
  assert.deepEqual(run('jsonld-graph', body), ['jsonld-inlined-entity']);
});

// ---------------------------------------------------------------------------
// 6. The breadcrumb checker went blind and said nothing.
//    Found by reading a test as a claim: see test/jsonld.test.mjs.
// ---------------------------------------------------------------------------

test('two breadcrumb rules that need the page URL report that they did not run', () => {
  const trail = ld(JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://example.com/' },
      { '@type': 'ListItem', position: 2, name: 'A', item: 'https://example.com/somewhere-else/' },
    ],
  }));
  assert.deepEqual(run('jsonld-breadcrumb', page(trail)), ['breadcrumb-page-url-unknown']);
  // And with the page URL present, the rule that was skipped does fire, which
  // is what proves the silence above was a missing input rather than a rule
  // that never worked.
  const withUrl = run('jsonld-breadcrumb', page(`<link rel="canonical" href="https://example.com/a/">${trail}`));
  assert.ok(withUrl.includes('breadcrumb-last-item-not-this-page'));
  assert.ok(!withUrl.includes('breadcrumb-page-url-unknown'));
});

// ---------------------------------------------------------------------------
// 7. A wildcard anywhere but the end of a robots.txt rule matched nothing.
// ---------------------------------------------------------------------------

test('a robots.txt rule with a wildcard in the middle matches what it should', () => {
  assert.ok(robotsRuleMatcher('/*.css$')('/assets/theme.css'));
  assert.ok(robotsRuleMatcher('/*.css$')('/a/b/c/theme.css'));
  assert.ok(!robotsRuleMatcher('/*.css$')('/assets/theme.css.map'), 'the trailing dollar anchors the end of the path');
  assert.ok(robotsRuleMatcher('/private/*/drafts')('/private/2026/drafts'));
  assert.ok(!robotsRuleMatcher('/private/')('/public/'));
});

test('blocking every stylesheet is detected, and it used to be detected as blocking nothing', () => {
  // The most expensive finding this checker has, defeated by the ordinary way
  // of writing the rule that causes it. The matcher stripped trailing
  // asterisks and then compared with startsWith, so /*.css$ was treated as a
  // literal string and matched no path at all.
  const manifest = JSON.stringify({
    robotsTxt: 'User-agent: *\nDisallow: /*.css$\nSitemap: https://example.com/sitemap.xml',
    renderAssets: ['https://example.com/assets/theme.css'],
  });
  const problems = runFull('robots', manifest);
  assert.deepEqual(problems.map((p) => p.id), ['robots-blocks-render-assets']);
  assert.equal(problems[0].severity, 'error');
});

test('a site that blocks nothing is still reported as blocking nothing', () => {
  assert.deepEqual(
    run('robots', JSON.stringify({
      robotsTxt: 'User-agent: *\nDisallow: /tmp/\nSitemap: https://example.com/sitemap.xml',
      renderAssets: ['https://example.com/assets/theme.css'],
    })),
    []
  );
});

// ---------------------------------------------------------------------------
// 8. A redirect with no status was judged anyway.
// ---------------------------------------------------------------------------

test('a redirect rule with no status produces a refusal, not a verdict with undefined in it', () => {
  const problems = runFull('redirects', JSON.stringify({ redirects: [{ from: '/old/', to: '/new/' }] }));
  assert.deepEqual(problems.map((p) => p.id), ['redirect-status-missing']);
  assert.doesNotMatch(problems[0].message, /undefined/, 'the message must not quote a status that was never recorded');
});

test('a redirect rule with a temporary status is still reported as temporary', () => {
  assert.deepEqual(
    run('redirects', JSON.stringify({ redirects: [{ from: '/old/', to: '/new/', status: 302 }] })),
    ['redirect-temporary-for-permanent-move']
  );
});

test('a status that is not a redirect at all has its own finding', () => {
  assert.deepEqual(
    run('redirects', JSON.stringify({ redirects: [{ from: '/old/', to: '/new/', status: 200 }] })),
    ['redirect-status-not-a-redirect']
  );
});

// ---------------------------------------------------------------------------
// 9. A url entry with no loc was reported as having a relative one.
// ---------------------------------------------------------------------------

test('a url entry with no loc is reported as having no loc', () => {
  const problems = runFull('sitemap', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><lastmod>2026-01-15</lastmod></url></urlset>');
  assert.deepEqual(problems.map((p) => p.id), ['sitemap-url-without-loc']);
  assert.doesNotMatch(problems[0].message, /is not an absolute URL/);
});

// ---------------------------------------------------------------------------
// 10. A JSON-LD block with no @context parsed cleanly and was reported clean.
// ---------------------------------------------------------------------------

test('a block with no @context is reported, because none of it is read as Schema.org', () => {
  assert.deepEqual(
    run('jsonld-syntax', page(ld(JSON.stringify({ '@type': 'Organization', '@id': 'https://example.com/#org', name: 'Acme' })))),
    ['jsonld-no-context']
  );
});

test('a block with an @context is not reported for it', () => {
  assert.deepEqual(
    run('jsonld-syntax', page(ld(JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', '@id': 'https://example.com/#org', name: 'Acme' })))),
    []
  );
});
