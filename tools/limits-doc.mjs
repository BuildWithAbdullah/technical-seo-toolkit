/**
 * limits-doc.mjs
 *
 * Generates docs/what-the-checkers-cannot-see.md from tools/limits.mjs, so the
 * document and the asserted limits cannot disagree.
 *
 *   npm run docs            write the file
 *   npm run docs -- --check exit non-zero if the file on disk is stale
 *
 * This is the generated document that matters most, and the reason is worth
 * stating. A paragraph saying a checker cannot see something still reads
 * correctly after the checker learns to see it. The document goes on being
 * reassuring and is now wrong, and a reader who trusts a caveat that is no
 * longer true is worse off than one who had no document at all. Generating it
 * from the manifest that test/limits.test.mjs asserts means a limit cannot
 * survive in prose after it has stopped being true: the test fails first, and
 * if the manifest is then corrected, this document moves with it.
 */

import { writeFile, readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import { limits } from './limits.mjs';
import { byId } from './catalogue.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'docs', 'what-the-checkers-cannot-see.md');

export function render() {
  const refusals = limits.filter((l) => l.refusal);
  const manufactured = limits.filter((l) => l.expectWrongly);
  const lines = [];

  lines.push('# What the checkers cannot see');
  lines.push('');
  lines.push('Generated from `tools/limits.mjs` by `npm run docs`. Do not edit by hand:');
  lines.push('CI regenerates this file and fails if it differs from what is committed.');
  lines.push('');
  lines.push(`There are ${limits.length} declared limits.`);
  lines.push('');
  lines.push('Every one of them is asserted rather than described, which is the only reason');
  lines.push('this document is worth reading. A sentence saying a checker cannot see');
  lines.push('something still reads correctly after the checker learns to see it, and a');
  lines.push('reader who trusts a caveat that is no longer true is worse off than one who had');
  lines.push('nothing. So each limit below carries two artefacts, and');
  lines.push('`test/limits.test.mjs` runs both:');
  lines.push('');
  lines.push('- a **blind** artefact the limit applies to, where the checker must stay quiet');
  lines.push('  about the findings the limit names');
  lines.push('- a **contrast** artefact, nearly identical, where the same checker must speak');
  lines.push('');
  lines.push('The second half is the one people leave out. Without it a limit is');
  lines.push('indistinguishable from a checker that simply does not work: silence is');
  lines.push('evidence of a blind spot only once the same code has been shown to fire.');
  lines.push('');
  lines.push(`## The ${refusals.length} limits where the checker says so`);
  lines.push('');
  lines.push('Two of these do not produce silence. The checker reports that an input it');
  lines.push('needed was absent and that a rule it owns was therefore not run, and that');
  lines.push('refusal is catalogued as a finding like any other. The distinction matters: a');
  lines.push('rule that quietly does nothing and a rule that reports it did nothing look');
  lines.push('identical from the outside, and only one of them is honest.');
  lines.push('');
  for (const limit of refusals) {
    lines.push(`- **${limit.title}** reports \`${limit.refusal}\`.`);
  }
  lines.push('');
  lines.push(`## The ${manufactured.length} limits that produce a finding that is wrong`);
  lines.push('');
  lines.push('These are the uncomfortable ones. The limit does not hide a fault, it invents');
  lines.push('one: the checker is confidently wrong about an artefact that is correct. They');
  lines.push('are listed out loud because a reader who hits one needs to recognise it, and');
  lines.push('the test suite holds the checker to being wrong in exactly the stated way.');
  lines.push('');
  for (const limit of manufactured) {
    lines.push(`- **${limit.title}** reports \`${limit.expectWrongly}\`, which is false of the page as a crawler sees it.`);
  }
  lines.push('');
  lines.push('## Every limit');
  lines.push('');

  for (const limit of limits) {
    lines.push(`### ${limit.title}`);
    lines.push('');
    lines.push(`Checker: \`${limit.kind}\`. Limit id: \`${limit.id}\`.`);
    lines.push('');
    lines.push(limit.what);
    lines.push('');
    if (limit.absent.length) {
      lines.push(`Asserted silent on: ${limit.absent.map((a) => `\`${a}\``).join(', ')}.`);
    } else {
      lines.push('Asserted on the finding it produces rather than on silence.');
    }
    if (limit.refusal) {
      lines.push('');
      lines.push(`Reports instead: \`${limit.refusal}\`, a ${byId.get(limit.refusal)?.severities.join(' or ') ?? 'note'}. The refusal is the limit holding.`);
    }
    if (limit.expectWrongly) {
      lines.push('');
      lines.push(`Reports wrongly: \`${limit.expectWrongly}\`. The artefact is correct and the checker says otherwise.`);
    }
    lines.push('');
    if (limit.contrastExpect) {
      lines.push(`Proved live by a contrast artefact that produces \`${limit.contrastExpect}\`.`);
    } else {
      lines.push('Proved live by a contrast artefact that the same checker reports completely clean.');
    }
    lines.push('');
  }

  lines.push('## What this document is not');
  lines.push('');
  lines.push('It is not the list of findings. That is [every finding, listed](every-finding.md),');
  lines.push('generated from the catalogue in the same way.');
  lines.push('');

  return lines.join('\n');
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
  const out = render();
  if (process.argv.includes('--check')) {
    const current = await readFile(TARGET, 'utf8').catch(() => null);
    if (current !== out) {
      console.error('docs/what-the-checkers-cannot-see.md is out of date. Run: npm run docs');
      process.exit(1);
    }
    console.log('docs/what-the-checkers-cannot-see.md is current.');
  } else {
    await writeFile(TARGET, out, 'utf8');
    console.log(`docs/what-the-checkers-cannot-see.md written: ${limits.length} limits.`);
  }
}
