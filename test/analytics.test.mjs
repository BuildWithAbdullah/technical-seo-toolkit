/**
 * analytics.test.mjs
 *
 * This checker reads the serialized document rather than the DOM, because the
 * ids it looks for live in inline script bodies, in comments left by tag
 * managers, and in attributes. The tests cover all three, and the controls
 * matter more here than anywhere else: an id pattern that matches too eagerly
 * turns a measurement check into noise.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { run, runFull, page } from './helpers.mjs';

test('one GA4 property and one container is clean', () => {
  assert.deepEqual(
    run('analytics', page('<script src="https://www.googletagmanager.com/gtag/js?id=G-AAAAAA111"></script><script>gtag("config","G-AAAAAA111");</script>')),
    []
  );
});

test('a Universal Analytics id is reported wherever it appears', () => {
  for (const body of [
    page('<script>ga("create","UA-123456-1","auto");</script>'),
    page('', '<!-- legacy tag UA-123456-1 left in place -->'),
    page('<meta name="analytics" content="UA-123456-1">'),
  ]) {
    assert.ok(run('analytics', body).includes('analytics-legacy-ua'));
  }
});

test('the Universal Analytics finding lists the ids it found, once each', () => {
  const problems = runFull('analytics', page('<script>ga("create","UA-123456-1");ga("create","UA-123456-1");</script>'));
  const message = problems.find((p) => p.id === 'analytics-legacy-ua').message;
  assert.equal(message.match(/UA-123456-1/g).length, 1, 'a repeated id is one id, not two');
});

test('two distinct GA4 ids on one page are reported', () => {
  const problems = runFull('analytics', page('<script>gtag("config","G-AAAAAA111");gtag("config","G-BBBBBB222");</script>'));
  const hit = problems.find((p) => p.id === 'analytics-multiple-ga4-properties');
  assert.ok(hit);
  assert.match(hit.message, /G-AAAAAA111/);
  assert.match(hit.message, /G-BBBBBB222/);
});

test('the same GA4 id written twice is one property', () => {
  const ids = run('analytics', page('<script src="https://www.googletagmanager.com/gtag/js?id=G-AAAAAA111"></script><script>gtag("config","G-AAAAAA111");</script>'));
  assert.ok(!ids.includes('analytics-multiple-ga4-properties'));
});

test('a container id is not mistaken for a GA4 property', () => {
  // GTM- and G- overlap enough that a careless pattern reads one as the other,
  // which would report every site with a tag manager as having two properties.
  const ids = run('analytics', page('<script>/* GTM-AAAA111 */ gtag("config","G-AAAAAA111");</script>'));
  assert.deepEqual(ids, []);
});

test('two containers on one page are reported', () => {
  assert.ok(
    run('analytics', page('<script>/* GTM-AAAA111 */</script><script>/* GTM-BBBB222 */</script>')).includes('analytics-multiple-gtm-containers')
  );
});

test('a repeated gtag config is reported as double counting', () => {
  const problems = runFull('analytics', page('<script>gtag("config","G-AAAAAA111");</script><script>gtag("config","G-AAAAAA111");</script>'));
  const hit = problems.find((p) => p.id === 'analytics-duplicate-config');
  assert.ok(hit);
  assert.match(hit.message, /double count/);
});

test('two different configs are two properties, not a duplicate config', () => {
  const ids = run('analytics', page('<script>gtag("config","G-AAAAAA111");gtag("config","G-BBBBBB222");</script>'));
  assert.ok(ids.includes('analytics-multiple-ga4-properties'));
  assert.ok(!ids.includes('analytics-duplicate-config'));
});

test('single quotes and spacing in the gtag call are read the same way', () => {
  assert.ok(
    run('analytics', page("<script>gtag( 'config' , 'G-AAAAAA111' );gtag('config','G-AAAAAA111');</script>")).includes('analytics-duplicate-config')
  );
});

test('a page with no measurement on it at all is clean', () => {
  assert.deepEqual(run('analytics', page('', '<h1>Copy</h1>')), []);
});
