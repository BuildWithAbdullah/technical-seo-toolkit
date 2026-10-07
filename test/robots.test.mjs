/**
 * robots.test.mjs
 *
 * The manifest carries robots.txt plus the indexing directives of the pages it
 * governs, because the most expensive fault in this area is only visible when
 * both are in view at once: a URL that is disallowed and carries noindex can
 * never leave the index, and a check that read either file alone would call both
 * of them correct.
 *
 * The precedence tests matter more than they look. Longest matching rule wins
 * and Allow wins ties, and getting that wrong is how the "but I added an Allow"
 * conversation starts.
 *
 * One test here is a regression. The render asset check matched its list against
 * robots.txt paths without taking the path out of the URL first, so an asset
 * list written the way a browser network panel gives it, as full URLs, matched
 * nothing. The check passed every site it was built to catch.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { run, runFull } from './helpers.mjs';

const site = (robotsTxt, rest = {}) => JSON.stringify({ robotsTxt, ...rest });
const SITEMAP = 'Sitemap: https://example.com/sitemap.xml';

test('a wildcard group with a sitemap line is clean', () => {
  assert.deepEqual(run('robots', site(`User-agent: *\nDisallow: /wp-admin/\n${SITEMAP}`)), []);
});

test('comments and blank lines are ignored', () => {
  assert.deepEqual(
    run('robots', site(`# generated\n\nUser-agent: *\n\n  Disallow: /tmp/\n\n${SITEMAP}\n`)),
    []
  );
});

test('a file with no wildcard group is reported', () => {
  assert.ok(run('robots', site(`User-agent: Googlebot\nDisallow: /tmp/\n${SITEMAP}`)).includes('robots-no-wildcard-group'));
});

test('consecutive user-agent lines form one group', () => {
  assert.deepEqual(
    run('robots', site(`User-agent: *\nUser-agent: Googlebot\nDisallow: /tmp/\n${SITEMAP}`)),
    []
  );
});

test('a missing sitemap line is reported, and a relative one is reported as well', () => {
  assert.deepEqual(run('robots', site('User-agent: *\nDisallow: /tmp/')), ['robots-no-sitemap']);
  assert.deepEqual(run('robots', site('User-agent: *\nDisallow: /tmp/\nSitemap: /sitemap.xml')), ['robots-sitemap-relative']);
});

test('an empty Disallow value allows everything rather than blocking it', () => {
  // Disallow with no path is the documented way to say "nothing is blocked".
  // Treating it as a prefix match on the empty string would block the whole site.
  assert.deepEqual(
    run('robots', site(`User-agent: *\nDisallow:\n${SITEMAP}`, { pages: [{ url: 'https://example.com/a', robots: 'noindex' }] })),
    []
  );
});

test('robots.txt disallowing its own sitemap is reported', () => {
  assert.ok(
    run('robots', site('User-agent: *\nDisallow: /seo/\nSitemap: https://example.com/seo/sitemap.xml')).includes('robots-blocks-own-sitemap')
  );
});

test('a disallowed URL carrying noindex is reported, and the message says why it matters', () => {
  const problems = runFull('robots', site(`User-agent: *\nDisallow: /search\n${SITEMAP}`, {
    pages: [{ url: 'https://example.com/search?q=shoes', robots: 'noindex, follow' }],
  }));
  assert.deepEqual(problems.map((p) => p.id), ['robots-disallow-hides-noindex']);
  assert.match(problems[0].message, /cannot fetch it to read the noindex/);
});

test('a noindex on a URL the crawler can reach is correct and reported as nothing', () => {
  assert.deepEqual(
    run('robots', site(`User-agent: *\nDisallow: /wp-admin/\n${SITEMAP}`, {
      pages: [{ url: 'https://example.com/search?q=shoes', robots: 'noindex, follow' }],
    })),
    []
  );
});

test('a disallowed URL in the sitemap, and a disallowed URL with a canonical, are each reported', () => {
  assert.ok(
    run('robots', site(`User-agent: *\nDisallow: /archive/\n${SITEMAP}`, {
      pages: [{ url: 'https://example.com/archive/2019/', inSitemap: true }],
    })).includes('robots-disallow-contradicts-sitemap')
  );
  assert.ok(
    run('robots', site(`User-agent: *\nDisallow: /print/\n${SITEMAP}`, {
      pages: [{ url: 'https://example.com/print/guide', canonicalTarget: 'https://example.com/guide' }],
    })).includes('robots-disallow-hides-canonical')
  );
});

test('a longer Allow overrides a shorter Disallow', () => {
  assert.deepEqual(
    run('robots', site(`User-agent: *\nDisallow: /assets/\nAllow: /assets/css/\n${SITEMAP}`, {
      renderAssets: ['/assets/css/app.css'],
    })),
    []
  );
});

test('a shorter Allow does not override a longer Disallow', () => {
  assert.ok(
    run('robots', site(`User-agent: *\nAllow: /assets/\nDisallow: /assets/css/\n${SITEMAP}`, {
      renderAssets: ['/assets/css/app.css'],
    })).includes('robots-blocks-render-assets')
  );
});

test('Allow wins a tie of equal length', () => {
  assert.deepEqual(
    run('robots', site(`User-agent: *\nDisallow: /app.js\nAllow: /app.js\n${SITEMAP}`, {
      renderAssets: ['/app.js'],
    })),
    []
  );
});

test('a trailing wildcard in a rule path is matched as a prefix', () => {
  assert.ok(
    run('robots', site(`User-agent: *\nDisallow: /assets/*\n${SITEMAP}`, {
      renderAssets: ['/assets/app.js'],
    })).includes('robots-blocks-render-assets')
  );
});

test('a render asset given as a full URL is matched, not silently skipped', () => {
  // Regression, and the worst of the set. An asset list is normally copied out
  // of a browser network panel, so it arrives as absolute URLs. Those used to
  // match no robots.txt path at all, so this check passed every site it existed
  // to catch.
  assert.ok(
    run('robots', site(`User-agent: *\nDisallow: /assets/\n${SITEMAP}`, {
      renderAssets: ['https://example.com/assets/app.js'],
    })).includes('robots-blocks-render-assets')
  );
});

test('the two spellings of an asset are judged the same way', () => {
  const asPath = run('robots', site(`User-agent: *\nDisallow: /assets/\n${SITEMAP}`, { renderAssets: ['/assets/app.js'] }));
  const asUrl = run('robots', site(`User-agent: *\nDisallow: /assets/\n${SITEMAP}`, { renderAssets: ['https://example.com/assets/app.js'] }));
  assert.deepEqual(asPath, asUrl);
});

test('rules written only for Googlebot still govern the page checks', () => {
  assert.ok(
    run('robots', site(`User-agent: *\nDisallow:\nUser-agent: Googlebot\nDisallow: /search\n${SITEMAP}`, {
      pages: [{ url: 'https://example.com/search?q=a', robots: 'noindex' }],
    })).includes('robots-disallow-hides-noindex')
  );
});
