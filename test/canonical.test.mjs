/**
 * canonical.test.mjs
 *
 * The canonical checker reads every canonical in the head rather than the first
 * one, which is the behaviour that matters: the fault in production is almost
 * always a plugin appending a second tag to a head that was already correct, so
 * a checker that read element zero would report the hand-written tag and miss
 * the one causing the problem.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { run, runFull, page } from './helpers.mjs';

const canon = (href, extra = '') => page(`<link rel="canonical" href="${href}">${extra}`);

test('a single absolute https canonical is clean', () => {
  assert.deepEqual(run('canonical', canon('https://example.com/a')), []);
});

test('a canonical with a trailing slash difference against og:url is not a mismatch', () => {
  // trimSlash exists so that /a and /a/ are the same address, because they
  // nearly always are and reporting it would bury the real mismatches.
  assert.deepEqual(
    run('canonical', canon('https://example.com/a/', '<meta property="og:url" content="https://example.com/a">')),
    []
  );
});

test('a missing canonical short-circuits the rest of the checks', () => {
  // Reporting six consequences of one absence is noise. The absence is the
  // finding, and it is the only one.
  assert.deepEqual(run('canonical', page('')), ['canonical-missing']);
});

test('a second canonical in the head is reported even when the first is correct', () => {
  const ids = run('canonical', page(
    '<link rel="canonical" href="https://example.com/a"><link rel="canonical" href="/a">'
  ));
  assert.ok(ids.includes('canonical-multiple'));
  assert.ok(ids.includes('canonical-relative'), 'the appended relative tag is the fault being looked for');
});

test('a canonical in the body is distinguished from one in the head', () => {
  assert.deepEqual(
    run('canonical', page('', '<p>Copy</p><link rel="canonical" href="https://example.com/a">')),
    ['canonical-outside-head']
  );
});

test('an http canonical is reported as naming a URL that only redirects', () => {
  const problems = runFull('canonical', canon('http://example.com/a'));
  assert.deepEqual(problems.map((p) => p.id), ['canonical-non-https']);
  assert.match(problems[0].message, /redirect/);
});

test('campaign parameters on the canonical are reported', () => {
  for (const q of ['utm_source=x', 'gclid=abc', 'fbclid=abc', 'msclkid=abc', 'mc_eid=abc']) {
    assert.ok(
      run('canonical', canon(`https://example.com/a?${q}`)).includes('canonical-tracking-params'),
      `${q} should be recognised as a campaign parameter`
    );
  }
});

test('an ordinary query string is not a campaign parameter', () => {
  assert.deepEqual(run('canonical', canon('https://example.com/search?page=2')), []);
});

test('og:url is only compared against a canonical that can be compared', () => {
  // A relative canonical has already been reported. Comparing it to og:url
  // would add a second finding that says the same thing less clearly.
  assert.deepEqual(
    run('canonical', page('<link rel="canonical" href="/a"><meta property="og:url" content="https://example.com/b">')),
    ['canonical-relative']
  );
});

test('a disagreement between og:url and the canonical names both URLs', () => {
  const problems = runFull('canonical', canon('https://example.com/a', '<meta property="og:url" content="https://example.com/b">'));
  assert.deepEqual(problems.map((p) => p.id), ['canonical-og-url-mismatch']);
  assert.match(problems[0].message, /example\.com\/a/);
  assert.match(problems[0].message, /example\.com\/b/);
});
