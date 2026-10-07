/**
 * hreflang.test.mjs
 *
 * hreflang is checked over a cluster manifest rather than a single page, because
 * the rule that actually matters is reciprocity and it is invisible from one
 * document. A checker that read one page would pass a completely broken site.
 *
 * Two of these tests exist because the checker was wrong. The language value
 * pattern rejected script subtags, so a correctly built Chinese cluster was
 * reported as broken, and the message for an invalid value blamed a country code
 * for every malformed value including the ones that were nothing of the kind.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { run, runFull, cluster, validCluster } from './helpers.mjs';

test('a reciprocal, self-referencing cluster is clean', () => {
  assert.deepEqual(run('hreflang', validCluster()), []);
});

test('a language-region value is accepted', () => {
  assert.deepEqual(run('hreflang', validCluster('en-GB', 'pt-BR')), []);
});

test('a script subtag is accepted', () => {
  // Regression. zh-Hant and zh-Hant-TW are correct values. The earlier pattern
  // was language plus optional region only, so every Chinese cluster built the
  // right way was reported as using an invalid code.
  assert.deepEqual(run('hreflang', validCluster('zh-Hant', 'zh-Hans')), []);
  assert.deepEqual(run('hreflang', validCluster('zh-Hant-TW', 'zh-Hans-CN')), []);
});

test('a three-letter language code is accepted', () => {
  assert.deepEqual(run('hreflang', validCluster('fil', 'en')), []);
});

test('a bare country code is reported, and the message says why', () => {
  const problems = runFull('hreflang', cluster([
    ['https://example.com/a/', [['en', 'https://example.com/a/'], ['GB', 'https://example.com/a/']]],
  ]));
  const hit = problems.find((p) => p.id === 'hreflang-invalid-code');
  assert.ok(hit);
  assert.match(hit.message, /country code/);
});

test('a malformed value that is not a country code is not described as one', () => {
  // Regression. The branch tested for two letters in either case, so en_GB and
  // English both came back as "that is a country code", which sends the reader
  // to the wrong fix.
  const problems = runFull('hreflang', cluster([
    ['https://example.com/a/', [['en', 'https://example.com/a/'], ['en_GB', 'https://example.com/a/']]],
  ]));
  const hit = problems.find((p) => p.id === 'hreflang-invalid-code');
  assert.ok(hit);
  assert.doesNotMatch(hit.message, /country code/);
});

test('x-default is exempt from the value pattern and from reciprocity', () => {
  assert.deepEqual(
    run('hreflang', cluster([
      ['https://example.com/a/', [['en', 'https://example.com/a/'], ['x-default', 'https://example.com/'], ['de', 'https://example.com/b/']]],
      ['https://example.com/b/', [['de', 'https://example.com/b/'], ['en', 'https://example.com/a/']]],
    ])),
    []
  );
});

test('a page that omits itself is reported', () => {
  assert.ok(
    run('hreflang', cluster([
      ['https://example.com/a/', [['de', 'https://example.com/b/']]],
      ['https://example.com/b/', [['de', 'https://example.com/b/'], ['en', 'https://example.com/a/']]],
    ])).includes('hreflang-missing-self')
  );
});

test('a one-directional link is reported against the page that makes it', () => {
  const problems = runFull('hreflang', cluster([
    ['https://example.com/a/', [['en', 'https://example.com/a/'], ['de', 'https://example.com/b/']]],
    ['https://example.com/b/', [['de', 'https://example.com/b/']]],
  ]));
  assert.deepEqual(problems.map((p) => p.id), ['hreflang-not-reciprocal']);
  assert.match(problems[0].message, /example\.com\/a\/ points at https:\/\/example\.com\/b\//);
});

test('one value mapped to two URLs is reported', () => {
  assert.ok(
    run('hreflang', cluster([
      ['https://example.com/a/', [['en', 'https://example.com/a/'], ['en', 'https://example.com/c/']]],
      ['https://example.com/c/', [['en-GB', 'https://example.com/c/'], ['en', 'https://example.com/a/']]],
    ])).includes('hreflang-duplicate-code')
  );
});

test('the same value repeated with the same URL is not a duplicate', () => {
  // A template that renders the self reference twice is untidy and not a fault.
  assert.deepEqual(
    run('hreflang', cluster([
      ['https://example.com/a/', [['en', 'https://example.com/a/'], ['en', 'https://example.com/a/'], ['de', 'https://example.com/b/']]],
      ['https://example.com/b/', [['de', 'https://example.com/b/'], ['en', 'https://example.com/a/']]],
    ])),
    []
  );
});

test('an alternate outside the cluster is reported as dangling, not as unreciprocated', () => {
  const ids = run('hreflang', cluster([
    ['https://example.com/a/', [['en', 'https://example.com/a/'], ['fr', 'https://example.com/fr/']]],
  ]));
  assert.deepEqual(ids, ['hreflang-dangling-target']);
});

test('a relative alternate href is reported', () => {
  assert.ok(
    run('hreflang', cluster([
      ['https://example.com/a/', [['en', 'https://example.com/a/'], ['de', '/b/']]],
    ])).includes('hreflang-relative')
  );
});

test('an empty cluster is clean rather than an error', () => {
  assert.deepEqual(run('hreflang', JSON.stringify({ pages: [] })), []);
});
