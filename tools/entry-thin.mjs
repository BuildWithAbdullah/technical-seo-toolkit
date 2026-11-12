/**
 * entry-thin.mjs
 *
 * Fails the build if a decision moves into a file no test can import.
 *
 * The reason this tool exists, in one sentence: a file that is only ever run
 * as a program has no coverage at all, and the entry point is exactly where
 * that bites. On this account a sibling package declared a bin whose entry
 * point printed nothing and exited 0 through the symlink npm installs it as,
 * for the whole life of the package, while fifty tests passed. The tests were
 * testing the modules. Nothing was testing the program.
 *
 * So each entry point here is wiring: read the arguments, call a module,
 * render the answer, set the exit code. The modules take their inputs as
 * arguments and return data, so a test can call them. This tool holds the
 * entry points to that, with a line budget, a branch budget and a list of
 * modules they are not allowed to import.
 *
 * The vocabulary is declared per entry point and not once for the tool
 * ---------------------------------------------------------------------
 * Because the same token means different things in different files. A
 * forbidden import is the sharpest rule available here: an entry point that
 * has started deciding something about a pattern has to reach for
 * checkers.mjs to do it, and an entry point that has started deciding
 * something about the repository has to reach for the catalogue. Neither needs
 * either in order to be wiring, so forbidding the import is forbidding the
 * decision, without having to guess which keyword expresses it.
 *
 * The budgets are the second line of defence, for a decision expressed with
 * what the file already imports. Comment lines and blank lines do not count
 * against the line budget, so documenting a file is free, which it should be.
 *
 * Usage:  npm run thin
 */

import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Branch-shaped tokens. Counted rather than forbidden, because an entry point
 * legitimately needs one or two: a mode flag to pick a renderer and a loop to
 * print a list.
 */
const BRANCHES = [
  /\bif\s*\(/g,
  /\belse\b/g,
  /\bswitch\s*\(/g,
  /\bfor\s*\(/g,
  /\bwhile\s*\(/g,
  /\bcatch\s*[({]/g,
  /\?\?/g,
  /&&/g,
  /\|\|/g,
  /\?[^.]/g,
];

export const entries = [
  {
    file: 'tools/check.mjs',
    maxLines: 12,
    maxBranches: 4,
    // The claims are the decisions. An entry point that imports the catalogue,
    // the checkers or the limits has started making one.
    forbiddenImports: ['./checkers.mjs', './catalogue.mjs', './limits.mjs', './tracked.mjs', './count-tests.mjs'],
  },
  {
    file: 'tools/verify.mjs',
    maxLines: 12,
    maxBranches: 6,
    forbiddenImports: ['./checkers.mjs', './catalogue.mjs', './limits.mjs'],
  },
];

/** Lines that are neither blank nor a comment. */
export const codeLines = (body) =>
  body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*') && !l.startsWith('*/'));

export const countBranches = (code) =>
  BRANCHES.reduce((total, re) => total + [...code.matchAll(re)].length, 0);

export async function auditEntries(root = ROOT) {
  const failures = [];
  const report = [];

  for (const entry of entries) {
    const body = await readFile(path.join(root, entry.file), 'utf8');
    const lines = codeLines(body);
    const code = lines.join('\n');
    const branches = countBranches(code);

    if (lines.length > entry.maxLines) {
      failures.push(`${entry.file} has ${lines.length} lines of code and its budget is ${entry.maxLines}; move the decision into a module a test can import`);
    }
    if (branches > entry.maxBranches) {
      failures.push(`${entry.file} has ${branches} branch-shaped tokens and its budget is ${entry.maxBranches}; move the decision into a module a test can import`);
    }
    for (const forbidden of entry.forbiddenImports) {
      if (code.includes(`'${forbidden}'`) || code.includes(`"${forbidden}"`)) {
        failures.push(`${entry.file} imports ${forbidden}, which means it has started deciding something rather than wiring it up`);
      }
    }
    report.push({ file: entry.file, lines: lines.length, maxLines: entry.maxLines, branches, maxBranches: entry.maxBranches });
  }

  return { report, failures };
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  const { report, failures } = await auditEntries();
  for (const r of report) {
    console.log(`${r.file}: ${r.lines}/${r.maxLines} lines, ${r.branches}/${r.maxBranches} branches`);
  }
  for (const failure of failures) console.log(`FAIL  ${failure}`);
  console.log(`\n${report.length} entry points checked, ${failures.length} failing.`);
  process.exit(failures.length === 0 ? 0 : 1);
}
