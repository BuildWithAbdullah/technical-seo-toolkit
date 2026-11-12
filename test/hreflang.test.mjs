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
import { run, runFull, cluster, validCluster, regionalCluster } from './helpers.mjs';

test('a reciprocal, self-referencing cluster is clean', () => {
  assert.deepEqual(run('hreflang', validCluster()), []);
});

test('a language-region value is accepted, in either case, and so is a numeric region', () => {
  // Regression, and the worst false positive this checker has had. hreflang
  // values are not case sensitive: Google says so and BCP 47 says so. The
  // earlier pattern required a lowercase language, a title-case script and an
  // uppercase region exactly, so a correct cluster spelled en-gb was reported
  // as using a value that is not a language, language-script or
  // language-region value, which is false. The same pattern rejected es-419,
  // the standard value for Latin American Spanish, because it only allowed a
  // two letter region and the spec allows a three digit UN M.49 code too.
  //
  // x-default is present in each of these so the cluster is clean. Without it
  // an all-regional cluster correctly reports hreflang-no-x-default, which is
  // a different rule tested on its own below.
  for (const [a, b] of [['en-GB', 'pt-BR'], ['en-gb', 'pt-br'], ['EN-GB', 'PT-BR'], ['es-419', 'es-ES']]) {
    assert.deepEqual(run('hreflang', regionalCluster(a, b)), [], `${a} and ${b} should be accepted`);
  }
});

test('a script subtag is accepted, in either case', () => {
  // Regression. zh-Hant and zh-Hant-TW are correct values. The earlier pattern
  // was language plus optional region only, so every Chinese cluster built the
  // right way was reported as using an invalid code. It then required the
  // script to be title case, so zh-hant was rejected as well.
  assert.deepEqual(run('hreflang', validCluster('zh-Hant', 'zh-Hans')), []);
  assert.deepEqual(run('hreflang', validCluster('zh-hant', 'zh-hans')), []);
  assert.deepEqual(run('hreflang', regionalCluster('zh-Hant-TW', 'zh-Hans-CN')), []);
  assert.deepEqual(run('hreflang', regionalCluster('zh-hant-tw', 'zh-hans-cn')), []);
});

test('a three-letter language code is accepted', () => {
  assert.deepEqual(run('hreflang', validCluster('fil', 'en')), []);
});

test('a bare country code has its own finding, and the message says why', () => {
  // A bare country code is the most common hreflang mistake and it has the
  // shape of a valid language subtag, so it is a different reason rather than
  // a sub-case of an invalid value. It used to share the invalid-code id,
  // which meant the catalogue had one entry covering two faults with two
  // different fixes.
  const problems = runFull('hreflang', cluster([
    ['https://example.com/a/', [['en', 'https://example.com/a/'], ['GB', 'https://example.com/a/']]],
  ]));
  const hit = problems.find((p) => p.id === 'hreflang-region-without-language');
  assert.ok(hit, `expected hreflang-region-without-language, got [${problems.map((p) => p.id).join(', ')}]`);
  assert.match(hit.message, /country code/);
  assert.ok(
    !problems.some((p) => p.id === 'hreflang-invalid-code'),
    'a bare country code is not also reported as an unparseable value'
  );
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
