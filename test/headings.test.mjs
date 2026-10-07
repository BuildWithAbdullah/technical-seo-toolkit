/**
 * headings.test.mjs
 *
 * Heading structure is the one pattern in this repository that is equally an
 * accessibility requirement, and the only one with a finding that is openly a
 * heuristic. Both facts are tested: the rules are exact, and the heuristic is
 * pinned to a threshold so that changing it is a visible decision.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { run, runFull, page } from './helpers.mjs';

const doc = (body) => page('', body);

test('a well-formed outline is clean', () => {
  assert.deepEqual(run('headings', doc('<h1>Title</h1><h2>One</h2><h3>Detail</h3><h2>Two</h2>')), []);
});

test('no h1 is reported, and a document that starts at h2 is not a skipped level', () => {
  // The outline is read in document order from the first heading present. A page
  // that opens at h2 has one fault, not two, and reporting a skipped level as
  // well would send the reader looking for a heading that is not there.
  assert.deepEqual(run('headings', doc('<h2>One</h2><h3>Detail</h3>')), ['heading-no-h1']);
});

test('more than one h1 is reported with the count', () => {
  const problems = runFull('headings', doc('<h1>A</h1><h1>B</h1><h1>C</h1>'));
  assert.deepEqual(problems.map((p) => p.id), ['heading-multiple-h1']);
  assert.match(problems[0].message, /3/);
});

test('a skipped level is reported and names both levels', () => {
  const problems = runFull('headings', doc('<h1>Title</h1><h4>Detail</h4>'));
  assert.deepEqual(problems.map((p) => p.id), ['heading-skipped-level']);
  assert.match(problems[0].message, /h1/);
  assert.match(problems[0].message, /h4/);
});

test('coming back up the outline is not a skipped level', () => {
  // h3 followed by h2 is a new section, not a fault. Only going down by more
  // than one is.
  assert.deepEqual(run('headings', doc('<h1>T</h1><h2>A</h2><h3>A1</h3><h2>B</h2>')), []);
});

test('a heading holding only whitespace is empty', () => {
  assert.deepEqual(run('headings', doc('<h1>Title</h1><h2>   </h2>')), ['heading-empty']);
});

test('a heading whose text comes from a nested element is not empty', () => {
  assert.deepEqual(run('headings', doc('<h1><span>Title</span></h1>')), []);
});

test('the body-copy heuristic fires above its threshold and not below it', () => {
  const short = 'x'.repeat(160);
  const long = 'x'.repeat(161);
  assert.deepEqual(run('headings', doc(`<h1>${short}</h1>`)), [], '160 characters is the documented limit');
  assert.deepEqual(run('headings', doc(`<h1>${long}</h1>`)), ['heading-used-for-styling']);
});

test('the body-copy finding reports the length it saw', () => {
  const problems = runFull('headings', doc(`<h1>${'x'.repeat(200)}</h1>`));
  assert.match(problems[0].message, /200/);
});

test('a document with no headings at all reports only the missing h1', () => {
  assert.deepEqual(run('headings', doc('<p>Copy</p>')), ['heading-no-h1']);
});
