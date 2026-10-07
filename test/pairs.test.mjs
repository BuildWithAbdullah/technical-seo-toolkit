/**
 * pairs.test.mjs
 *
 * The ten pattern pairs, held to a harder standard than tools/verify.mjs holds
 * them to on its own.
 *
 * tools/verify.mjs asks two questions: is the corrected example clean, and does
 * the failing example trigger at least one expected finding. Both are necessary.
 * Neither catches the two ways a pair can be worthless:
 *
 *   A failing example whose only evidence is an absence finding. A page with no
 *   h1 is a failing heading example, and so is a blank document. If the only
 *   finding is heading-no-h1, the example has demonstrated that it is empty.
 *
 *   A corrected example that is clean for its own pattern and carries somebody
 *   else's fault. Ten patterns, six of them reading HTML, and every corrected
 *   page gets copied into a theme by somebody who read one README.
 *
 * So this file adds a third outcome per pair and a cross-check across all of
 * them.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { checkers } from '../tools/checkers.mjs';
import { ids as catalogued } from '../tools/catalogue.mjs';
import { emptyArtefacts, absenceIds, htmlKinds } from './cases.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PATTERNS = path.join(ROOT, 'patterns');

const dirs = (await readdir(PATTERNS, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const patterns = [];
for (const dir of dirs) {
  const base = path.join(PATTERNS, dir);
  const meta = JSON.parse(await readFile(path.join(base, 'meta.json'), 'utf8'));
  const entries = await readdir(base);
  const read = async (prefix) => {
    const name = entries.find((e) => e.startsWith(`${prefix}.`));
    assert.ok(name, `${dir} has no ${prefix}.* file`);
    return { name, body: await readFile(path.join(base, name), 'utf8') };
  };
  patterns.push({ dir, meta, fail: await read('fail'), pass: await read('pass') });
}

test('there is a pattern directory for every pattern the suite expects', () => {
  assert.ok(patterns.length >= 10, `only ${patterns.length} pattern directories found`);
});

test('every corrected example is clean under its own checker', () => {
  for (const { dir, meta, pass } of patterns) {
    const problems = checkers[meta.kind](pass.body, pass.name);
    assert.deepEqual(
      problems.map((p) => p.id),
      [],
      `${dir}/${pass.name} should be clean and reported ${problems.map((p) => `${p.id}: ${p.message}`).join(' | ')}`
    );
  }
});

test('every failing example triggers a finding the pattern declares', () => {
  for (const { dir, meta, fail } of patterns) {
    const produced = checkers[meta.kind](fail.body, fail.name).map((p) => p.id);
    const hit = produced.filter((id) => (meta.expect ?? []).includes(id));
    assert.ok(
      hit.length > 0,
      `${dir}/${fail.name} triggered [${produced.join(', ') || 'nothing'}] and declares [${(meta.expect ?? []).join(', ')}]`
    );
  }
});

test('every failing example triggers evidence that is not merely an absence', () => {
  for (const { dir, meta, fail } of patterns) {
    const produced = checkers[meta.kind](fail.body, fail.name).map((p) => p.id);
    const evidence = produced.filter((id) => (meta.expect ?? []).includes(id) && !absenceIds.has(id));
    assert.ok(
      evidence.length > 0,
      `${dir}/${fail.name} only produced absence findings [${produced.join(', ')}], which an empty artefact would also produce`
    );
  }
});

test('no expected finding fires on an empty artefact unless it reports an absence', () => {
  for (const { dir, meta } of patterns) {
    const empty = emptyArtefacts[meta.kind];
    assert.ok(empty !== undefined, `no empty artefact defined for kind "${meta.kind}"`);
    const produced = checkers[meta.kind](empty, `empty.${meta.kind}`).map((p) => p.id);
    const unexpected = produced.filter((id) => !absenceIds.has(id));
    assert.deepEqual(
      unexpected,
      [],
      `the empty artefact for ${dir} produced [${unexpected.join(', ')}], so those checks are not reading the artefact`
    );
  }
});

test('every finding an example produces is catalogued', () => {
  for (const { dir, meta, fail, pass } of patterns) {
    for (const { name, body } of [fail, pass]) {
      for (const problem of checkers[meta.kind](body, name)) {
        assert.ok(
          catalogued.includes(problem.id),
          `${dir}/${name} produced uncatalogued finding ${problem.id}`
        );
      }
    }
  }
});

test('every finding declared in meta.json is catalogued', () => {
  for (const { dir, meta } of patterns) {
    for (const id of meta.expect ?? []) {
      assert.ok(catalogued.includes(id), `${dir}/meta.json expects ${id}, which is not catalogued`);
    }
  }
});

test('no corrected HTML page carries another pattern problem', () => {
  // The cross-check. Absence findings are excluded, because a page that
  // demonstrates a canonical rule is not required to also carry breadcrumbs.
  const htmlPatterns = patterns.filter((x) => htmlKinds.includes(x.meta.kind) && x.pass.name.endsWith('.html'));
  for (const { dir, pass } of htmlPatterns) {
    for (const kind of htmlKinds) {
      const problems = checkers[kind](pass.body, pass.name)
        .filter((p) => !absenceIds.has(p.id));
      assert.deepEqual(
        problems.map((p) => p.id),
        [],
        `${dir}/${pass.name} is clean for its own pattern but trips the ${kind} checker: ${problems.map((p) => `${p.id}: ${p.message}`).join(' | ')}`
      );
    }
  }
});

test('every failing example is a different document from its corrected one', () => {
  for (const { dir, fail, pass } of patterns) {
    assert.notEqual(fail.body.trim(), pass.body.trim(), `${dir} has identical fail and pass artefacts`);
  }
});

test('every pattern declares whether Search Console reports it, and says what it shows', () => {
  for (const { dir, meta } of patterns) {
    assert.equal(typeof meta.gscReports, 'boolean', `${dir}/meta.json has no gscReports boolean`);
    assert.ok(
      typeof meta.gscNote === 'string' && meta.gscNote.length > 40,
      `${dir}/meta.json needs a gscNote that explains what the report does or does not show`
    );
    assert.ok(
      typeof meta.manualCheck === 'string' && meta.manualCheck.length > 40,
      `${dir}/meta.json needs a manualCheck, because the checker is not the whole answer`
    );
  }
});
