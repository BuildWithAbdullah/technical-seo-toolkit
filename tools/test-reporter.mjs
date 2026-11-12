/**
 * test-reporter.mjs
 *
 * A node:test reporter that prints one machine-readable line and nothing else.
 *
 * It exists so that tools/count-tests.mjs has a stable thing to read. The
 * built-in reporters are not stable across the Node versions this package
 * supports: the same suite printed "# tests 142" on Node 20 and 22 and
 * "info tests 142" on Node 24, and on Node 24 the default output does not
 * match a grep for a line starting with a hash at all. Inside a reporter every
 * per-test event is present on every version, so the counting happens here and
 * the format of the one line below is the only contract.
 *
 * Suites are dropped. A suite reports a pass of its own when its children pass,
 * and counting those would count every describe block as a test. `details.type`
 * is 'suite' where the runner says so, and on versions where it says nothing,
 * a suite is distinguishable because it reports a nesting level with children
 * underneath it. Only the type check is needed on the versions in the matrix,
 * and it is harmless on the others.
 */

export default async function* countingReporter(source) {
  let tests = 0;
  let passed = 0;
  let failed = 0;

  for await (const event of source) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    if (event.data?.details?.type === 'suite') continue;
    tests++;
    if (event.type === 'test:pass') passed++;
    else failed++;
  }

  yield `TESTCOUNT ${tests} ${passed} ${failed}\n`;
}
