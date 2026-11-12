/**
 * limits.test.mjs
 *
 * Every limit declared in tools/limits.mjs, asserted in both directions.
 *
 * The blind half says a checker cannot see something. On its own that is
 * indistinguishable from a checker that does not work, so the contrast half
 * runs the same checker over a nearly identical artefact and requires it to
 * speak. Silence is evidence of a blind spot only once the same code has been
 * shown to fire.
 *
 * Two limits are refusals rather than silences: the checker reports that it was
 * given no input for a rule and therefore did not run it. Those entries name
 * the refusal, and the ids in `absent` are still forbidden, because an honest
 * refusal must not be mistakable for the limit having been fixed.
 *
 * Two others manufacture a finding instead of hiding one, and name it in
 * `expectWrongly`. Those are the uncomfortable entries: the checker is
 * confidently wrong about the artefact, the manifest says so out loud, and the
 * test holds it to that. If the checker ever stops being wrong there, the test
 * fails and the claim has to be rewritten.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { checkers, SEVERITIES } from '../tools/checkers.mjs';
import { ids, refusalIds } from '../tools/catalogue.mjs';
import { limits, limitIds } from '../tools/limits.mjs';

const run = (kind, body) => checkers[kind](body, `${kind}.limit`);

test('every limit names a checker that exists and a prose explanation', () => {
  for (const limit of limits) {
    assert.ok(Object.hasOwn(checkers, limit.kind), `limit ${limit.id} names kind "${limit.kind}", which is not a checker`);
    assert.ok(limit.what.length > 180, `limit ${limit.id} needs an explanation rather than a label`);
    assert.ok(limit.title.length > 20, `limit ${limit.id} needs a title`);
    assert.ok(Array.isArray(limit.absent), `limit ${limit.id} declares no absent list`);
  }
});

test('limit ids are unique', () => {
  assert.equal(new Set(limitIds).size, limitIds.length);
});

test('every limit covers at least one checker and between them they cover all ten', () => {
  const covered = new Set(limits.map((l) => l.kind));
  assert.deepEqual([...covered].sort(), Object.keys(checkers).sort());
});

test('the blind artefact of every limit emits none of the ids the limit forbids', () => {
  for (const limit of limits) {
    const produced = run(limit.kind, limit.blind).map((f) => f.id);
    for (const prefix of limit.absent) {
      const breached = produced.filter((id) => id.startsWith(prefix));
      assert.deepEqual(
        breached,
        [],
        `limit ${limit.id} forbids ids starting "${prefix}" on its blind artefact and the checker emitted [${breached.join(', ')}]; either the checker learned to see this and the limit is now false, or the artefact is wrong`
      );
    }
  }
});

test('the contrast artefact of every limit makes the same checker speak', () => {
  for (const limit of limits) {
    if (limit.contrastExpect === null) continue;
    const produced = run(limit.kind, limit.contrast).map((f) => f.id);
    assert.ok(
      produced.includes(limit.contrastExpect),
      `limit ${limit.id} claims the "${limit.kind}" checker works and only lacks one input, but its contrast artefact did not produce ${limit.contrastExpect}; it produced [${produced.join(', ') || 'nothing'}]`
    );
  }
});

test('a limit whose contrast artefact is declared clean really is clean', () => {
  // Two limits manufacture a finding rather than hiding one, so their contrast
  // artefact is the corrected version and must produce nothing at all. That is
  // a stronger claim than "it produced something", and it is the half that
  // proves the finding in expectWrongly is caused by the limit rather than by
  // the artefact being broken in some other way.
  const clean = limits.filter((l) => l.contrastExpect === null);
  assert.ok(clean.length >= 2, 'at least two limits should declare a clean contrast artefact');
  for (const limit of clean) {
    const produced = run(limit.kind, limit.contrast).map((f) => f.id);
    assert.deepEqual(
      produced,
      [],
      `limit ${limit.id} declares its contrast artefact clean and the checker emitted [${produced.join(', ')}]`
    );
  }
});

test('a limit that manufactures a finding produces exactly the finding it admits to', () => {
  const wrong = limits.filter((l) => l.expectWrongly);
  assert.ok(wrong.length >= 2, 'at least two limits should be the kind that manufactures a finding');
  for (const limit of wrong) {
    const produced = run(limit.kind, limit.blind).map((f) => f.id);
    assert.ok(
      produced.includes(limit.expectWrongly),
      `limit ${limit.id} admits that its blind artefact is reported as ${limit.expectWrongly}, and it was reported as [${produced.join(', ') || 'nothing'}]`
    );
    assert.ok(ids.includes(limit.expectWrongly), `${limit.expectWrongly} is not catalogued`);
  }
});

test('a limit whose refusal is catalogued produces that refusal on its blind artefact', () => {
  const refusals = limits.filter((l) => l.refusal);
  assert.ok(refusals.length >= 2, 'at least two limits should carry a catalogued refusal');
  for (const limit of refusals) {
    const produced = run(limit.kind, limit.blind).map((f) => f.id);
    assert.ok(
      produced.includes(limit.refusal),
      `limit ${limit.id} declares the refusal ${limit.refusal} and its blind artefact produced [${produced.join(', ') || 'nothing'}]`
    );
    assert.ok(refusalIds.has(limit.refusal), `${limit.refusal} is not marked as a refusal in the catalogue`);
  }
});

test('the refusal does not appear on the contrast artefact, because the input is there', () => {
  // The other direction of the refusal claim. A refusal that fires whatever
  // the input is not a refusal, it is a checker that always complains.
  for (const limit of limits.filter((l) => l.refusal)) {
    const produced = run(limit.kind, limit.contrast).map((f) => f.id);
    assert.ok(
      !produced.includes(limit.refusal),
      `limit ${limit.id} emitted the refusal ${limit.refusal} on its contrast artefact, where the input it says it needs is present`
    );
  }
});

test('every catalogued refusal belongs to a declared limit', () => {
  // Without this, a refusal could be added to the catalogue with nothing
  // explaining which blind spot it is reporting.
  const declared = new Set(limits.filter((l) => l.refusal).map((l) => l.refusal));
  for (const id of refusalIds) {
    assert.ok(declared.has(id), `${id} is catalogued as a refusal and no limit in tools/limits.mjs declares it`);
  }
});

test('every finding a limit artefact produces is catalogued and carries a declared severity', () => {
  for (const limit of limits) {
    for (const body of [limit.blind, limit.contrast]) {
      for (const finding of run(limit.kind, body)) {
        assert.ok(ids.includes(finding.id), `limit ${limit.id} produced uncatalogued ${finding.id}`);
        assert.ok(SEVERITIES.includes(finding.severity), `limit ${limit.id} produced ${finding.id} at severity "${finding.severity}"`);
      }
    }
  }
});
