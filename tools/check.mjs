/**
 * check.mjs
 *
 * The repository verifier. It checks the repository rather than the patterns:
 * that every claim in the README is a claim the code supports, that every
 * pattern directory is complete, that the generated document is current, and
 * that nothing in the tree carries a real hostname or a forbidden character.
 *
 * It is separate from tools/verify.mjs on purpose. That file asks whether the
 * patterns are still true. This one asks whether the repository is still the
 * repository it says it is, which is the thing that rots quietly when a number
 * in a README stops matching the suite that produced it.
 *
 * Usage:  npm run check
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { checkers } from './checkers.mjs';
import { findings, ids, byKind } from './catalogue.mjs';
import { render } from './catalogue-doc.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const failures = [];
let checks = 0;

const ok = (condition, message) => {
  checks++;
  if (!condition) failures.push(message);
};

const equal = (actual, expected, message) => {
  checks++;
  if (actual !== expected) failures.push(`${message}: expected ${expected}, found ${actual}`);
};

// The forbidden characters cannot be written literally in a file this rule
// covers, and naming them by escape is no better, because writing a file through
// a tool payload decodes the escape into the character. So they are assembled
// from code points at runtime. The same applies to the institution name, which
// is why the needle below is built rather than spelled.
// Every needle in this block is assembled from parts at runtime. Writing one of
// them out would make this file fail its own check, and writing the escape
// sequence instead does not help: a file written through a tool payload has its
// escapes decoded on the way to disk, so the escape for a long dash becomes the
// character. There is no way to refer to one of these literally in a file this
// rule covers.
const DASHES = [
  [0x2014, 'em dash'],
  [0x2013, 'en dash'],
  [0x2012, 'figure dash'],
  [0x2015, 'horizontal bar'],
].map(([code, name]) => [String.fromCodePoint(code), name]);

const INSTITUTION = ['uni', 'versity'].join('');
// The axe help links point at a host whose name contains the forbidden word, so
// it is removed before the question is asked. Spelling it out here would trip
// the check it exists to allow.
const ALLOWED_INSTITUTION_HOST = new RegExp(`deque${INSTITUTION}\\.com`, 'gi');

const TEXT = new Set(['.mjs', '.js', '.json', '.md', '.html', '.xml', '.yml', '.yaml', '.txt', '']);
const SKIP_DIRS = new Set(['.git', 'node_modules']);
// Everything .gitignore keeps out of the repository. The walk reads the working
// tree rather than the index, deliberately, because git does not know about a
// file that was just written and still lists one that was just removed. The
// consequence is that it also sees the files an install leaves behind.
const SKIP_FILES = new Set(['package-lock.json', '.DS_Store']);

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (!SKIP_FILES.has(entry.name)) out.push(full);
  }
  return out;
}

const read = (rel) => readFile(path.join(ROOT, rel), 'utf8');
const exists = async (rel) => stat(path.join(ROOT, rel)).then(() => true, () => false);

/**
 * Which hostnames an example in this repository is allowed to name.
 *
 * The rule this repository is built under is patterns only: never a delivered
 * client's site, and never a domain a reader could mistake for one. So a
 * hostname has to be reserved for documentation, or a platform the example is
 * genuinely about.
 *
 * .example is a reserved top-level domain that exists for exactly this, which is
 * why the fictional company in these artefacts lives at a .example address
 * rather than at something invented that might belong to somebody.
 */
// The final label must be example, or a prefix of it at least four characters
// long. The prefix case is not laziness: the failing example for the structured
// data pattern is a JSON-LD block cut off mid-string, so one URL in it ends
// partway through the reserved suffix. That truncation is the artefact doing its
// job, and the artefact should not have to be rewritten to please a check.
const RESERVED_EXAMPLE = /(^|\.)exam(p(l(e)?)?)?$|^example\.(com|org|net)$|\.example\.(com|org|net)$/;

const ALLOWED_HOSTS = new Set([
  // Specifications and documentation the patterns cite.
  'schema.org',
  'www.schema.org',
  'validator.schema.org',
  'sitemaps.org',
  'www.sitemaps.org',
  'www.w3.org',
  'developers.google.com',
  'support.google.com',
  'search.google.com',
  'tagassistant.google.com',
  'opensource.org',
  // Scripts and endpoints an analytics example has to name to be an example.
  'www.googletagmanager.com',
  'www.google-analytics.com',
  // Platforms a sameAs link points at. The profile slugs in these artefacts are
  // the fictional company's, not anybody's.
  'www.linkedin.com',
  'www.instagram.com',
  // This repository and its neighbours.
  'github.com',
]);

const hostAllowed = (host) => RESERVED_EXAMPLE.test(host) || ALLOWED_HOSTS.has(host);

async function main() {
  const files = (await walk(ROOT)).map((f) => path.relative(ROOT, f)).sort();

  // ------------------------------------------------- characters and wording
  for (const rel of files) {
    if (!TEXT.has(path.extname(rel))) continue;
    const body = await read(rel);
    for (const [dash, name] of DASHES) {
      ok(!body.includes(dash), `${rel} contains a ${name}`);
    }
    ok(
      !new RegExp(INSTITUTION, 'i').test(body.replace(ALLOWED_INSTITUTION_HOST, '')),
      `${rel} refers to an institution the profile does not mention`
    );
  }

  // ------------------------------------------------------------- hostnames
  for (const rel of files) {
    if (!TEXT.has(path.extname(rel))) continue;
    if (rel === 'tools/check.mjs') continue; // the allowlist itself
    const body = await read(rel);
    for (const match of body.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
      const host = match[1].toLowerCase().replace(/\.$/, '');
      ok(
        hostAllowed(host),
        `${rel} names the host ${host}, which is neither reserved for documentation nor on the allowlist`
      );
    }
  }

  // ------------------------------------------------------- pattern completeness
  const patternDir = path.join(ROOT, 'patterns');
  const dirs = (await readdir(patternDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  equal(dirs.length, 10, 'the number of pattern directories');

  for (const dir of dirs) {
    const entries = await readdir(path.join(patternDir, dir));
    ok(entries.includes('README.md'), `patterns/${dir} has no README.md`);
    ok(entries.includes('meta.json'), `patterns/${dir} has no meta.json`);
    ok(entries.some((e) => e.startsWith('fail.')), `patterns/${dir} has no failing example`);
    ok(entries.some((e) => e.startsWith('pass.')), `patterns/${dir} has no corrected example`);

    const meta = JSON.parse(await read(path.join('patterns', dir, 'meta.json')));
    equal(meta.slug, dir, `patterns/${dir}/meta.json slug`);
    ok(Object.hasOwn(checkers, meta.kind), `patterns/${dir} names kind "${meta.kind}", which is not a checker`);
    ok(Array.isArray(meta.expect) && meta.expect.length > 0, `patterns/${dir} declares no expected findings`);
    for (const id of meta.expect ?? []) {
      ok(ids.includes(id), `patterns/${dir} expects ${id}, which is not catalogued`);
      const catalogued = findings.find((f) => f.id === id);
      if (catalogued) {
        equal(catalogued.kind, meta.kind, `catalogued kind for ${id}`);
      }
    }

    const readme = await read(path.join('patterns', dir, 'README.md'));
    ok(readme.length > 400, `patterns/${dir}/README.md is too short to explain anything`);
    ok(readme.includes(meta.name), `patterns/${dir}/README.md does not state the pattern name from meta.json`);
  }

  // ------------------------------------------------------------- the catalogue
  equal(new Set(ids).size, ids.length, 'unique catalogued ids');
  for (const finding of findings) {
    ok(Object.hasOwn(checkers, finding.kind), `${finding.id} names a kind that does not exist`);
    ok(finding.what.length > 25, `${finding.id} has no useful description`);
    ok(typeof finding.silent === 'boolean', `${finding.id} does not record whether Search Console reports it`);
  }

  // Every id the checkers can emit has to be catalogued. The source is scanned
  // rather than trusted, because the test suite proves reachability and this
  // proves completeness, and the two fail in different ways.
  const source = await read('tools/checkers.mjs');
  const emitted = new Set(
    [...source.matchAll(/\bp\(\s*['"]([a-z0-9-]+)['"]/g)].map((m) => m[1])
  );
  for (const id of emitted) {
    ok(ids.includes(id), `checkers.mjs can emit ${id}, which is not in the catalogue`);
  }
  equal(emitted.size, ids.length, 'the number of ids in checkers.mjs against the catalogue');

  // ----------------------------------------------------------- generated doc
  ok(await exists('docs/every-finding.md'), 'docs/every-finding.md is missing');
  if (await exists('docs/every-finding.md')) {
    const current = await read('docs/every-finding.md');
    ok(
      current === render(),
      'docs/every-finding.md is out of date; run npm run docs'
    );
  }

  // ------------------------------------------------------------- the README
  const readme = await read('README.md');
  ok(readme.includes('## Verifying'), 'README.md has no Verifying section');
  ok(readme.includes('## Limits'), 'README.md has no Limits section');
  ok(readme.includes('MIT'), 'README.md does not state the licence');

  for (const dir of dirs) {
    ok(readme.includes(`patterns/${dir}/`), `README.md does not link patterns/${dir}/`);
  }

  const silentPatterns = [];
  for (const dir of dirs) {
    const meta = JSON.parse(await read(path.join('patterns', dir, 'meta.json')));
    if (!meta.gscReports) silentPatterns.push(dir);
  }
  const headline = readme.match(/\*\*(\w+) of the (\w+) patterns produce no report in Search Console\.\*\*/);
  ok(headline !== null, 'README.md no longer carries the Search Console headline claim in the expected form');
  if (headline) {
    const words = { four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    equal(words[headline[1].toLowerCase()], silentPatterns.length, 'the README headline count of silent patterns');
    equal(words[headline[2].toLowerCase()], dirs.length, 'the README headline count of patterns');
  }

  // The counts the README quotes have to be the counts the repository produces.
  const findingClaim = readme.match(/(\d+) catalogued findings/);
  ok(findingClaim !== null, 'README.md does not quote a catalogued finding count');
  if (findingClaim) equal(Number(findingClaim[1]), ids.length, 'the finding count quoted in the README');

  // The test count is counted from the source rather than parsed out of the
  // runner's output. Node 20 and 22 print TAP when piped and Node 24 prints the
  // spec reporter regardless, so a verifier that reads the summary line passes on
  // one and fails on the other for no reason at all.
  const testFiles = (await readdir(path.join(ROOT, 'test'))).filter((f) => f.endsWith('.test.mjs')).sort();
  let declared = 0;
  for (const file of testFiles) {
    const body = await read(path.join('test', file));
    declared += [...body.matchAll(/^test\(/gm)].length;
  }
  const testClaim = readme.match(/(\d+) tests/);
  ok(testClaim !== null, 'README.md does not quote a test count');
  if (testClaim) equal(Number(testClaim[1]), declared, 'the test count quoted in the README');

  const checkClaim = readme.match(/(\d+) repository assertions/);

  // ----------------------------------------------------------- package.json
  const pkg = JSON.parse(await read('package.json'));
  for (const script of ['test', 'verify', 'check', 'docs']) {
    ok(Object.hasOwn(pkg.scripts ?? {}, script), `package.json has no ${script} script`);
  }
  ok(pkg.engines?.node !== undefined, 'package.json declares no engines.node');
  ok(pkg.type === 'module', 'package.json is not a module package');

  // node --test did not accept glob patterns before Node 21, so the test script
  // names every file. That only stays true if something checks it.
  for (const file of testFiles) {
    ok(pkg.scripts.test.includes(`test/${file}`), `package.json test script does not name test/${file}`);
  }
  const named = [...pkg.scripts.test.matchAll(/test\/([\w.-]+\.test\.mjs)/g)].map((m) => m[1]);
  for (const file of named) {
    ok(testFiles.includes(file), `package.json names test/${file}, which does not exist`);
  }
  ok(
    pkg.scripts.test.includes('--test-reporter=tap'),
    'the test script does not name a reporter, so its output changes between Node versions'
  );

  // --------------------------------------------------------------- workflow
  ok(await exists('.github/workflows/verify.yml'), 'there is no CI workflow');
  const workflow = await read('.github/workflows/verify.yml');
  for (const step of ['npm test', 'npm run verify', 'npm run check', 'npm run docs']) {
    ok(workflow.includes(step), `the CI workflow does not run ${step}`);
  }
  const matrix = [...workflow.matchAll(/'(\d+)'/g)].map((m) => m[1]);
  ok(matrix.length >= 3, 'the CI workflow does not run a matrix of at least three Node versions');
  const floor = (pkg.engines.node.match(/(\d+)/) ?? [])[1];
  ok(matrix.includes(floor), `the CI workflow does not test the declared engines floor, Node ${floor}`);

  // ---------------------------------------------------------------- licence
  const licence = await read('LICENSE');
  ok(licence.includes('MIT License'), 'LICENSE is not MIT');
  ok(!/attribution/i.test(licence), 'LICENSE has acquired an attribution clause');

  // ------------------------------------------------------------------ docs
  for (const doc of ['docs/search-console-playbook.md', 'docs/what-the-checkers-cannot-see.md', 'docs/every-finding.md']) {
    ok(await exists(doc), `${doc} is missing`);
  }
  const limits = await read('docs/what-the-checkers-cannot-see.md');
  for (const kind of Object.keys(byKind)) {
    ok(limits.includes(kind), `docs/what-the-checkers-cannot-see.md says nothing about the ${kind} checker`);
  }

  // The assertion count quoted in the README is checked last, and it counts
  // itself. That is the only way a self-referential number can be made exact:
  // the figure in the README is the total including this check, so the two
  // cannot drift and no assertion can be added without the number moving.
  checks++;
  if (checkClaim === null) {
    failures.push('README.md does not quote a repository assertion count');
  } else if (Number(checkClaim[1]) !== checks) {
    failures.push(
      `the repository assertion count quoted in the README: expected ${checks}, found ${checkClaim[1]}`
    );
  }

  // ------------------------------------------------------------------ report
  if (failures.length) {
    for (const message of failures) console.log(`FAIL  ${message}`);
    console.log(`\n${checks} assertions, ${failures.length} failing.`);
    process.exit(1);
  }
  console.log(`${checks} repository assertions, all passing.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
