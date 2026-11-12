/**
 * audit-verdicts.mjs
 *
 * Runs the real verifier, as a program, over every pattern in the repository,
 * and derives what it should say from the manifests rather than from a list
 * kept in here.
 *
 * Why this exists when there is already a test suite: because the suite
 * imports the checkers and calls them. That proves the functions behave. It
 * does not prove that the thing a reader runs behaves, and the difference has
 * bitten this account hard enough to become a rule. A sibling repository
 * declared a bin, and through the symlink npm installs it as, it printed
 * nothing and exited 0 for the whole life of the package while fifty tests
 * passed. This package has no bin, so the equivalent is the tool a reader runs
 * with npm run verify, spawned as a separate process, once per pattern.
 *
 * Why spawn rather than spawnSync: it could be either here, because the parent
 * has nothing to say to the child. It is spawnSync for that reason and the
 * rule is worth writing down, because the opposite case deadlocks: a parent
 * that has to answer requests the child makes while it runs cannot use the
 * synchronous form at all. Decide by whether the parent answers the child, not
 * by which one you used last.
 *
 * What is derived rather than listed
 * ----------------------------------
 * The expected finding set comes from meta.json. The expected worst severity
 * comes from the catalogue, by taking the severity of each expected finding
 * and keeping the worst. The expected exit code comes from whether anything
 * failed. Nothing in this file is a hand-maintained table of answers, so a
 * change to a severity in the catalogue moves the expectation here with it.
 *
 * Both modes, every time
 * ----------------------
 * Each pattern is run twice: once in the human mode and once with --json. The
 * two have to agree on the exit code and on the findings, which is what stops
 * the second mode from drifting into an untested code path.
 *
 * Usage:  npm run verdicts
 */

import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import { byId } from './catalogue.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERIFY = path.join(ROOT, 'tools', 'verify.mjs');

const SEVERITY_ORDER = { error: 0, warning: 1, note: 2 };

/** The worst severity the declared findings can be emitted at. */
export const predictedVerdict = (expectedIds) => {
  const severities = expectedIds.flatMap((id) => byId.get(id)?.severities ?? []);
  if (severities.length === 0) return null;
  return severities.sort((a, b) => SEVERITY_ORDER[a] - SEVERITY_ORDER[b])[0];
};

const runVerify = (args) =>
  spawnSync(process.execPath, [VERIFY, ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });

export async function auditVerdicts() {
  const dirs = (await readdir(path.join(ROOT, 'patterns'), { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const failures = [];
  let runs = 0;

  for (const dir of dirs) {
    const meta = JSON.parse(await readFile(path.join(ROOT, 'patterns', dir, 'meta.json'), 'utf8'));
    const expected = [...(meta.expect ?? [])].sort();

    const human = runVerify(['--only', dir]);
    const machine = runVerify(['--json', '--only', dir]);
    runs += 2;

    if (human.status !== 0) {
      failures.push(`${dir}: the verifier exited ${human.status} in its human mode\n${human.stdout}${human.stderr}`);
    }
    if (machine.status !== human.status) {
      failures.push(`${dir}: the two modes disagree on the exit code: human ${human.status}, json ${machine.status}`);
    }

    let parsed;
    try {
      parsed = JSON.parse(machine.stdout);
    } catch (err) {
      failures.push(`${dir}: --json did not print JSON (${err.message}): ${machine.stdout.slice(0, 200)}`);
      continue;
    }

    const result = parsed.patterns[0];
    if (!result) {
      failures.push(`${dir}: --only ${dir} returned no pattern`);
      continue;
    }

    const actual = [...result.failIds].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures.push(`${dir}: the failing example produced [${actual.join(', ')}] and meta.json declares [${expected.join(', ')}]`);
    }
    if (result.passIds.length !== 0) {
      failures.push(`${dir}: the corrected example produced [${result.passIds.join(', ')}]`);
    }

    const predicted = predictedVerdict(expected);
    if (result.verdict !== predicted) {
      failures.push(`${dir}: the verdict was ${result.verdict} and the catalogue predicts ${predicted}`);
    }

    // The human mode has to name the same findings. It renders the same data,
    // and this is the assertion that keeps that true.
    for (const id of expected) {
      if (!human.stdout.includes(id)) {
        failures.push(`${dir}: the human mode did not name ${id}`);
      }
    }
  }

  return { dirs, failures, runs };
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
  const { dirs, failures, runs } = await auditVerdicts();
  for (const failure of failures) console.log(`FAIL  ${failure}`);
  console.log(`\n${dirs.length} patterns, ${runs} runs of the real verifier in two modes, ${failures.length} failing.`);
  process.exit(failures.length === 0 ? 0 : 1);
}
