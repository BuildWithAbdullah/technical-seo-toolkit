/**
 * catalogue.mjs
 *
 * Every finding this repository can emit, in one list.
 *
 * The reason this file exists: before it did, the ten pattern pairs drove 43 of
 * the 62 checks in tools/checkers.mjs. The other 19 had never been observed to
 * fire. They were not broken, as far as anyone knew, which is a different thing
 * from working, and two of them turned out to be wrong when a test was finally
 * pointed at them.
 *
 * test/catalogue.test.mjs drives every id below out of a real call into a real
 * checker and then asserts set equality in both directions:
 *
 *   nothing in this list is unreachable, and
 *   nothing a checker emits is missing from this list.
 *
 * So a new check cannot be added without being catalogued, a catalogued check
 * cannot rot into something that never fires, and the count quoted in the README
 * is a count of things that have been seen to happen.
 *
 * Fields:
 *   id      the string the checker emits
 *   kind    the checker that emits it, as keyed in checkers.mjs
 *   what    the fault, in one line, in the terms a reader would search for
 *   silent  true when Search Console reports nothing at all about this fault
 */

const f = (id, kind, what, silent, absence = false) => ({ id, kind, what, silent, absence });

export const findings = [
  // ------------------------------------------------------------- canonical
  f('canonical-missing', 'canonical', 'the document declares no canonical at all', false, true),
  f('canonical-multiple', 'canonical', 'two or more canonical links in one head, so all of them are discarded', false),
  f('canonical-outside-head', 'canonical', 'a canonical link sits in the body, where it is ignored', false),
  f('canonical-relative', 'canonical', 'the canonical href is relative, which is permitted and still a mistake on a site with more than one hostname', false),
  f('canonical-non-https', 'canonical', 'the canonical names an http URL, so it points at a URL that only redirects', false),
  f('canonical-tracking-params', 'canonical', 'the canonical carries campaign parameters, so every shared link proposes its own canonical', false),
  f('canonical-og-url-mismatch', 'canonical', 'og:url and the canonical name different URLs, so the page states two addresses for itself', false),

  // -------------------------------------------------------------- hreflang
  f('hreflang-missing-self', 'hreflang', 'a page does not list itself among its alternates, which invalidates the cluster', true),
  f('hreflang-not-reciprocal', 'hreflang', 'a page points at an alternate that does not point back, so the pairing is ignored', true),
  f('hreflang-invalid-code', 'hreflang', 'the hreflang value is not a language, language-script or language-region value', true),
  f('hreflang-relative', 'hreflang', 'an alternate href is relative, and hreflang requires absolute URLs', true),
  f('hreflang-duplicate-code', 'hreflang', 'one page maps the same hreflang value to two different URLs', true),
  f('hreflang-dangling-target', 'hreflang', 'a page points at an alternate that is not in the cluster at all', true),

  // -------------------------------------------------------------- headings
  f('heading-no-h1', 'headings', 'the document has no h1, so nothing states what the page is', true, true),
  f('heading-multiple-h1', 'headings', 'the document has more than one h1', true),
  f('heading-skipped-level', 'headings', 'a level is skipped, so the outline does not describe a hierarchy', true),
  f('heading-empty', 'headings', 'an empty heading element sits in the outline', true),
  f('heading-used-for-styling', 'headings', 'a heading holds body copy, which is a paragraph that got its size from a heading tag', true),

  // ------------------------------------------------------------- analytics
  f('analytics-legacy-ua', 'analytics', 'a Universal Analytics id is still published, and it has processed nothing since July 2023', true),
  f('analytics-multiple-ga4-properties', 'analytics', 'more than one GA4 measurement id fires on one page view', true),
  f('analytics-multiple-gtm-containers', 'analytics', 'more than one tag container loads on one page', true),
  f('analytics-duplicate-config', 'analytics', 'the same gtag config runs twice, which double counts every session', true),

  // --------------------------------------------------- structured data: syntax
  f('jsonld-none', 'jsonld-syntax', 'the document carries no JSON-LD', true, true),
  f('jsonld-empty-block', 'jsonld-syntax', 'a JSON-LD script element is empty, usually a template that rendered nothing', true),
  f('jsonld-unparseable', 'jsonld-syntax', 'a JSON-LD block is not valid JSON, so the whole block is discarded in silence', true),
  f('jsonld-html-escaped', 'jsonld-syntax', 'a JSON-LD block contains HTML entities, so something escaped it on the way into the page', true),
  f('jsonld-duplicate-entity', 'jsonld-syntax', 'the same named entity is declared twice in one document', true),

  // ---------------------------------------------------- structured data: graph
  f('jsonld-entity-without-id', 'jsonld-graph', 'an entity node has no @id, so nothing else on the site can reference it', true),
  f('jsonld-duplicate-id', 'jsonld-graph', 'two nodes share one @id, so the graph describes one thing twice and differently', true),
  f('jsonld-inlined-entity', 'jsonld-graph', 'a whole entity is restated inside another node instead of referenced by @id', true),
  f('jsonld-dangling-reference', 'jsonld-graph', 'an @id is referenced but never defined, so the reference resolves to nothing', true),

  // ----------------------------------------------- structured data: breadcrumbs
  f('breadcrumb-missing', 'jsonld-breadcrumb', 'the page declares no BreadcrumbList', false, true),
  f('breadcrumb-position-not-sequential', 'jsonld-breadcrumb', 'positions are not 1..n, so the trail has no defined order', false),
  f('breadcrumb-missing-name', 'jsonld-breadcrumb', 'a trail item has no name, so the crumb renders as a bare link with nothing to read', false),
  f('breadcrumb-missing-item-url', 'jsonld-breadcrumb', 'a non-final trail item has no URL, so the trail cannot be followed', false),
  f('breadcrumb-relative-url', 'jsonld-breadcrumb', 'a trail item uses a relative URL', false),
  f('breadcrumb-last-item-not-this-page', 'jsonld-breadcrumb', 'the trail ends somewhere other than the page it is on', false),
  f('breadcrumb-depth-mismatch', 'jsonld-breadcrumb', 'the trail length does not match the depth of the URL path', false),

  // --------------------------------------------------------------- sitemap
  f('sitemap-not-well-formed', 'sitemap', 'the file is not well-formed XML, so nothing in it is read', false),
  f('sitemap-no-urlset', 'sitemap', 'the root element is neither urlset nor sitemapindex, so the file is not a sitemap', false),
  f('sitemap-too-many-urls', 'sitemap', 'the file holds more than fifty thousand URLs, which is over the protocol limit', false),
  f('sitemap-loc-relative', 'sitemap', 'a loc is not an absolute URL', false),
  f('sitemap-loc-non-https', 'sitemap', 'a loc is http, so every entry in the file costs a redirect', false),
  f('sitemap-duplicate-loc', 'sitemap', 'a URL is listed more than once', false),
  f('sitemap-lastmod-missing', 'sitemap', 'a URL has no lastmod, the only per-URL hint in the file Google uses', false),
  f('sitemap-lastmod-invalid', 'sitemap', 'lastmod is not a W3C datetime, so it is ignored without a word anywhere', false),
  f('sitemap-lastmod-future', 'sitemap', 'lastmod is a date that has not happened yet, which is a clock or a template fault', false),
  f('sitemap-priority-or-changefreq', 'sitemap', 'the file declares priority or changefreq, both of which Google ignores', false),

  // ---------------------------------------------------------------- robots
  f('robots-no-wildcard-group', 'robots', 'there is no User-agent: * group, so most crawlers are given no rules', false, true),
  f('robots-no-sitemap', 'robots', 'robots.txt declares no Sitemap', false, true),
  f('robots-sitemap-relative', 'robots', 'a Sitemap line is not an absolute URL, which the protocol requires', false),
  f('robots-blocks-own-sitemap', 'robots', 'robots.txt disallows the sitemap it declares', false),
  f('robots-disallow-hides-noindex', 'robots', 'a URL is disallowed and carries noindex, so the noindex is never read and the URL cannot leave the index', false),
  f('robots-disallow-contradicts-sitemap', 'robots', 'a URL is disallowed and submitted in the sitemap at the same time', false),
  f('robots-disallow-hides-canonical', 'robots', 'a URL is disallowed, so the canonical it declares is never read', false),
  f('robots-blocks-render-assets', 'robots', 'an asset the page needs in order to render is disallowed', false),

  // ------------------------------------------------------------- redirects
  f('redirect-duplicate-source', 'redirects', 'one source URL is mapped twice, and which rule wins depends on the server', true),
  f('redirect-relative-target', 'redirects', 'a target is neither absolute nor root-relative', true),
  f('redirect-to-self', 'redirects', 'a rule redirects a URL to itself', true),
  f('redirect-loop', 'redirects', 'a chain of rules never terminates', true),
  f('redirect-chain', 'redirects', 'a source reaches its destination through more than one hop', true),
  f('redirect-temporary-for-permanent-move', 'redirects', 'a move that is not coming back is served as a temporary redirect', true),
];

export const ids = findings.map((x) => x.id);

export const byKind = findings.reduce((acc, x) => {
  (acc[x.kind] ??= []).push(x);
  return acc;
}, {});

/**
 * Findings that report the absence of a thing rather than a fault in it.
 *
 * Every one of these fires on an empty artefact, correctly: a page with nothing
 * in it does have no canonical, no JSON-LD, no h1 and no breadcrumb trail, and a
 * robots.txt with nothing in it does declare no sitemap and no wildcard group.
 *
 * They are named because they cannot serve as evidence. A failing example whose
 * only finding is one of these has demonstrated that it is empty, not that the
 * fault its pattern is about is present. tools/verify.mjs and
 * test/pairs.test.mjs both require at least one finding from outside this set.
 */
export const absenceIds = new Set(findings.filter((x) => x.absence).map((x) => x.id));

/**
 * Ids that the test suite deliberately does not drive, each with the reason.
 *
 * Empty, and it should stay empty. An entry here is a check nobody has seen
 * work. If one has to be added, the reason belongs next to it in this object
 * rather than in a commit message, and test/catalogue.test.mjs asserts that
 * every entry carries one.
 */
export const notDriven = {};
