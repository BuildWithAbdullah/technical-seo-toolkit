/**
 * repo-claims.mjs
 *
 * The repository verifier, as a fixed list of named claims.
 *
 * It checks the repository rather than the patterns: that every claim in the
 * README is a claim the code supports, that every pattern directory is
 * complete, that the generated documents are current, and that nothing in the
 * tree carries a real hostname or a forbidden character.
 *
 * Why the count used to be 1161 and is now a much smaller number
 * -------------------------------------------------------------
 * The previous version made one assertion per file for several of its rules:
 * four dash checks and an institution check on every text file, and one
 * assertion per hostname found anywhere in the tree. The total it printed, and
 * the total the README quoted, was therefore mostly a count of how many files
 * the repository has. Adding an unrelated document moved it. Adding a URL to a
 * comment moved it. A number that moves when something it is not about changes
 * is not a self check, it is a file census with an impressive label, and it
 * was the largest number on the account and the most misleading.
 *
 * So a claim is now a named thing that is true or false about the repository,
 * and it stays one claim however many files it has to read to decide. The
 * total is the length of this list. test/repo.test.mjs perturbs the tree in
 * four ways that used to move the old number and requires this one to stay
 * still, while the claims themselves still fail on the perturbations that are
 * genuinely wrong.
 *
 * The consequence worth stating: assertion totals are not comparable between
 * this repository and one that still counts per file.
 *
 * Why the claims are data rather than code
 * ----------------------------------------
 * Because tools/check.mjs is then wiring, and a test can import this file and
 * run the claims directly. One claim cannot be run from inside the suite: the
 * one that counts the tests spawns the test runner, so a test that ran it
 * would recurse until the machine gave up. That claim is marked
 * `spawnsRunner`, the test file skips it and asserts its structure instead,
 * and tools/check.mjs, which runs outside the runner, runs it.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { checkers, SEVERITIES } from './checkers.mjs';
import { findings, ids, byKind } from './catalogue.mjs';
import { limits, limitIds } from './limits.mjs';
import { render as renderCatalogueDoc } from './catalogue-doc.mjs';
import { render as renderLimitsDoc } from './limits-doc.mjs';
import { trackedFiles } from './tracked.mjs';
import { countTests } from './count-tests.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The forbidden characters cannot be written literally in a file this rule
// covers, and naming them by escape is no better, because writing a file
// through a tool payload decodes the escape into the character. So they are
// assembled from code points at runtime. The same applies to the institution
// name, which is why the needle below is built rather than spelled.
const DASHES = [
  [0x2014, 'em dash'],
  [0x2013, 'en dash'],
  [0x2012, 'figure dash'],
  [0x2015, 'horizontal bar'],
].map(([code, name]) => [String.fromCodePoint(code), name]);

const INSTITUTION = ['uni', 'versity'].join('');
// The accessibility help links in a sibling repository point at a host whose
// name contains the forbidden word, so it is removed before the question is
// asked. Spelling it out here would trip the check it exists to allow.
const ALLOWED_INSTITUTION_HOST = new RegExp(`deque${INSTITUTION}\\.com`, 'gi');

const TEXT = new Set(['.mjs', '.js', '.json', '.md', '.html', '.xml', '.yml', '.yaml', '.txt', '']);

/**
 * Which hostnames an example in this repository is allowed to name.
 *
 * The rule this repository is built under is patterns only: never a delivered
 * client's site, and never a domain a reader could mistake for one. So a
 * hostname has to be reserved for documentation, or a platform the example is
 * genuinely about.
 *
 * The final label must be example, or a prefix of it at least four characters
 * long. The prefix case is not laziness: the failing example for the
 * structured data pattern is a JSON-LD block cut off mid-string, so one URL in
 * it ends partway through the reserved suffix. That truncation is the artefact
 * doing its job and should not have to be rewritten to please a check.
 */
const RESERVED_EXAMPLE = /(^|\.)exam(p(l(e)?)?)?$|^example\.(com|org|net)$|\.example\.(com|org|net)$/;

const ALLOWED_HOSTS = new Set([
  'schema.org', 'www.schema.org', 'validator.schema.org',
  'sitemaps.org', 'www.sitemaps.org', 'www.w3.org',
  'developers.google.com', 'support.google.com', 'search.google.com',
  'tagassistant.google.com', 'opensource.org',
  'www.googletagmanager.com', 'www.google-analytics.com',
  'www.linkedin.com', 'www.instagram.com',
  'github.com',
]);

const hostAllowed = (host) => RESERVED_EXAMPLE.test(host) || ALLOWED_HOSTS.has(host);

/** Lines of a source file with the comment lines removed. */
export const withoutComments = (body) =>
  body
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*|#|<!--)/.test(line))
    .join('\n');

/**
 * A README count, matched as a whole line.
 *
 * A number in a README has to be matched as a line rather than as a pattern,
 * because a pattern finds the first occurrence anywhere and cannot tell a
 * wrapped number from a correct one. This splits the file into lines, matches
 * each, and fails when the number of matching lines is anything other than
 * exactly one, so both a wrapped number and a duplicated one fail.
 */
export function statedOnOneLine(readme, pattern, label) {
  const matches = readme.split('\n').filter((line) => pattern.test(line));
  if (matches.length === 0) return { problems: [`the README states no ${label}, as a whole line matching ${pattern}`] };
  if (matches.length > 1) return { problems: [`the README states the ${label} on ${matches.length} lines; it must appear exactly once`] };
  return { problems: [], value: Number(matches[0].match(pattern)[1]) };
}

const equals = (actual, expected, label) =>
  actual === expected ? [] : [`${label}: expected ${expected}, found ${actual}`];

/**
 * Build the context every claim reads from. Done once so that forty claims do
 * not walk the tree forty times, and so that a claim is a question rather than
 * a file reader.
 */
export async function buildContext(root = ROOT) {
  const files = await trackedFiles(root);
  const read = (rel) => readFile(path.join(root, rel), 'utf8');
  const exists = (rel) => stat(path.join(root, rel)).then(() => true, () => false);

  const textFiles = files.filter((rel) => TEXT.has(path.extname(rel)));
  const bodies = new Map();
  for (const rel of textFiles) bodies.set(rel, await read(rel));

  const patternDirs = (await readdir(path.join(root, 'patterns'), { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const metas = new Map();
  for (const dir of patternDirs) {
    metas.set(dir, JSON.parse(await read(path.join('patterns', dir, 'meta.json'))));
  }

  return {
    root,
    files,
    textFiles,
    bodies,
    read,
    exists,
    patternDirs,
    metas,
    pkg: JSON.parse(await read('package.json')),
    readme: await read('README.md'),
    workflow: (await exists('.github/workflows/verify.yml')) ? await read('.github/workflows/verify.yml') : '',
    licence: await read('LICENSE'),
  };
}

/**
 * The claims. One entry is one named thing that is true or false about this
 * repository, whatever number of files it has to read to decide.
 */
export const claims = [
  {
    name: 'no file carries a dash character the house style forbids',
    check: (ctx) => {
      const problems = [];
      for (const [rel, body] of ctx.bodies) {
        for (const [dash, name] of DASHES) {
          if (body.includes(dash)) problems.push(`${rel} contains a ${name}`);
        }
      }
      return problems;
    },
  },
  {
    name: 'no file names the institution the profile does not mention',
    check: (ctx) => {
      const needle = new RegExp(INSTITUTION, 'i');
      const problems = [];
      for (const [rel, body] of ctx.bodies) {
        if (needle.test(body.replace(ALLOWED_INSTITUTION_HOST, ''))) {
          problems.push(`${rel} refers to an institution the profile does not mention`);
        }
      }
      return problems;
    },
  },
  {
    name: 'every hostname in the tree is reserved for documentation or allowlisted',
    check: (ctx) => {
      const problems = [];
      for (const [rel, body] of ctx.bodies) {
        if (rel === 'tools/repo-claims.mjs') continue; // the allowlist itself
        for (const match of body.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
          const host = match[1].toLowerCase().replace(/\.$/, '');
          if (!hostAllowed(host)) {
            problems.push(`${rel} names the host ${host}, which is neither reserved for documentation nor on the allowlist`);
          }
        }
      }
      return problems;
    },
  },
  {
    name: 'every pattern directory holds a readme, a manifest and both examples',
    check: async (ctx) => {
      const problems = [];
      for (const dir of ctx.patternDirs) {
        const entries = await readdir(path.join(ctx.root, 'patterns', dir));
        if (!entries.includes('README.md')) problems.push(`patterns/${dir} has no README.md`);
        if (!entries.includes('meta.json')) problems.push(`patterns/${dir} has no meta.json`);
        if (!entries.some((e) => e.startsWith('fail.'))) problems.push(`patterns/${dir} has no failing example`);
        if (!entries.some((e) => e.startsWith('pass.'))) problems.push(`patterns/${dir} has no corrected example`);
      }
      return problems;
    },
  },
  {
    name: 'every manifest names its own directory as its slug',
    check: (ctx) => ctx.patternDirs.flatMap((dir) => equals(ctx.metas.get(dir).slug, dir, `patterns/${dir}/meta.json slug`)),
  },
  {
    name: 'every manifest names a checker that exists',
    check: (ctx) => ctx.patternDirs
      .filter((dir) => !Object.hasOwn(checkers, ctx.metas.get(dir).kind))
      .map((dir) => `patterns/${dir} names kind "${ctx.metas.get(dir).kind}", which is not a checker`),
  },
  {
    name: 'every manifest declares a non-empty set of expected findings',
    check: (ctx) => ctx.patternDirs
      .filter((dir) => !(Array.isArray(ctx.metas.get(dir).expect) && ctx.metas.get(dir).expect.length > 0))
      .map((dir) => `patterns/${dir} declares no expected findings`),
  },
  {
    name: 'every expected finding is catalogued, under the kind the pattern names',
    check: (ctx) => {
      const problems = [];
      for (const dir of ctx.patternDirs) {
        const meta = ctx.metas.get(dir);
        for (const id of meta.expect ?? []) {
          const catalogued = findings.find((f) => f.id === id);
          if (!catalogued) problems.push(`patterns/${dir} expects ${id}, which is not catalogued`);
          else if (catalogued.kind !== meta.kind) problems.push(`patterns/${dir} expects ${id}, catalogued under ${catalogued.kind} rather than ${meta.kind}`);
        }
      }
      return problems;
    },
  },
  {
    name: 'every pattern readme explains the pattern and names it',
    check: async (ctx) => {
      const problems = [];
      for (const dir of ctx.patternDirs) {
        const readme = await ctx.read(path.join('patterns', dir, 'README.md'));
        if (readme.length <= 400) problems.push(`patterns/${dir}/README.md is too short to explain anything`);
        if (!readme.includes(ctx.metas.get(dir).name)) problems.push(`patterns/${dir}/README.md does not state the pattern name from meta.json`);
      }
      return problems;
    },
  },
  {
    name: 'every manifest records whether Search Console reports the pattern, with a note',
    check: (ctx) => ctx.patternDirs.flatMap((dir) => {
      const meta = ctx.metas.get(dir);
      const problems = [];
      if (typeof meta.gscReports !== 'boolean') problems.push(`patterns/${dir} does not record gscReports`);
      if (!meta.gscNote || meta.gscNote.length < 60) problems.push(`patterns/${dir} has no usable gscNote`);
      if (!meta.manualCheck || meta.manualCheck.length < 60) problems.push(`patterns/${dir} has no usable manualCheck`);
      return problems;
    }),
  },
  { name: 'the catalogue has no duplicate ids', check: () => equals(new Set(ids).size, ids.length, 'unique catalogued ids') },
  {
    name: 'every catalogued finding names a kind that exists',
    check: () => findings.filter((f) => !Object.hasOwn(checkers, f.kind)).map((f) => `${f.id} names a kind that does not exist`),
  },
  {
    name: 'every catalogued finding carries a description worth reading',
    check: () => findings.filter((f) => f.what.length <= 25).map((f) => `${f.id} has no useful description`),
  },
  {
    name: 'every catalogued finding records whether Search Console reports it',
    check: () => findings.filter((f) => typeof f.silent !== 'boolean').map((f) => `${f.id} does not record whether Search Console reports it`),
  },
  {
    name: 'every catalogued finding declares at least one real severity',
    check: () => findings.flatMap((f) => {
      if (!Array.isArray(f.severities) || f.severities.length === 0) return [`${f.id} declares no severities`];
      return f.severities.filter((s) => !SEVERITIES.includes(s)).map((s) => `${f.id} declares severity "${s}"`);
    }),
  },
  {
    name: 'every id the checkers can emit is catalogued, and the two sets are the same size',
    check: async (ctx) => {
      // The source is scanned rather than trusted, because the test suite
      // proves reachability and this proves completeness, and the two fail in
      // different ways. Comment lines are dropped first: without that, this
      // assertion reads the prose that explains it and reports the
      // explanation as a breach.
      const source = withoutComments(await ctx.read('tools/checkers.mjs'));
      const emitted = new Set([...source.matchAll(/\bp\(\s*['"]([a-z0-9-]+)['"]/g)].map((m) => m[1]));
      const problems = [...emitted].filter((id) => !ids.includes(id)).map((id) => `checkers.mjs can emit ${id}, which is not in the catalogue`);
      return [...problems, ...equals(emitted.size, ids.length, 'the number of ids in checkers.mjs against the catalogue')];
    },
  },
  {
    name: 'the generated catalogue document is current',
    check: async (ctx) => {
      if (!(await ctx.exists('docs/every-finding.md'))) return ['docs/every-finding.md is missing'];
      return (await ctx.read('docs/every-finding.md')) === renderCatalogueDoc()
        ? []
        : ['docs/every-finding.md is out of date; run npm run docs'];
    },
  },
  {
    name: 'the generated limits document is current',
    check: async (ctx) => {
      if (!(await ctx.exists('docs/what-the-checkers-cannot-see.md'))) return ['docs/what-the-checkers-cannot-see.md is missing'];
      return (await ctx.read('docs/what-the-checkers-cannot-see.md')) === renderLimitsDoc()
        ? []
        : ['docs/what-the-checkers-cannot-see.md is out of date; run npm run docs'];
    },
  },
  {
    name: 'the limits document is generated rather than written by hand',
    check: async (ctx) => {
      // The reason it is generated at all. A paragraph saying a checker cannot
      // see something still reads correctly after the checker learns to see
      // it, and a reader then trusts a caveat that is no longer true.
      const workflow = ctx.workflow;
      return workflow.includes('npm run docs:check')
        ? []
        : ['no CI step regenerates and compares the generated documents'];
    },
  },
  {
    name: 'every declared limit names a checker that exists and explains itself',
    check: () => limits.flatMap((l) => {
      const problems = [];
      if (!Object.hasOwn(checkers, l.kind)) problems.push(`limit ${l.id} names kind "${l.kind}", which is not a checker`);
      if (l.what.length <= 180) problems.push(`limit ${l.id} needs an explanation rather than a label`);
      if (!Array.isArray(l.absent)) problems.push(`limit ${l.id} declares no absent list`);
      return problems;
    }),
  },
  { name: 'every declared limit has an id of its own', check: () => equals(new Set(limitIds).size, limitIds.length, 'unique limit ids') },
  {
    name: 'the limits between them cover every checker',
    check: () => {
      const covered = new Set(limits.map((l) => l.kind));
      return Object.keys(checkers).filter((k) => !covered.has(k)).map((k) => `no declared limit covers the "${k}" checker`);
    },
  },
  {
    name: 'the limits document says something about every checker',
    check: async (ctx) => {
      const doc = await ctx.read('docs/what-the-checkers-cannot-see.md');
      return Object.keys(byKind).filter((kind) => !doc.includes(kind)).map((kind) => `the limits document says nothing about the ${kind} checker`);
    },
  },
  { name: 'the README has a Verifying section', check: (ctx) => (ctx.readme.includes('## Verifying') ? [] : ['README.md has no Verifying section']) },
  { name: 'the README has a Limits section', check: (ctx) => (ctx.readme.includes('## Limits') ? [] : ['README.md has no Limits section']) },
  { name: 'the README states the licence', check: (ctx) => (ctx.readme.includes('MIT') ? [] : ['README.md does not state the licence']) },
  {
    name: 'the README links every pattern directory',
    check: (ctx) => ctx.patternDirs.filter((dir) => !ctx.readme.includes(`patterns/${dir}/`)).map((dir) => `README.md does not link patterns/${dir}/`),
  },
  {
    name: 'the README headline counts the silent patterns correctly',
    check: (ctx) => {
      const silent = ctx.patternDirs.filter((dir) => !ctx.metas.get(dir).gscReports).length;
      const headline = ctx.readme.match(/\*\*(\w+) of the (\w+) patterns produce no report in Search Console\.\*\*/);
      if (!headline) return ['README.md no longer carries the Search Console headline claim in the expected form'];
      const words = { four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
      return [
        ...equals(words[headline[1].toLowerCase()], silent, 'the README headline count of silent patterns'),
        ...equals(words[headline[2].toLowerCase()], ctx.patternDirs.length, 'the README headline count of patterns'),
      ];
    },
  },
  {
    name: 'the README states the catalogued finding count, once, correctly',
    check: (ctx) => {
      const stated = statedOnOneLine(ctx.readme, /(\d+) catalogued findings/, 'catalogued finding count');
      return stated.problems.length ? stated.problems : equals(stated.value, ids.length, 'the finding count quoted in the README');
    },
  },
  {
    name: 'the README states the pattern count, once, correctly',
    check: (ctx) => {
      const stated = statedOnOneLine(ctx.readme, /(\d+) pattern pairs/, 'pattern pair count');
      return stated.problems.length ? stated.problems : equals(stated.value, ctx.patternDirs.length, 'the pattern count quoted in the README');
    },
  },
  {
    name: 'the README states the declared limit count, once, correctly',
    check: (ctx) => {
      const stated = statedOnOneLine(ctx.readme, /(\d+) declared limits/, 'declared limit count');
      return stated.problems.length ? stated.problems : equals(stated.value, limits.length, 'the limit count quoted in the README');
    },
  },
  {
    name: 'the README states the repository assertion count, once, correctly',
    check: (ctx) => {
      const stated = statedOnOneLine(ctx.readme, /(\d+) repository assertions/, 'repository assertion count');
      return stated.problems.length ? stated.problems : equals(stated.value, claims.length, 'the assertion count quoted in the README');
    },
  },
  {
    name: 'the README states the test count, once, and the suite is green and agrees',
    spawnsRunner: true,
    check: (ctx) => {
      const stated = statedOnOneLine(ctx.readme, /(\d+) tests/, 'test count');
      if (stated.problems.length) return stated.problems;
      const { tests, failed } = countTests(ctx.root);
      // A count from a red run means nothing: a file that fails to load counts
      // as one test, so the number is real and the suite is not.
      if (failed > 0) return [`the suite is not green (${failed} failing), so its test count cannot be compared against the README`];
      return equals(stated.value, tests, 'the test count quoted in the README');
    },
  },
  {
    name: 'package.json declares every script the workflow runs',
    check: (ctx) => ['test', 'verify', 'check', 'docs', 'docs:check', 'verdicts', 'thin', 'count']
      .filter((s) => !Object.hasOwn(ctx.pkg.scripts ?? {}, s))
      .map((s) => `package.json has no ${s} script`),
  },
  {
    name: 'package.json declares an engines floor as a range, with all three components',
    check: (ctx) => {
      const declared = ctx.pkg.engines?.node;
      if (declared === undefined) return ['package.json declares no engines.node'];
      // An exact value with no operator is a pin rather than a floor, and it
      // makes npm install --engine-strict fail on every other version. A bare
      // major is not a tested promise either, because setup-node resolves one
      // to the newest release of that line.
      if (!/^>=\d+\.\d+\.\d+$/.test(declared)) {
        return [`engines.node is "${declared}"; it has to be >= followed by an exact major.minor.patch`];
      }
      return [];
    },
  },
  { name: 'package.json is a module package', check: (ctx) => (ctx.pkg.type === 'module' ? [] : ['package.json is not a module package']) },
  {
    name: 'the test script names every test file and nothing that does not exist',
    check: async (ctx) => {
      const onDisk = (await readdir(path.join(ctx.root, 'test'))).filter((f) => f.endsWith('.test.mjs')).sort();
      const named = [...ctx.pkg.scripts.test.matchAll(/test\/([\w.-]+\.test\.mjs)/g)].map((m) => m[1]);
      return [
        ...onDisk.filter((f) => !named.includes(f)).map((f) => `package.json test script does not name test/${f}`),
        ...named.filter((f) => !onDisk.includes(f)).map((f) => `package.json names test/${f}, which does not exist`),
      ];
    },
  },
  {
    name: 'the test script names a reporter, so its output does not change with Node',
    check: (ctx) => (ctx.pkg.scripts.test.includes('--test-reporter=') ? [] : ['the test script does not name a reporter']),
  },
  {
    name: 'the CI workflow exists and runs every gate',
    check: (ctx) => {
      if (!ctx.workflow) return ['there is no CI workflow'];
      return ['npm test', 'npm run verify', 'npm run check', 'npm run docs:check', 'npm run verdicts', 'npm run thin']
        .filter((step) => !ctx.workflow.includes(step))
        .map((step) => `the CI workflow does not run ${step}`);
    },
  },
  {
    name: 'the CI matrix names at least three exact Node versions',
    check: (ctx) => {
      const matrix = [...ctx.workflow.matchAll(/'(\d+\.\d+\.\d+)'/g)].map((m) => m[1]);
      const unique = [...new Set(matrix)];
      return unique.length >= 3 ? [] : [`the CI workflow names ${unique.length} exact Node versions and needs at least three`];
    },
  },
  {
    name: 'the CI matrix tests the declared engines floor exactly',
    check: (ctx) => {
      const floor = (ctx.pkg.engines?.node ?? '').replace('>=', '');
      const matrix = [...ctx.workflow.matchAll(/'(\d+\.\d+\.\d+)'/g)].map((m) => m[1]);
      return matrix.includes(floor) ? [] : [`the CI workflow does not test the declared floor, Node ${floor}; it names ${matrix.join(', ') || 'nothing exact'}`];
    },
  },
  {
    name: 'no CI step redirects the output of an npm run',
    check: (ctx) => {
      // npm run writes a banner to stdout, so a step that redirects one into a
      // file writes the banner into the file. Comment lines are dropped first,
      // because otherwise this assertion reads the comment that explains it
      // and reports the explanation as a breach.
      const body = withoutComments(ctx.workflow);
      return [...body.matchAll(/^.*npm run .*>.*$/gm)].map((m) => `a CI step redirects an npm run: ${m[0].trim()}`);
    },
  },
  {
    name: 'the licence is MIT and has not acquired an attribution clause',
    check: (ctx) => [
      ...(ctx.licence.includes('MIT License') ? [] : ['LICENSE is not MIT']),
      ...(/attribution/i.test(ctx.licence) ? ['LICENSE has acquired an attribution clause'] : []),
    ],
  },
  {
    name: 'every documented file is present',
    check: async (ctx) => {
      const docs = ['docs/search-console-playbook.md', 'docs/what-the-checkers-cannot-see.md', 'docs/every-finding.md'];
      const missing = [];
      for (const doc of docs) if (!(await ctx.exists(doc))) missing.push(`${doc} is missing`);
      return missing;
    },
  },
  {
    name: 'every tool carrying the main-module guard spells it the same way',
    check: (ctx) => {
      // Cheaper than testing each one, and it catches a copy that drifted.
      // Both sides have to be resolved to a real path, because npm installs a
      // bin as a symlink and Node resolves a module path to its realpath, and
      // the argv check in front is needed because realpathSync throws when the
      // module is imported by node -e.
      const problems = [];
      for (const [rel, body] of ctx.bodies) {
        if (!rel.startsWith('tools/')) continue;
        // Any tool that asks whether it is the entry point, however it spells
        // the question. Keying this on the name of the helper variable would
        // have missed tools/catalogue-doc.mjs, which asked by concatenating a
        // scheme onto a path and therefore never matched on Windows: both
        // halves of that tool silently did nothing, including the staleness
        // gate CI depends on.
        if (!/(===\s*import\.meta\.url|import\.meta\.url\s*===)/.test(withoutComments(body))) continue;
        if (!body.includes('if (!process.argv[1]) return false;')) {
          problems.push(`${rel} guards on the main module without checking process.argv[1] first`);
        }
        if (!body.includes('pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url')) {
          problems.push(`${rel} does not resolve both sides of the main-module comparison to a real path`);
        }
        if (/['"`]file:\/\//.test(withoutComments(body))) {
          problems.push(`${rel} builds a file URL by concatenation, which is wrong on Windows`);
        }
      }
      return problems;
    },
  },
  {
    name: 'nothing the package ships imports from a directory it does not ship',
    check: (ctx) => {
      // The specifier is resolved against the importing file rather than
      // against the repository root, because a relative import means nothing
      // otherwise.
      const problems = [];
      for (const [rel, body] of ctx.bodies) {
        if (!rel.startsWith('tools/')) continue;
        for (const match of withoutComments(body).matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
          const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), match[1]));
          if (target.startsWith('test/')) {
            problems.push(`${rel} imports ${match[1]}, which resolves to ${target}, a directory the package does not ship`);
          }
        }
      }
      return problems;
    },
  },
  {
    name: 'the gitignore matcher agrees with the repository it is checking',
    check: (ctx) => {
      // tools/tracked.mjs decides which files the other claims read. If it is
      // wrong, every file-walking claim above is quietly wrong with it. The
      // cheap check is that it finds the files this repository certainly has
      // and none of the ones it certainly ignores.
      const problems = [];
      for (const required of ['package.json', 'README.md', 'tools/checkers.mjs', '.github/workflows/verify.yml']) {
        if (!ctx.files.includes(required)) problems.push(`the tracked file list is missing ${required}`);
      }
      for (const excluded of ctx.files) {
        if (excluded.startsWith('node_modules/') || excluded === 'package-lock.json') {
          problems.push(`the tracked file list includes ${excluded}, which .gitignore excludes`);
        }
      }
      return problems;
    },
  },
];

export const claimNames = claims.map((c) => c.name);

/** Run every claim, or every claim that does not spawn the test runner. */
export async function runClaims({ root = ROOT, skipRunner = false } = {}) {
  const ctx = await buildContext(root);
  const failures = [];
  let ran = 0;
  for (const claim of claims) {
    if (skipRunner && claim.spawnsRunner) continue;
    ran++;
    for (const problem of await claim.check(ctx)) {
      failures.push(`${claim.name}: ${problem}`);
    }
  }
  return { ran, total: claims.length, failures };
}
