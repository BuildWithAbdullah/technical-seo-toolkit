/**
 * jsonld.test.mjs
 *
 * Three checkers read JSON-LD and they are deliberately separate, because the
 * three faults are at different levels and a site can have any one without the
 * others. A block that does not parse is invisible. A graph that parses can
 * still describe four different organisations. A breadcrumb trail can be
 * internally valid and belong to a different page.
 *
 * One test here is a regression. The duplicate entity check built a signature
 * from type plus name or @id, so two genuinely different anonymous nodes of the
 * same type collapsed into one signature and were reported as a duplicate. A
 * false positive in a checker costs more than a missing check, because it is how
 * a reader learns to ignore the output.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { run, runFull, page, ld } from './helpers.mjs';

const graph = (nodes) => ld(JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }));
const node = (json) => ld(JSON.stringify({ '@context': 'https://schema.org', ...json }));

// ------------------------------------------------------------------- syntax

test('a single valid block is clean', () => {
  assert.deepEqual(run('jsonld-syntax', page(node({ '@type': 'WebPage', name: 'Example' }))), []);
});

test('a document with no JSON-LD reports exactly that and stops', () => {
  assert.deepEqual(run('jsonld-syntax', page('')), ['jsonld-none']);
});

test('an empty block is reported and does not stop the other blocks being read', () => {
  const ids = run('jsonld-syntax', page(ld('') + node({ '@type': 'WebPage', name: 'A' }) + node({ '@type': 'WebPage', name: 'A' })));
  assert.ok(ids.includes('jsonld-empty-block'));
  assert.ok(ids.includes('jsonld-duplicate-entity'), 'the valid blocks were still compared');
});

test('a block containing only whitespace is empty rather than unparseable', () => {
  assert.deepEqual(run('jsonld-syntax', page(ld('   \n  '))), ['jsonld-empty-block']);
});

test('an unparseable block names the block and says the whole block is lost', () => {
  const problems = runFull('jsonld-syntax', page(ld('{"@type":"WebPage","name":')));
  assert.deepEqual(problems.map((p) => p.id), ['jsonld-unparseable']);
  assert.match(problems[0].message, /block 1/);
  assert.match(problems[0].message, /discarded/);
});

test('the block number counts from one, not from zero', () => {
  const problems = runFull('jsonld-syntax', page(node({ '@type': 'WebPage', name: 'A' }) + ld('{broken')));
  assert.match(problems.find((p) => p.id === 'jsonld-unparseable').message, /block 2/);
});

test('HTML entities inside a block are reported as something having escaped it', () => {
  const problems = runFull('jsonld-syntax', page(ld('{"@type":"WebPage","name":"Acme &quot;Holdings&quot;"}')));
  assert.ok(problems.some((p) => p.id === 'jsonld-html-escaped'));
});

test('an ampersand in a name is not an escaped block', () => {
  assert.deepEqual(run('jsonld-syntax', page(node({ '@type': 'WebPage', name: 'Acme & Sons' }))), []);
});

test('the same named entity declared twice is reported with its name', () => {
  const problems = runFull('jsonld-syntax', page(graph([
    { '@type': 'Organization', name: 'Acme' },
    { '@type': 'Organization', name: 'Acme' },
  ])));
  assert.deepEqual(problems.map((p) => p.id), ['jsonld-duplicate-entity']);
  assert.match(problems[0].message, /Acme/);
});

test('two different anonymous nodes of one type are not a duplicate', () => {
  // Regression. Both of these have no name and no @id, so an earlier version
  // gave them the same signature and reported one entity declared twice.
  assert.deepEqual(
    run('jsonld-syntax', page(graph([
      { '@type': 'ImageObject', contentUrl: 'https://example.com/1.jpg' },
      { '@type': 'ImageObject', contentUrl: 'https://example.com/2.jpg' },
    ]))),
    []
  );
});

test('two entities of one type with different names are not a duplicate', () => {
  assert.deepEqual(
    run('jsonld-syntax', page(graph([
      { '@type': 'Organization', name: 'Acme' },
      { '@type': 'Organization', name: 'Acme Logistics' },
    ]))),
    []
  );
});

// -------------------------------------------------------------------- graph

test('one entity with an @id, referenced rather than repeated, is clean', () => {
  assert.deepEqual(
    run('jsonld-graph', page(graph([
      { '@type': 'Organization', '@id': 'https://example.com/#org', name: 'Acme' },
      { '@type': 'WebPage', '@id': 'https://example.com/a#page', publisher: { '@id': 'https://example.com/#org' } },
    ]))),
    []
  );
});

test('an entity with no @id is reported as unreferenceable', () => {
  const problems = runFull('jsonld-graph', page(node({ '@type': 'Organization', name: 'Acme' })));
  assert.deepEqual(problems.map((p) => p.id), ['jsonld-entity-without-id']);
  assert.match(problems[0].message, /reference/);
});

test('two nodes sharing an @id are reported', () => {
  assert.ok(
    run('jsonld-graph', page(graph([
      { '@type': 'Organization', '@id': 'https://example.com/#org', name: 'Acme' },
      { '@type': 'Organization', '@id': 'https://example.com/#org', name: 'Acme Group' },
    ]))).includes('jsonld-duplicate-id')
  );
});

test('an inlined entity is reported and names the property it was found under', () => {
  const problems = runFull('jsonld-graph', page(node({
    '@type': 'WebPage',
    '@id': 'https://example.com/a#page',
    publisher: { '@type': 'Organization', name: 'Acme', url: 'https://example.com/' },
  })));
  const hit = problems.find((p) => p.id === 'jsonld-inlined-entity');
  assert.ok(hit);
  assert.match(hit.message, /publisher/);
});

test('a two-key typed reference is a reference, not an inlined entity', () => {
  assert.deepEqual(
    run('jsonld-graph', page(graph([
      { '@type': 'Organization', '@id': 'https://example.com/#org', name: 'Acme' },
      { '@type': 'WebPage', '@id': 'https://example.com/a#page', publisher: { '@type': 'Organization', '@id': 'https://example.com/#org' } },
    ]))),
    []
  );
});

test('a reference to an @id nothing defines is reported', () => {
  const problems = runFull('jsonld-graph', page(node({
    '@type': 'WebPage',
    '@id': 'https://example.com/a#page',
    publisher: { '@id': 'https://example.com/#org' },
  })));
  assert.deepEqual(problems.map((p) => p.id), ['jsonld-dangling-reference']);
  assert.match(problems[0].message, /never defined/);
});

test('a block that does not parse stops the graph check rather than half-running it', () => {
  assert.deepEqual(run('jsonld-graph', page(ld('{broken'))), ['jsonld-unparseable']);
});

// --------------------------------------------------------------- breadcrumbs

const trail = (pageUrl, items) =>
  page(
    `<meta property="og:url" content="${pageUrl}">` +
      node({ '@type': 'BreadcrumbList', itemListElement: items })
  );

const item = (position, name, url) => ({ position, name, item: url });

test('a trail that matches its URL and its depth is clean', () => {
  assert.deepEqual(
    run('jsonld-breadcrumb', trail('https://example.com/guides/seo', [
      item(1, 'Home', 'https://example.com/'),
      item(2, 'Guides', 'https://example.com/guides'),
      item(3, 'SEO', 'https://example.com/guides/seo'),
    ])),
    []
  );
});

test('a page with no trail reports exactly that', () => {
  assert.deepEqual(run('jsonld-breadcrumb', page('<meta property="og:url" content="https://example.com/a">')), ['breadcrumb-missing']);
});

test('positions that are not one to n are reported with both sequences', () => {
  const problems = runFull('jsonld-breadcrumb', trail('https://example.com/a', [
    item(1, 'Home', 'https://example.com/'),
    item(3, 'A', 'https://example.com/a'),
  ]));
  const hit = problems.find((p) => p.id === 'breadcrumb-position-not-sequential');
  assert.ok(hit);
  assert.match(hit.message, /1,3/);
  assert.match(hit.message, /1,2/);
});

test('an item with no name is reported', () => {
  assert.ok(
    run('jsonld-breadcrumb', trail('https://example.com/a', [
      { position: 1, item: 'https://example.com/' },
      item(2, 'A', 'https://example.com/a'),
    ])).includes('breadcrumb-missing-name')
  );
});

test('a name carried on the nested item object is still a name', () => {
  assert.deepEqual(
    run('jsonld-breadcrumb', trail('https://example.com/a', [
      { position: 1, item: { '@id': 'https://example.com/', name: 'Home' } },
      item(2, 'A', 'https://example.com/a'),
    ])),
    []
  );
});

test('a non-final item with no URL is reported, and a final one is not', () => {
  assert.ok(
    run('jsonld-breadcrumb', trail('https://example.com/a', [
      { position: 1, name: 'Home' },
      item(2, 'A', 'https://example.com/a'),
    ])).includes('breadcrumb-missing-item-url')
  );
  // The last item is the current page, and leaving its URL off is an accepted
  // way to write the trail, so it is not a finding on its own.
  const ids = run('jsonld-breadcrumb', trail('https://example.com/a', [
    item(1, 'Home', 'https://example.com/'),
    { position: 2, name: 'A' },
  ]));
  assert.ok(!ids.includes('breadcrumb-missing-item-url'));
});

test('a relative item URL is reported', () => {
  assert.ok(
    run('jsonld-breadcrumb', trail('https://example.com/a', [
      item(1, 'Home', '/'),
      item(2, 'A', 'https://example.com/a'),
    ])).includes('breadcrumb-relative-url')
  );
});

test('a trail that ends on another page is reported, and names both URLs', () => {
  const problems = runFull('jsonld-breadcrumb', trail('https://example.com/a', [
    item(1, 'Home', 'https://example.com/'),
    item(2, 'B', 'https://example.com/b'),
  ]));
  const hit = problems.find((p) => p.id === 'breadcrumb-last-item-not-this-page');
  assert.ok(hit);
  assert.match(hit.message, /example\.com\/b/);
  assert.match(hit.message, /example\.com\/a/);
});

test('a trail shorter than the URL path is reported as a depth mismatch', () => {
  assert.ok(
    run('jsonld-breadcrumb', trail('https://example.com/a/b/c', [
      item(1, 'Home', 'https://example.com/'),
      item(2, 'C', 'https://example.com/a/b/c'),
    ])).includes('breadcrumb-depth-mismatch')
  );
});

test('the page URL is taken from the canonical when there is no og:url', () => {
  const body = page(
    '<link rel="canonical" href="https://example.com/a">' +
      node({ '@type': 'BreadcrumbList', itemListElement: [item(1, 'Home', 'https://example.com/'), item(2, 'A', 'https://example.com/a')] })
  );
  assert.deepEqual(run('jsonld-breadcrumb', body), []);
});

test('with no page URL at all, the trail is checked for what can be checked', () => {
  // No og:url and no canonical means there is nothing to compare the trail
  // against, so the comparisons are skipped rather than guessed at.
  const body = page(node({ '@type': 'BreadcrumbList', itemListElement: [item(1, 'Home', 'https://example.com/'), item(2, 'A', 'https://example.com/a')] }));
  assert.deepEqual(run('jsonld-breadcrumb', body), []);
});

test('an item URL given as a nested @id is read the same as a string', () => {
  assert.deepEqual(
    run('jsonld-breadcrumb', trail('https://example.com/a', [
      { position: 1, name: 'Home', item: { '@id': 'https://example.com/' } },
      { position: 2, name: 'A', item: { '@id': 'https://example.com/a' } },
    ])),
    []
  );
});
