/**
 * verify.mjs
 *
 * The entry point for `npm run verify`. It reads the arguments, calls
 * tools/audit-patterns.mjs, prints what comes back and sets the exit code.
 *
 * There is deliberately nothing else in it. Every judgement about a pattern
 * lives in audit-patterns.mjs, which takes no arguments and writes to no
 * stream, so the test suite can import it and call it directly. A file that is
 * only ever run as a program is a file no test covers, and the last time a
 * decision was left in one on this account it printed nothing and exited 0 for
 * months while the suite stayed green.
 *
 * tools/entry-thin.mjs fails the build if this file grows a decision again.
 *
 * Usage:  npm install && npm run verify
 *         node tools/verify.mjs --json
 *         node tools/verify.mjs --only canonical-tags
 */

import { auditPatterns, renderHuman, renderJson, failed } from './audit-patterns.mjs';

const argv = process.argv.slice(2);
const onlyAt = argv.indexOf('--only');
const results = await auditPatterns({ only: onlyAt >= 0 ? argv[onlyAt + 1] : null });

console.log(argv.includes('--json') ? renderJson(results) : renderHuman(results));
process.exit(failed(results) ? 1 : 0);
