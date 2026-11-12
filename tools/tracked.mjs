/**
 * tracked.mjs
 *
 * Which files in the working tree git would track, decided by reading
 * .gitignore rather than by asking git.
 *
 * A verifier that counts or scans the files in a repository has to agree with
 * the repository. Asking git is the obvious answer and it is wrong in both
 * directions during a build: git does not know about a file that was written a
 * second ago and still lists one that was just removed. Walking the tree and
 * applying .gitignore gives the answer for the tree as it is now, which is the
 * tree being checked.
 *
 * The rules implemented, which are the ones that turn up in practice:
 *
 *   a pattern with no slash matches at any depth
 *   a pattern with a slash is anchored to the repository root
 *   a trailing slash matches directories only
 *   a leading ! re-includes, and the last matching rule wins
 *   * does not cross a slash, ** does
 *
 * And the rule that is easy to get wrong: a negation cannot re-include a file
 * inside an excluded directory, because git never walks into it. CI checks this
 * implementation against `git ls-files` on a purpose-built tree, including that
 * case.
 */

import { readdir, readFile, stat } from 'node:fs/promises';

const ALWAYS_SKIP = new Set(['.git']);

const toRegExp = (glob) => {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        // ** crosses separators. A trailing /** matches everything below.
        i++;
        if (glob[i + 1] === '/') {
          i++;
          out += '(?:.*/)?';
        } else {
          out += '.*';
        }
      } else {
        out += '[^/]*';
      }
    } else if (ch === '?') {
      out += '[^/]';
    } else if ('.+^${}()|[]\\'.includes(ch)) {
      out += `\\${ch}`;
    } else {
      out += ch;
    }
  }
  return out;
};

/** Parse .gitignore text into ordered rules. */
export function parseIgnore(text) {
  const rules = [];
  for (const raw of String(text).split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    let negated = false;
    if (line.startsWith('!')) {
      negated = true;
      line = line.slice(1);
    }
    let dirOnly = false;
    if (line.endsWith('/')) {
      dirOnly = true;
      line = line.slice(0, -1);
    }
    const anchored = line.includes('/');
    const body = toRegExp(line.replace(/^\//, ''));
    const source = anchored ? `^${body}$` : `(?:^|/)${body}$`;
    rules.push({ negated, dirOnly, re: new RegExp(source) });
  }
  return rules;
}

/**
 * Whether a path, relative to the repository root and with forward slashes, is
 * ignored. The last matching rule wins, which is what makes negation work.
 */
export function isIgnored(relPath, rules, isDirectory = false) {
  let ignored = false;
  for (const rule of rules) {
    if (rule.dirOnly && !isDirectory) continue;
    if (rule.re.test(relPath)) ignored = !rule.negated;
  }
  return ignored;
}

/** Every file git would track, relative to root, sorted. */
export async function trackedFiles(root) {
  let rules = [];
  try {
    rules = parseIgnore(await readFile(`${root}/.gitignore`, 'utf8'));
  } catch {
    rules = [];
  }

  const out = [];
  const walk = async (dir, prefix) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (ALWAYS_SKIP.has(entry.name)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = `${dir}/${entry.name}`;
      let isDir = entry.isDirectory();
      if (entry.isSymbolicLink()) {
        isDir = await stat(full).then((s) => s.isDirectory(), () => false);
      }
      // An excluded directory is not walked at all, which is why a negation
      // inside one cannot bring a file back.
      if (isIgnored(rel, rules, isDir)) continue;
      if (isDir) await walk(full, rel);
      else out.push(rel);
    }
  };
  await walk(root, '');
  return out.sort();
}
