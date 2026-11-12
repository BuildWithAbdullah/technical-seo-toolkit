/**
 * audit-patterns.mjs
 *
 * Every corrected example in this repository is checked by machine, and every
 * failing example is checked to make sure it really does fail. An SEO pattern
 * library that nobody runs is a list of opinions with syntax highlighting.
 *
 * For each folder under patterns/:
 *
 *   meta.json declares the kind of artefact, and the exact set of rule ids the
 *   failing example produces.
 *
 *   pass.*  must produce zero problems.
 *   fail.*  must produce exactly that set, no more and no less, and at least
 *           one member of it must be a real fault rather than the absence of a
 *           thing. A page with no h1 is a failing heading example and so is a
 *           blank document, so an absence on its own proves only that the file
 *           is empty. The absence findings are named in catalogue.mjs.
 *
 * The word exact is doing work there. This used to require that the failing
 * example produced at least one of the declared ids, which meant an example
 * could produce any number of findings nobody had declared and still pass. A
 * new false positive would have landed in silence. Set equality in both
 * directions is what turns this file from a smoke test into an assertion.
 *
 * meta.json also records whether Search Console reports the problem. Most of
 * these it does not, and that is the reason the repository exists: the
 * expensive indexation faults are the ones that produce no report anywhere,
 * because from Google's side nothing went wrong.
 *
 * Two modes, and they make the same assertions
 * --------------------------------------------
 * Without arguments this prints a report for a person. With --json it prints a
 * machine-readable verdict. Both run exactly the same checks and exit with the
 * same code, which tools/audit-verdicts.mjs enforces by running every pattern
 * through both and refusing any disagreement. A tool whose second mode is a
 * different code path is a tool with an untested half.
 *
 * Everything this file does is a decision, and nothing in it is wiring. It
 * reads no arguments, writes nothing to a stream and exits nothing, so a test
 * can import it and call it. tools/verify.mjs is the entry point that supplies
 * the arguments and renders the answer, and tools/entry-thin.mjs fails the
 * build if a decision moves back into it.
 *
 * Usage:  imported by tools/verify.mjs and by the test suite
 */

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkers } from './checkers.mjs';
import { absenceIds } from './catalogue.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PATTERNS = path.join(ROOT, 'patterns');

const GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', YEL = '\x1b[33m', OFF = '\x1b[0m';

const SEVERITY_ORDER = { error: 0, warning: 1, note: 2 };

async function readExample(dir, prefix) {
  const entries = await readdir(dir);
  const name = entries.find((e) => e.startsWith(`${prefix}.`));
  if (!name) throw new Error(`${dir} has no ${prefix}.* file`);
  return { name, body: await readFile(path.join(dir, name), 'utf8') };
}

const distinct = (findings) => [...new Set(findings.map((f) => f.id))].sort();

/** The worst severity present, or null for a clean artefact. */
export const worstSeverity = (findings) =>
  findings.length === 0
    ? null
    : findings.map((f) => f.severity).sort((a, b) => SEVERITY_ORDER[a] - SEVERITY_ORDER[b])[0];

/**
 * The whole judgement, as data. Both modes render this and neither decides
 * anything of its own.
 */
export async function auditPatterns({ only = null } = {}) {
  const dirs = (await readdir(PATTERNS, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((d) => only === null || d === only)
    .sort();

  const results = [];

  for (const dir of dirs) {
    const base = path.join(PATTERNS, dir);
    const meta = JSON.parse(await readFile(path.join(base, 'meta.json'), 'utf8'));
    const check = checkers[meta.kind];
    if (!check) {
      results.push({ slug: dir, name: meta.name, kind: meta.kind, problems: [`unknown kind "${meta.kind}"`], failIds: [], passIds: [], verdict: null, silent: !meta.gscReports, gscNote: meta.gscNote });
      continue;
    }

    const fail = await readExample(base, 'fail');
    const pass = await readExample(base, 'pass');

    const failFindings = check(fail.body, fail.name);
    const passFindings = check(pass.body, pass.name);
    const failIds = distinct(failFindings);
    const passIds = distinct(passFindings);
    const expected = [...(meta.expect ?? [])].sort();

    const problems = [];
    if (passIds.length > 0) {
      problems.push(`${pass.name} is not clean: ${passIds.join(', ')}`);
      passFindings.forEach((p) => problems.push(`  ${p.id}: ${p.message}`));
    }

    const unexpected = failIds.filter((id) => !expected.includes(id));
    const unproduced = expected.filter((id) => !failIds.includes(id));
    if (unexpected.length) {
      problems.push(`${fail.name} produced [${unexpected.join(', ')}], which meta.json does not declare`);
    }
    if (unproduced.length) {
      problems.push(`${fail.name} did not produce [${unproduced.join(', ')}], which meta.json declares`);
    }
    if (failIds.length > 0 && failIds.every((id) => absenceIds.has(id))) {
      problems.push(
        `${fail.name} produced only absence findings [${failIds.join(', ')}], which an empty file would also produce`
      );
    }

    results.push({
      slug: dir,
      name: meta.name,
      kind: meta.kind,
      failExample: fail.name,
      passExample: pass.name,
      failIds,
      passIds,
      verdict: worstSeverity(failFindings),
      silent: !meta.gscReports,
      gscNote: meta.gscNote,
      problems,
    });
  }

  return results;
}


/** The human readable report, as a string. Rendering only, no decisions. */
export function renderHuman(results) {
  const lines = [];
  for (const r of results) {
    if (r.problems.length) {
      lines.push(`${RED}FAIL${OFF}   ${r.name}`);
      for (const p of r.problems) lines.push(`       ${p}`);
    } else {
      const tag = r.silent ? `${YEL}OK${OFF}    ` : `${GREEN}OK${OFF}    `;
      lines.push(`${tag} ${r.name} ${DIM}(${r.failExample}: ${r.failIds.join(', ')}; worst ${r.verdict})${OFF}`);
      if (r.silent) lines.push(`       ${DIM}Search Console does not report this. ${r.gscNote}${OFF}`);
    }
  }
  const silent = results.filter((r) => r.silent).length;
  const failing = results.filter((r) => r.problems.length > 0).length;
  lines.push('');
  lines.push(`${results.length} patterns checked, ${silent} of them invisible in Search Console, ${failing} failing.`);
  return lines.join('\n');
}

/** The machine readable verdict, as a string. Rendering only, no decisions. */
export function renderJson(results) {
  return JSON.stringify({
    patterns: results.map((r) => ({
      slug: r.slug,
      kind: r.kind,
      failIds: r.failIds,
      passIds: r.passIds,
      verdict: r.verdict,
      silent: r.silent,
      ok: r.problems.length === 0,
    })),
    checked: results.length,
    silent: results.filter((r) => r.silent).length,
    failing: results.filter((r) => r.problems.length > 0).length,
  }, null, 2);
}

/** Whether a set of results should make the process exit non-zero. */
export const failed = (results) => results.some((r) => r.problems.length > 0);
