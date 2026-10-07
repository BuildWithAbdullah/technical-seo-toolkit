/**
 * verify.mjs
 *
 * Every corrected example in this repository is checked by machine, and every
 * failing example is checked to make sure it really does fail. An SEO pattern
 * library that nobody runs is a list of opinions with syntax highlighting.
 *
 * For each folder under patterns/:
 *
 *   meta.json declares the kind of artefact, and which rule ids the failing
 *   example is expected to trigger.
 *
 *   pass.*  must produce zero problems.
 *   fail.*  must produce at least one of the expected rule ids, and at least
 *           one of them must be a real fault rather than the absence of a
 *           thing. A page with no h1 is a failing heading example and so is a
 *           blank document, so an absence on its own proves only that the file
 *           is empty. The absence findings are named in catalogue.mjs.
 *
 * Either of those failing is a hard CI failure, so a pattern cannot quietly
 * stop being true.
 *
 * meta.json also records whether Search Console reports the problem. Most of
 * these it does not, and that is the reason the repository exists: the
 * expensive indexation faults are the ones that produce no report anywhere,
 * because from Google's side nothing went wrong.
 *
 * Usage:  npm install && npm run verify
 */

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkers } from './checkers.mjs';
import { absenceIds } from './catalogue.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PATTERNS = path.join(ROOT, 'patterns');

const GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', YEL = '\x1b[33m', OFF = '\x1b[0m';

async function readExample(dir, prefix) {
  const entries = await readdir(dir);
  const name = entries.find((e) => e.startsWith(`${prefix}.`));
  if (!name) throw new Error(`${dir} has no ${prefix}.* file`);
  return { name, body: await readFile(path.join(dir, name), 'utf8') };
}

async function main() {
  const dirs = (await readdir(PATTERNS, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const failures = [];
  let silent = 0;

  for (const dir of dirs) {
    const base = path.join(PATTERNS, dir);
    const meta = JSON.parse(await readFile(path.join(base, 'meta.json'), 'utf8'));
    const check = checkers[meta.kind];
    if (!check) {
      failures.push({ label: meta.name, problems: [`unknown kind "${meta.kind}"`] });
      continue;
    }

    const fail = await readExample(base, 'fail');
    const pass = await readExample(base, 'pass');

    const failIds = check(fail.body, fail.name).map((p) => p.id);
    const passProblems = check(pass.body, pass.name);

    const problems = [];
    if (passProblems.length > 0) {
      problems.push(`${pass.name} is not clean: ${passProblems.map((p) => p.id).join(', ')}`);
      passProblems.forEach((p) => problems.push(`  ${p.id}: ${p.message}`));
    }

    const expected = meta.expect ?? [];
    const hit = failIds.filter((id) => expected.includes(id));
    if (hit.length === 0) {
      problems.push(
        `${fail.name} did not trigger any of [${expected.join(', ')}]; the checker saw [${failIds.join(', ') || 'nothing'}]`
      );
    } else if (hit.every((id) => absenceIds.has(id))) {
      problems.push(
        `${fail.name} triggered only absence findings [${hit.join(', ')}], which an empty file would also trigger`
      );
    }

    if (!meta.gscReports) silent++;

    if (problems.length) {
      failures.push({ label: meta.name, problems });
      console.log(`${RED}FAIL${OFF}   ${meta.name}`);
      problems.forEach((p) => console.log(`       ${p}`));
    } else {
      const tag = meta.gscReports ? `${GREEN}OK${OFF}    ` : `${YEL}OK${OFF}    `;
      console.log(`${tag} ${meta.name} ${DIM}(fail.${fail.name.split('.').pop()}: ${hit.join(', ')})${OFF}`);
      if (!meta.gscReports) {
        console.log(`       ${DIM}Search Console does not report this. ${meta.gscNote}${OFF}`);
      }
    }
  }

  console.log(
    `\n${dirs.length} patterns checked, ${silent} of them invisible in Search Console, ${failures.length} failing.`
  );

  if (failures.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
