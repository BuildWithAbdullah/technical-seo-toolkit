/**
 * tools.test.mjs
 *
 * The five reusable tools, tested as code rather than trusted as plumbing.
 *
 * Each of them decides something the rest of the repository depends on. The
 * gitignore matcher decides which files every file-walking claim reads, so if
 * it is wrong they are all quietly wrong with it. The test counter decides the
 * number the README promises. The entry-point guard decides whether the
 * verifier has coverage. None of them is the deliverable and all of them are
 * load-bearing, which is the combination that goes untested.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { parseIgnore, isIgnored, trackedFiles } from '../tools/tracked.mjs';
import { testFiles, countTests } from '../tools/count-tests.mjs';
import { codeLines, countBranches, entries, auditEntries } from '../tools/entry-thin.mjs';
import { predictedVerdict } from '../tools/audit-verdicts.mjs';
import { auditPatterns, renderHuman, renderJson, failed, worstSeverity } from '../tools/audit-patterns.mjs';
import { render as renderCatalogueDoc } from '../tools/catalogue-doc.mjs';
import { render as renderLimitsDoc } from '../tools/limits-doc.mjs';
import { byId } from '../tools/catalogue.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

// ------------------------------------------------------------------ tracked

test('a pattern with no slash matches at any depth', () => {
  const rules = parseIgnore('node_modules/\n*.log\n');
  assert.ok(isIgnored('a/b/debug.log', rules));
  assert.ok(isIgnored('debug.log', rules));
  assert.ok(!isIgnored('debug.log.txt', rules));
});

test('a pattern with a slash is anchored to the repository root', () => {
  const rules = parseIgnore('/build\ndist/out.js\n');
  assert.ok(isIgnored('build', rules));
  assert.ok(!isIgnored('src/build', rules));
  assert.ok(isIgnored('dist/out.js', rules));
  assert.ok(!isIgnored('a/dist/out.js', rules));
});

test('a trailing slash matches directories only', () => {
  const rules = parseIgnore('cache/\n');
  assert.ok(isIgnored('cache', rules, true));
  assert.ok(!isIgnored('cache', rules, false));
});

test('a negation re-includes, and the last matching rule wins', () => {
  const rules = parseIgnore('*.log\n!keep.log\n');
  assert.ok(isIgnored('debug.log', rules));
  assert.ok(!isIgnored('keep.log', rules));
});

test('a single asterisk does not cross a slash and a double one does', () => {
  const rules = parseIgnore('a/*/c\n');
  assert.ok(isIgnored('a/b/c', rules));
  assert.ok(!isIgnored('a/b/x/c', rules));
  const deep = parseIgnore('a/**/c\n');
  assert.ok(deep.length === 1);
  assert.ok(isIgnored('a/b/x/c', deep));
});

test('the matcher agrees with git on a purpose-built tree, including the case git cannot do', async () => {
  // The case worth building a repository for: a negation cannot re-include a
  // file inside an excluded directory, because git never walks into it. An
  // implementation that applies the rules to a path it already has will get
  // that wrong and look right in every other test.
  const dir = await mkdtemp(path.join(tmpdir(), 'tracked-'));
  try {
    await mkdir(path.join(dir, 'src'), { recursive: true });
    await mkdir(path.join(dir, 'build/nested'), { recursive: true });
    await mkdir(path.join(dir, 'logs'), { recursive: true });
    await writeFile(path.join(dir, '.gitignore'), [
      'build/',
      '!build/nested/keep.txt',
      '*.log',
      '!logs/keep.log',
      '/root-only.txt',
      '',
    ].join('\n'));
    await writeFile(path.join(dir, 'src/index.mjs'), 'export default 1;\n');
    await writeFile(path.join(dir, 'build/out.js'), 'x\n');
    await writeFile(path.join(dir, 'build/nested/keep.txt'), 'x\n');
    await writeFile(path.join(dir, 'logs/debug.log'), 'x\n');
    await writeFile(path.join(dir, 'logs/keep.log'), 'x\n');
    await writeFile(path.join(dir, 'root-only.txt'), 'x\n');
    await writeFile(path.join(dir, 'src/root-only.txt'), 'x\n');

    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['add', '-A'], { cwd: dir });
    const fromGit = execFileSync('git', ['ls-files'], { cwd: dir, encoding: 'utf8' })
      .split('\n').filter(Boolean).sort();
    const fromTool = await trackedFiles(dir);

    assert.deepEqual(fromTool, fromGit);
    // And the specific claims, stated so a failure says which rule broke.
    assert.ok(fromGit.includes('logs/keep.log'), 'a negation outside an excluded directory re-includes');
    assert.ok(!fromGit.includes('build/nested/keep.txt'), 'a negation inside an excluded directory cannot re-include');
    assert.ok(!fromTool.includes('build/nested/keep.txt'));
    assert.ok(fromTool.includes('src/root-only.txt'), 'an anchored rule does not match at depth');
    assert.ok(!fromTool.includes('root-only.txt'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the matcher finds this repository and excludes what gitignore excludes', async () => {
  const files = await trackedFiles(ROOT);
  assert.ok(files.includes('package.json'));
  assert.ok(files.includes('tools/checkers.mjs'));
  assert.ok(!files.some((f) => f.startsWith('node_modules/')));
  assert.ok(!files.includes('package-lock.json'));
});

// -------------------------------------------------------------- count-tests

test('the test files are read from the test script rather than from the directory', () => {
  // A test file nobody named is a test file nobody runs, so the list has to
  // come from the script that runs them.
  const files = testFiles(ROOT);
  assert.ok(files.length >= 10);
  assert.ok(files.every((f) => f.startsWith('test/') && f.endsWith('.test.mjs')));
  assert.ok(files.includes('test/catalogue.test.mjs'));
});

test('the counter is not called from inside the suite, and the claim that calls it says so', async () => {
  // tools/count-tests.mjs spawns the test runner over every test file. A test
  // that called it would start a second full run of this suite from inside
  // this suite, and that run would do it again. The claim in
  // tools/repo-claims.mjs that compares the count against the README is
  // therefore marked spawnsRunner, and the structure of that marking is what
  // is asserted here instead.
  const { claims } = await import('../tools/repo-claims.mjs');
  const spawners = claims.filter((c) => c.spawnsRunner);
  assert.equal(spawners.length, 1, 'exactly one claim should spawn the test runner');
  assert.match(spawners[0].name, /test count/);
  assert.equal(typeof countTests, 'function');
});

// --------------------------------------------------------------- entry-thin

test('comment lines and blank lines do not count against an entry point budget', () => {
  const body = [
    '/**', ' * A comment.', ' */', '', '// Another.', 'const x = 1;', 'console.log(x);',
  ].join('\n');
  assert.deepEqual(codeLines(body), ['const x = 1;', 'console.log(x);']);
});

test('branch-shaped tokens are counted', () => {
  assert.equal(countBranches('const a = 1;'), 0);
  assert.ok(countBranches('if (a) { b() } else { c() }') >= 2);
  assert.ok(countBranches('const a = b ?? c;') >= 1);
  assert.ok(countBranches('for (const x of y) {}') >= 1);
});

test('both entry points are inside their budgets and import nothing that decides', async () => {
  const { report, failures } = await auditEntries(ROOT);
  assert.deepEqual(failures, []);
  assert.equal(report.length, entries.length);
  for (const r of report) {
    assert.ok(r.lines <= r.maxLines, `${r.file} is ${r.lines} lines`);
    assert.ok(r.branches <= r.maxBranches, `${r.file} has ${r.branches} branches`);
  }
});

test('the guard fails a synthetic entry point that has grown a decision', async () => {
  // The other direction. A guard that passes everything is not a guard, and
  // the only way to know is to hand it something it should refuse.
  const dir = await mkdtemp(path.join(tmpdir(), 'thin-'));
  try {
    await mkdir(path.join(dir, 'tools'), { recursive: true });
    const fat = [
      "import { checkers } from './checkers.mjs';",
      'const body = process.argv[2];',
      'if (body) { console.log(checkers.canonical(body)) } else { console.log([]) }',
      'if (body && body.length > 2) { console.log(1) } else if (body) { console.log(2) }',
      'for (const x of [1, 2]) { if (x) console.log(x || 0); }',
      'while (false) { console.log(1 ?? 2); }',
    ].join('\n');
    await writeFile(path.join(dir, 'tools/check.mjs'), fat);
    await writeFile(path.join(dir, 'tools/verify.mjs'), 'console.log(1);\n');
    const { failures } = await auditEntries(dir);
    assert.ok(failures.some((f) => f.includes('imports ./checkers.mjs')), `expected a forbidden import failure, got ${failures.join('; ')}`);
    assert.ok(failures.some((f) => f.includes('branch-shaped tokens')), `expected a branch budget failure, got ${failures.join('; ')}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ----------------------------------------------------------- audit-verdicts

test('the predicted verdict is derived from the catalogue, not from a list in the tool', () => {
  assert.equal(predictedVerdict(['canonical-has-fragment']), 'note');
  assert.equal(predictedVerdict(['canonical-relative']), 'warning');
  assert.equal(predictedVerdict(['canonical-relative', 'canonical-multiple']), 'error');
  assert.equal(predictedVerdict([]), null);
  // And it really does read the catalogue: the severity of a known id has to
  // match what the catalogue declares for it.
  assert.ok(byId.get('canonical-multiple').severities.includes('error'));
});

// ----------------------------------------------------------- audit-patterns

test('the worst severity of a set of findings is the worst one in it', () => {
  assert.equal(worstSeverity([]), null);
  assert.equal(worstSeverity([{ severity: 'note' }, { severity: 'warning' }]), 'warning');
  assert.equal(worstSeverity([{ severity: 'note' }, { severity: 'error' }, { severity: 'warning' }]), 'error');
});

test('both renderers describe the same results, and neither decides anything', async () => {
  const results = await auditPatterns({ only: 'canonical-tags' });
  assert.equal(results.length, 1);
  assert.equal(failed(results), false);
  const human = renderHuman(results);
  const machine = JSON.parse(renderJson(results));
  assert.equal(machine.patterns[0].slug, 'canonical-tags');
  for (const id of results[0].failIds) {
    assert.ok(human.includes(id), `the human renderer dropped ${id}`);
    assert.ok(machine.patterns[0].failIds.includes(id));
  }
  assert.equal(machine.failing, 0);
});

// ----------------------------------------------------------- the generators

test('both generated documents render deterministically', () => {
  assert.equal(renderCatalogueDoc(), renderCatalogueDoc());
  assert.equal(renderLimitsDoc(), renderLimitsDoc());
  assert.ok(renderLimitsDoc().includes('What the checkers cannot see'));
  assert.ok(renderCatalogueDoc().includes('Every finding, listed'));
});
