/**
 * redirects.test.mjs
 *
 * The map is checked as a graph, because every fault worth catching before a
 * migration is a property of the whole map rather than of one rule: a chain, a
 * loop, two rules claiming one source.
 *
 * The hop arithmetic is pinned, because it is the number somebody will quote in
 * a handover document.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { run, runFull } from './helpers.mjs';

const map = (redirects, extra = {}) => JSON.stringify({ redirects, ...extra });

test('a flat map of one-hop permanent redirects is clean', () => {
  assert.deepEqual(
    run('redirects', map([
      { from: '/old-a', to: '/a', status: 301 },
      { from: '/old-b', to: '/b', status: 301 },
    ])),
    []
  );
});

test('308 is accepted as a permanent redirect', () => {
  assert.deepEqual(run('redirects', map([{ from: '/a', to: '/b', status: 308 }])), []);
});

test('a temporary status is reported when the move is permanent', () => {
  for (const status of [302, 303, 307]) {
    assert.ok(
      run('redirects', map([{ from: '/a', to: '/b', status }])).includes('redirect-temporary-for-permanent-move'),
      `${status} should be reported on a permanent move`
    );
  }
});

test('a map that declares itself temporary is not held to 301', () => {
  assert.deepEqual(run('redirects', map([{ from: '/a', to: '/b', status: 302 }], { permanent: false })), []);
});

test('a two-hop chain is reported once, against the rule that starts it', () => {
  const problems = runFull('redirects', map([
    { from: '/a', to: '/b', status: 301 },
    { from: '/b', to: '/c', status: 301 },
  ]));
  assert.deepEqual(problems.map((p) => p.id), ['redirect-chain']);
  assert.match(problems[0].message, /2 hops/);
});

test('the hop count is the number of redirects, not the number of URLs', () => {
  const problems = runFull('redirects', map([
    { from: '/a', to: '/b', status: 301 },
    { from: '/b', to: '/c', status: 301 },
    { from: '/c', to: '/d', status: 301 },
  ]));
  const first = problems.filter((p) => p.id === 'redirect-chain')[0];
  assert.match(first.message, /3 hops/, 'a to b to c to d is three redirects');
  assert.match(first.message, /\/a then \/b then \/c then \/d/);
});

test('a loop terminates the walk rather than hanging', () => {
  const problems = runFull('redirects', map([
    { from: '/a', to: '/b', status: 301 },
    { from: '/b', to: '/a', status: 301 },
  ]));
  assert.ok(problems.some((p) => p.id === 'redirect-loop'));
  assert.ok(!problems.some((p) => p.id === 'redirect-chain'), 'a loop is not also reported as a chain');
});

test('a loop that does not include the first URL is still found', () => {
  assert.ok(
    run('redirects', map([
      { from: '/a', to: '/b', status: 301 },
      { from: '/b', to: '/c', status: 301 },
      { from: '/c', to: '/b', status: 301 },
    ])).includes('redirect-loop')
  );
});

test('a rule pointing at itself is reported once and stops there', () => {
  assert.deepEqual(run('redirects', map([{ from: '/a', to: '/a', status: 301 }])), ['redirect-to-self']);
});

test('two rules for one source are reported', () => {
  assert.deepEqual(
    run('redirects', map([
      { from: '/a', to: '/b', status: 301 },
      { from: '/a', to: '/c', status: 301 },
    ])),
    ['redirect-duplicate-source']
  );
});

test('an absolute target is accepted', () => {
  assert.deepEqual(run('redirects', map([{ from: '/a', to: 'https://example.com/b', status: 301 }])), []);
});

test('a target that is neither absolute nor root-relative is reported', () => {
  assert.deepEqual(run('redirects', map([{ from: '/a', to: 'b', status: 301 }])), ['redirect-relative-target']);
});

test('an empty map is clean', () => {
  assert.deepEqual(run('redirects', map([])), []);
});
