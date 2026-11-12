/**
 * count-tests.mjs
 *
 * How many tests this repository actually runs, counted from the runner rather
 * than from the source.
 *
 * Why not count `test(` in the files: because that is a count of what somebody
 * wrote, not of what runs. A test inside a loop, a test added by a helper, a
 * test in a file the test script forgot to name, and a file that throws on
 * import all make the two numbers disagree, and the number in the README is
 * supposed to be a promise a reader can check by running the suite.
 *
 * Why a child process with a custom reporter rather than the programmatic
 * run() API: because what run() puts on its stream is version dependent. It
 * forwards one pass event per whole file on some versions and one per test on
 * others, and details.type is 'suite' on some and undefined on others. Inside
 * a reporter every per-test event is present on every version, so the counting
 * is done in tools/test-reporter.mjs and read back from the single line it
 * prints. The format of that line is a contract between two files in this
 * repository, which makes it the one thing here that cannot drift with Node.
 *
 * Why spawnSync: because this parent has nothing to say to the child. The
 * opposite case, a parent that has to answer requests the child makes while it
 * runs, deadlocks under spawnSync and needs the asynchronous form. Deciding by
 * that question rather than by habit is the rule; see the same note in
 * tools/audit-verdicts.mjs, which is the other case.
 *
 * Note for any caller: a file that fails to load counts as one test. That is
 * safe, because the failure count is then non-zero, but it means a count taken
 * from a red run means nothing. Callers must refuse to compare a count against
 * a suite that is not green, and tools/repo-claims.mjs does.
 *
 * Usage:  node tools/count-tests.mjs
 */

import { spawnSync } from 'node:child_process';
import { realpathSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORTER = path.join(ROOT, 'tools', 'test-reporter.mjs');

/**
 * The test files, read out of the test script in package.json.
 *
 * The script names every file rather than globbing, because node --test did
 * not accept glob patterns before Node 21 and this package supports Node 20.
 * Reading the list from there rather than from the directory means this tool
 * counts the files that are actually run, which is the point: a test file
 * nobody named is a test file nobody runs.
 */
export function testFiles(root = ROOT) {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const script = pkg.scripts?.test ?? '';
  return [...script.matchAll(/(test\/[\w.-]+\.test\.mjs)/g)].map((m) => m[1]);
}

/**
 * Run the suite in a child process and return { tests, passed, failed, files }.
 */
export function countTests(root = ROOT) {
  const files = testFiles(root);
  const result = spawnSync(
    process.execPath,
    ['--test', `--test-reporter=${pathToFileURL(REPORTER).href}`, ...files],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );

  const line = String(result.stdout ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('TESTCOUNT '));

  if (!line) {
    throw new Error(
      `the reporter printed no count line. exit=${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  const [, tests, passed, failed] = line.split(/\s+/);
  return {
    tests: Number(tests),
    passed: Number(passed),
    failed: Number(failed),
    files,
    exitCode: result.status,
  };
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
  const { tests, passed, failed, files } = countTests();
  console.log(`${tests} tests across ${files.length} files: ${passed} passing, ${failed} failing.`);
  process.exit(failed === 0 ? 0 : 1);
}
