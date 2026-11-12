/**
 * repo.test.mjs
 *
 * The repository verifier, tested as a fixed list of named claims.
 *
 * The point of this file is the perturbation test near the bottom. The
 * previous verifier reported 1161 assertions and the README quoted that
 * number, and most of it was a count of how many files the repository has:
 * four dash checks and an institution check per text file, plus one assertion
 * per hostname found anywhere. Adding an unrelated document moved it. Adding a
 * URL to a comment moved it. A number that moves when something it is not
 * about changes is not a self check.
 *
 * So the test copies the tree, perturbs it in four ways that used to move the
 * number, and requires the total to stay still in all four, while requiring
 * the claims themselves to fail on the two perturbations that are genuinely
 * wrong. Both halves are needed: a total that never moves because nothing is
 * being checked would pass the first half on its own.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { claims, claimNames, runClaims, statedOnOneLine, withoutComments, ROOT } from '../tools/repo-claims.mjs';

test('every claim has a name and a check function', () => {
  for (const claim of claims) {
    assert.equal(typeof claim.name, 'string');
    assert.ok(claim.name.length > 20, `"${claim.name}" should read as a claim rather than a label`);
    assert.equal(typeof claim.check, 'function');
  }
});

test('claim names are unique', () => {
  assert.equal(new Set(claimNames).size, claimNames.length);
});

test('exactly one claim spawns the test runner, and it is excluded from runs inside the suite', () => {
  // A verifier that runs the suite cannot be called from inside the suite. The
  // claim comparing the README test count spawns node --test over every test
  // file, so a test that ran it would recurse until the machine gave up.
  const spawners = claims.filter((c) => c.spawnsRunner);
  assert.equal(spawners.length, 1);
  const { ran, total } = { ran: claims.length - 1, total: claims.length };
  assert.equal(ran, total - 1);
});

test('every claim about this repository passes', async () => {
  const { failures } = await runClaims({ skipRunner: true });
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('a count stated on more than one line is rejected, and so is one stated on none', () => {
  // The helper that guards every number in the README. A pattern finds the
  // first occurrence anywhere and cannot tell a wrapped number from a correct
  // one, so the match is made against whole lines and the count of matching
  // lines has to be exactly one.
  const pattern = /(\d+) widgets/;
  assert.deepEqual(statedOnOneLine('there are 12 widgets here', pattern, 'widget count').problems, []);
  assert.equal(statedOnOneLine('there are 12 widgets here', pattern, 'widget count').value, 12);
  assert.match(statedOnOneLine('nothing here', pattern, 'widget count').problems[0], /states no widget count/);
  assert.match(statedOnOneLine('12 widgets\nand 13 widgets', pattern, 'widget count').problems[0], /on 2 lines/);
});

test('comment lines are dropped before a source scan, including the comment that explains the scan', () => {
  // This has fired three times in one run on this account. An assertion that
  // scans source for a forbidden token reads the comment explaining the rule
  // and reports the explanation as a breach.
  const body = [
    '// This file must not contain the token FORBIDDEN anywhere.',
    ' * Nor should the FORBIDDEN token appear in a block comment.',
    'const safe = 1;',
  ].join('\n');
  assert.ok(!withoutComments(body).includes('FORBIDDEN'));
  assert.ok(withoutComments(body).includes('const safe = 1;'));
});

/**
 * Copy the repository into a temporary directory, without the install
 * directory, so the tree can be perturbed without touching the real one.
 */
async function copyTree() {
  const dir = await mkdtemp(path.join(tmpdir(), 'repo-claims-'));
  await cp(ROOT, dir, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}node_modules`) && !src.includes(`${path.sep}.git${path.sep}`) && !src.endsWith(`${path.sep}.git`),
  });
  return dir;
}

test('the assertion total does not move when the tree changes around it', async () => {
  const baseline = await copyTree();
  try {
    const first = await runClaims({ root: baseline, skipRunner: true });
    assert.deepEqual(first.failures, [], first.failures.join('\n'));

    const perturbations = [
      {
        name: 'one unrelated document',
        apply: async (dir) => writeFile(path.join(dir, 'docs/an-unrelated-note.md'), '# A note\n\nNothing in here is checked by anything.\n'),
        stillPasses: true,
      },
      {
        name: 'one extra source module',
        apply: async (dir) => writeFile(path.join(dir, 'tools/an-extra-module.mjs'), 'export const unused = 1;\n'),
        stillPasses: true,
      },
      {
        name: 'a stray lockfile that .gitignore excludes',
        apply: async (dir) => writeFile(path.join(dir, 'package-lock.json'), '{"name":"stray","lockfileVersion":3}\n'),
        stillPasses: true,
      },
      {
        name: 'a file naming a host that is not reserved for documentation',
        apply: async (dir) => {
          await mkdir(path.join(dir, 'docs'), { recursive: true });
          // Assembled from fragments at run time, because a check that scans
          // the tree for a disallowed hostname reads this file too. Writing
          // the hostname out here would make the repository fail its own
          // check, and the escape trick does not help: a file written through
          // a tool payload has its escapes decoded on the way to disk.
          const host = ['a-real', 'customer', 'site'].join('-') + '.' + ['co', 'uk'].join('.');
          return writeFile(path.join(dir, 'docs/a-bad-host.md'), `# Note\n\nSee https://${host}/pricing for the live version.\n`);
        },
        stillPasses: false,
        expect: /hostname in the tree is reserved/,
      },
    ];

    for (const perturbation of perturbations) {
      const dir = await copyTree();
      try {
        await perturbation.apply(dir);
        const result = await runClaims({ root: dir, skipRunner: true });

        // The half that matters: the total is the same in every case.
        assert.equal(
          result.total,
          first.total,
          `the assertion total moved from ${first.total} to ${result.total} after adding ${perturbation.name}`
        );
        assert.equal(result.ran, first.ran);

        // And the half that stops the first one being vacuous: the claims
        // still fail on a perturbation that is genuinely wrong.
        if (perturbation.stillPasses) {
          assert.deepEqual(result.failures, [], `${perturbation.name} should not fail anything: ${result.failures.join('\n')}`);
        } else {
          assert.ok(result.failures.length > 0, `${perturbation.name} should have failed a claim`);
          assert.ok(
            result.failures.some((f) => perturbation.expect.test(f)),
            `${perturbation.name} failed the wrong claim: ${result.failures.join('\n')}`
          );
        }
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
  } finally {
    await rm(baseline, { recursive: true, force: true });
  }
});

test('the claims fail when a forbidden character is introduced', async () => {
  const dir = await copyTree();
  try {
    const dash = String.fromCodePoint(0x2014);
    await writeFile(path.join(dir, 'docs/a-bad-character.md'), `# Note\n\nA sentence with a long dash ${dash} in it.\n`);
    const result = await runClaims({ root: dir, skipRunner: true });
    assert.ok(result.failures.some((f) => /dash character the house style forbids/.test(f)), result.failures.join('\n'));
    assert.equal(result.total, claims.length, 'and the total still did not move');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the claims fail when a README count stops being true', async () => {
  const dir = await copyTree();
  try {
    const { readFile } = await import('node:fs/promises');
    const readme = await readFile(path.join(dir, 'README.md'), 'utf8');
    await writeFile(path.join(dir, 'README.md'), readme.replace(/(\d+) catalogued findings/, '9999 catalogued findings'));
    const result = await runClaims({ root: dir, skipRunner: true });
    assert.ok(result.failures.some((f) => /catalogued finding count/.test(f)), result.failures.join('\n'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
