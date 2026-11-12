/**
 * check.mjs
 *
 * The entry point for `npm run check`. It runs the claims in
 * tools/repo-claims.mjs, prints what came back and sets the exit code.
 *
 * There is deliberately nothing else in it. Every judgement about the
 * repository lives in repo-claims.mjs, which exports the claims as data so a
 * test can import them and run them. A file that is only ever run as a program
 * is a file no test covers, and this one used to hold three hundred lines of
 * decisions.
 *
 * tools/entry-thin.mjs fails the build if a decision moves back in here.
 *
 * Usage:  npm run check
 */

import { runClaims, claims } from './repo-claims.mjs';

const { ran, failures } = await runClaims();

for (const failure of failures) console.log(`FAIL  ${failure}`);
console.log(`\n${ran} of ${claims.length} repository assertions ran, ${failures.length} failing.`);
process.exit(failures.length === 0 ? 0 : 1);
