/**
 * catalogue-doc.mjs
 *
 * Generates docs/every-finding.md from tools/catalogue.mjs, so the document and
 * the code cannot disagree.
 *
 *   npm run docs            write the file
 *   npm run docs -- --check exit non-zero if the file on disk is stale
 *
 * CI runs the second form. A finding added to the catalogue without regenerating
 * the document fails the build, which is the only reliable way a generated
 * document stays current.
 */

import { writeFile, readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import { findings, byKind, absenceIds } from './catalogue.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'docs', 'every-finding.md');

const KIND_TITLES = {
  canonical: 'Canonical tags',
  hreflang: 'hreflang clusters',
  headings: 'Heading outline',
  analytics: 'Analytics tag hygiene',
  'jsonld-syntax': 'Structured data: does it parse',
  'jsonld-graph': 'Structured data: the entity graph',
  'jsonld-breadcrumb': 'Structured data: breadcrumbs',
  sitemap: 'Sitemap contents',
  robots: 'Crawling versus indexing',
  redirects: 'Redirect maps',
};

export function render() {
  const silent = findings.filter((f) => f.silent).length;
  const lines = [];

  lines.push('# Every finding, listed');
  lines.push('');
  lines.push('Generated from `tools/catalogue.mjs` by `npm run docs`. Do not edit by hand:');
  lines.push('CI regenerates this file and fails if it differs from what is committed.');
  lines.push('');
  lines.push(`There are ${findings.length} findings across ${Object.keys(byKind).length} checkers.`);
  lines.push(`${silent} of them describe faults Search Console reports nothing about.`);
  lines.push('');
  lines.push('`test/catalogue.test.mjs` drives every one of them out of a real call into a');
  lines.push('real checker and then asserts set equality in both directions, so nothing in');
  lines.push('this list is unreachable and nothing a checker emits is missing from it.');
  lines.push('');
  lines.push('The **Silent** column is the one worth reading. A yes means Search Console,');
  lines.push('Lighthouse and the Rich Results Test will all stay quiet while the fault is');
  lines.push('live, which is why these are the expensive ones.');
  lines.push('');
  lines.push('The **Absence** column marks a finding that reports the absence of a thing');
  lines.push('rather than a fault in it. Each of those fires on an empty file, correctly, and');
  lines.push('for that reason none of them counts as evidence that a failing example');
  lines.push('demonstrates anything.');
  lines.push('');

  for (const [kind, group] of Object.entries(byKind)) {
    lines.push(`## ${KIND_TITLES[kind] ?? kind}`);
    lines.push('');
    lines.push(`Checker: \`${kind}\`, ${group.length} findings.`);
    lines.push('');
    lines.push('| Finding | What it means | Silent | Absence |');
    lines.push('|---|---|---|---|');
    for (const f of group) {
      lines.push(
        `| \`${f.id}\` | ${f.what} | ${f.silent ? 'yes' : 'no'} | ${absenceIds.has(f.id) ? 'yes' : ''} |`
      );
    }
    lines.push('');
  }

  lines.push('## What is not here');
  lines.push('');
  lines.push('Everything these checkers cannot see, which is a longer list than this one and');
  lines.push('is written out in [what the checkers cannot see](what-the-checkers-cannot-see.md).');
  lines.push('');

  return lines.join('\n');
}

/**
 * The CLI half runs only when this file is the entry point, so that importing
 * render() has no side effects.
 *
 * It used to compare import.meta.url against a file URL built by concatenating
 * the scheme onto process.argv[1]. That is wrong on Windows, where a path does
 * not begin with a slash, so the comparison never matched and both halves of
 * this tool did nothing at all: npm run docs wrote no file and exited 0, and
 * the --check form CI depends on reported nothing and exited 0 as well. A
 * staleness gate that passes by never running is worse than no gate.
 *
 * Both sides are now resolved to a real path, because npm installs a bin as a
 * symlink and Node resolves a module path to its realpath, and argv[1] is
 * checked first because realpathSync throws when the module is imported by
 * node -e.
 */
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
      console.error('docs/every-finding.md is out of date. Run: npm run docs');
      process.exit(1);
    }
    console.log('docs/every-finding.md is current.');
  } else {
    await writeFile(TARGET, out, 'utf8');
    console.log(`docs/every-finding.md written: ${findings.length} findings.`);
  }
}
