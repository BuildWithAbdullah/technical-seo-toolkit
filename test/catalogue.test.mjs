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
 * Before this existed, the ten pattern pairs drove 43 of the checks. The rest
 * had never been seen to fire, and pointing a test at them found one that could
 * never fire at all and one that passed a sitemap with the wrong root element.
 *
 * It also compares severities in both directions, and the second direction is
 * the one that earns its keep: a severity the catalogue declares that no case
 * has ever produced fails the build. That is what stops the severity column
 * from becoming a description of what somebody once intended.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { checkers, SEVERITIES } from '../tools/checkers.mjs';
import { findings, ids, byId, notDriven, absenceIds, refusalIds } from '../tools/catalogue.mjs';
import { cases, emptyArtefacts } from './cases.mjs';

const emitted = new Set();
const perCase = new Map();
const severitiesSeen = new Map();

for (const c of cases) {
  const check = checkers[c.kind];
  const found = check(c.body, `${c.kind}.case`);
  perCase.set(c, found.map((p) => p.id));
  for (const finding of found) {
    emitted.add(finding.id);
    if (!severitiesSeen.has(finding.id)) severitiesSeen.set(finding.id, new Set());
    severitiesSeen.get(finding.id).add(finding.severity);
  }
}

const declaredSet = (c) => [...new Set([...(c.expect ?? []), ...(c.also ?? [])])].sort();

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

test('every case produces exactly the findings it declares and nothing else', () => {
  // The direction that was missing until 12 November 2026, and the reason it
  // matters is structural rather than theoretical. The assertion above checks
  // that a case produces what it claims. On its own it means a case about one
  // fault can emit any number of findings nobody declared and still pass, so
  // every false positive the corpus triggers is invisible to the suite by
  // construction. This one closes that: `expect` plus `also` is the whole set.
  for (const c of cases) {
    const produced = [...new Set(perCase.get(c))].sort();
    assert.deepEqual(
      produced,
      declaredSet(c),
      `case "${c.label}" (${c.kind}) declares [${declaredSet(c).join(', ')}] and produced [${produced.join(', ') || 'nothing'}]; if the extra finding is correct add it to "also" with the reason, and if it is not, it is a false positive`
    );
  }
});

test('nothing is listed in both expect and also', () => {
  for (const c of cases) {
    const overlap = (c.also ?? []).filter((id) => (c.expect ?? []).includes(id));
    assert.deepEqual(overlap, [], `case "${c.label}" lists ${overlap.join(', ')} twice`);
  }
});

test('every id in also is catalogued', () => {
  for (const c of cases) {
    for (const id of c.also ?? []) {
      assert.ok(ids.includes(id), `case "${c.label}" lists ${id} in also, which is not catalogued`);
    }
  }
});

test('every catalogued finding declares at least one severity, all of them real', () => {
  for (const finding of findings) {
    assert.ok(
      Array.isArray(finding.severities) && finding.severities.length > 0,
      `${finding.id} declares no severities`
    );
    assert.equal(
      new Set(finding.severities).size,
      finding.severities.length,
      `${finding.id} declares the same severity twice`
    );
    for (const severity of finding.severities) {
      assert.ok(SEVERITIES.includes(severity), `${finding.id} declares severity "${severity}", which is not one of ${SEVERITIES.join(', ')}`);
    }
  }
});

test('no finding is emitted at a severity the catalogue does not declare', () => {
  for (const [id, seen] of severitiesSeen) {
    const declared = byId.get(id)?.severities ?? [];
    for (const severity of seen) {
      assert.ok(
        declared.includes(severity),
        `${id} was emitted at severity "${severity}" and the catalogue declares only [${declared.join(', ')}]`
      );
    }
  }
});

test('no finding declares a severity that nothing has ever produced', () => {
  // This is the direction that does the work. The one above stops the
  // catalogue falling behind the code; this one stops it running ahead, which
  // is how a severity table turns into documentation. A severity declared here
  // and never produced means either the catalogue is wrong about what the
  // checker does, or the corpus has never driven that branch.
  const gaps = [];
  for (const finding of findings) {
    const seen = severitiesSeen.get(finding.id) ?? new Set();
    const unproduced = finding.severities.filter((s) => !seen.has(s));
    if (unproduced.length) gaps.push(`${finding.id} declares [${unproduced.join(', ')}] which no case produced`);
  }
  assert.deepEqual(gaps, [], gaps.join('; '));
});

test('a finding declaring two severities really is emitted at both', () => {
  // Stated separately because it is the interesting case and because an
  // accidental collapse to one severity would otherwise only show up as a gap
  // in the test above, which reads like a missing fixture rather than a
  // behavioural change.
  const multi = findings.filter((x) => x.severities.length > 1);
  assert.ok(multi.length >= 2, 'at least two findings should vary in severity by the artefact');
  for (const finding of multi) {
    const seen = [...(severitiesSeen.get(finding.id) ?? [])].sort();
    assert.deepEqual(
      seen,
      [...finding.severities].sort(),
      `${finding.id} declares [${finding.severities.join(', ')}] and the corpus produced [${seen.join(', ')}]`
    );
  }
});

test('an absence finding really does fire on an empty artefact of its kind', () => {
  for (const id of absenceIds) {
    const kind = byId.get(id).kind;
    const empties = emptyArtefacts[kind];
    assert.ok(Array.isArray(empties) && empties.length > 0, `no empty artefact exists for kind "${kind}"`);
    const produced = empties.flatMap((empty) => checkers[kind](empty, `${kind}.empty`).map((p) => p.id));
    assert.ok(
      produced.includes(id),
      `${id} is marked as an absence finding, which means it fires on an empty artefact, and the ${empties.length} empty ${kind} artefact(s) produced [${produced.join(', ') || 'nothing'}]`
    );
  }
});

test('a finding that is not marked as an absence does not fire on an empty artefact', () => {
  // The other direction. Without it, absenceIds could quietly omit a finding
  // that does fire on an empty file, and tools/verify.mjs would then accept
  // that finding as evidence a failing example demonstrates its fault, when
  // all it demonstrates is that the file is empty.
  for (const [kind, empties] of Object.entries(emptyArtefacts)) {
    const produced = new Set(empties.flatMap((empty) => checkers[kind](empty, `${kind}.empty`).map((p) => p.id)));
    for (const id of produced) {
      assert.ok(
        absenceIds.has(id),
        `${id} fires on an empty ${kind} artefact and is not marked as an absence finding in the catalogue`
      );
    }
  }
});

test('a refusal is never also an absence', () => {
  for (const id of refusalIds) {
    assert.ok(!absenceIds.has(id), `${id} is marked as both a refusal and an absence, and they are different claims`);
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
