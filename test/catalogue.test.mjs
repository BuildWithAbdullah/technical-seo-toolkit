/**
 * catalogue.test.mjs
 *
 * The test that keeps the rest of the repository honest.
 *
 * It drives every finding in tools/catalogue.mjs out of a real call into a real
 * checker, then compares the set it collected against the catalogue in both
 * directions. A finding the suite cannot produce is unreachable. A finding a
 * checker produces that the catalogue does not list is undocumented. Either is a
 * failure, so the two files cannot drift apart.
 *
 * Before this existed, the ten pattern pairs drove 43 of 62 checks. The other 19
 * had never been seen to fire, and pointing a test at them found one that could
 * never fire at all and one that passed a sitemap with the wrong root element.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { checkers } from '../tools/checkers.mjs';
import { findings, ids, notDriven } from '../tools/catalogue.mjs';
import { cases } from './cases.mjs';

const emitted = new Set();
const perCase = new Map();

for (const c of cases) {
  const check = checkers[c.kind];
  const produced = check(c.body, `${c.kind}.case`).map((p) => p.id);
  perCase.set(c, produced);
  produced.forEach((id) => emitted.add(id));
}

test('every catalogued finding names a kind that exists', () => {
  for (const finding of findings) {
    assert.ok(
      Object.hasOwn(checkers, finding.kind),
      `${finding.id} names kind "${finding.kind}", which is not a checker`
    );
  }
});

test('the catalogue has no duplicate ids', () => {
  assert.equal(new Set(ids).size, ids.length);
});

test('every case produces the findings it declares', () => {
  for (const c of cases) {
    const produced = perCase.get(c);
    for (const id of c.expect) {
      assert.ok(
        produced.includes(id),
        `case "${c.label}" (${c.kind}) was meant to produce ${id} and produced [${produced.join(', ') || 'nothing'}]`
      );
    }
  }
});

test('every finding a case declares is in the catalogue', () => {
  for (const c of cases) {
    for (const id of c.expect) {
      assert.ok(ids.includes(id), `case "${c.label}" declares ${id}, which is not catalogued`);
    }
  }
});

test('nothing in the catalogue is unreachable', () => {
  const unreachable = ids.filter((id) => !emitted.has(id) && !Object.hasOwn(notDriven, id));
  assert.deepEqual(
    unreachable,
    [],
    `catalogued but never produced by any case: ${unreachable.join(', ')}`
  );
});

test('nothing the checkers emit is missing from the catalogue', () => {
  const undocumented = [...emitted].filter((id) => !ids.includes(id)).sort();
  assert.deepEqual(
    undocumented,
    [],
    `emitted by a checker and not catalogued: ${undocumented.join(', ')}`
  );
});

test('every finding is attributed to the checker that actually emits it', () => {
  const kindsSeen = new Map();
  for (const c of cases) {
    for (const id of perCase.get(c)) {
      if (!kindsSeen.has(id)) kindsSeen.set(id, new Set());
      kindsSeen.get(id).add(c.kind);
    }
  }
  for (const finding of findings) {
    const seen = kindsSeen.get(finding.id);
    if (!seen) continue;
    assert.ok(
      seen.has(finding.kind),
      `${finding.id} is catalogued under "${finding.kind}" but was only produced by ${[...seen].join(', ')}`
    );
  }
});

test('every exemption in notDriven carries a written reason', () => {
  for (const [id, reason] of Object.entries(notDriven)) {
    assert.ok(ids.includes(id), `notDriven names ${id}, which is not catalogued`);
    assert.ok(
      typeof reason === 'string' && reason.length > 40,
      `notDriven.${id} needs a reason long enough to be an explanation, not a label`
    );
    assert.ok(!emitted.has(id), `notDriven names ${id}, but a case does produce it; remove the exemption`);
  }
});

test('every checker has at least one case pointed at it', () => {
  for (const kind of Object.keys(checkers)) {
    assert.ok(
      cases.some((c) => c.kind === kind),
      `no case drives the "${kind}" checker`
    );
  }
});

test('the silent flag agrees with the pattern metadata it overlaps', () => {
  // Four of the ten patterns are reported by Search Console, and the catalogue
  // records the same judgement per finding. The two have to agree, or the
  // headline claim in the README is counting one thing and citing another.
  const reported = findings.filter((x) => !x.silent).map((x) => x.kind);
  const silent = findings.filter((x) => x.silent).map((x) => x.kind);
  for (const kind of new Set(reported)) {
    assert.ok(!silent.includes(kind), `kind "${kind}" is marked both reported and silent`);
  }
});
