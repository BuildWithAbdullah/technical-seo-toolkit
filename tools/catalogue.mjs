/**
 * catalogue.mjs
 *
 * Every finding this repository can emit, in one list.
 *
 * The reason this file exists: before it did, the ten pattern pairs drove 43 of
 * the checks in tools/checkers.mjs. The rest had never been observed to fire.
 * They were not broken, as far as anyone knew, which is a different thing from
 * working, and two of them turned out to be wrong when a test was finally
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
 * One entry per reason, not one per check
 * ---------------------------------------
 * The list is longer than the number of if statements in checkers.mjs, on
 * purpose. A canonical that is absent, a canonical whose href is empty and a
 * canonical that is relative are three different faults with three different
 * causes and three different fixes, and collapsing them into one weak
 * "canonical problem" is how the empty one came to be reported as clean for the
 * whole life of the repository. Splitting the weak findings is what produced
 * most of the faults ever found in this code.
 *
 * Severity
 * --------
 * Each entry declares the complete set of severities the id can be emitted at.
 * The severity travels with the finding from the place that emits it, and
 * test/catalogue.test.mjs compares the emitted severities against these
 * declarations in both directions. The second direction is the one that does
 * the work: a severity declared here that no case has ever produced fails the
 * build, which is what stops this field from becoming documentation.
 *
 * Fields:
 *   id          the string the checker emits
 *   kind        the checker that emits it, as keyed in checkers.mjs
 *   what        the fault, in one line, in the terms a reader would search for
 *   silent      true when Search Console reports nothing at all about this fault
 *   severities  the complete set of severities this id is emitted at
 *   absence     reports the absence of a thing rather than a fault in it
 *   refusal     the checker declining to decide, rather than a fault at all
 */

const E = 'error', W = 'warning', N = 'note';

const f = (id, kind, what, silent, severities = [E], flags = {}) => ({
  id,
  kind,
  what,
  silent,
  severities,
  absence: flags.absence === true,
  refusal: flags.refusal === true,
});

export const findings = [
  // ------------------------------------------------------------- canonical
  f('canonical-missing', 'canonical', 'the document declares no canonical at all', false, [W], { absence: true }),
  f('canonical-multiple', 'canonical', 'two or more canonical links in one head, so all of them are discarded', false, [E]),
  f('canonical-outside-head', 'canonical', 'a canonical link sits in the body, where it is ignored', false, [E]),
  f('canonical-empty-href', 'canonical', 'the canonical href is empty, whitespace or absent, which is what an unrendered template variable looks like', false, [E]),
  f('canonical-relative', 'canonical', 'the canonical href is relative, which is permitted and still a mistake on a site with more than one hostname', false, [W]),
  f('canonical-non-https', 'canonical', 'the canonical names an http URL, so it points at a URL that only redirects', false, [E]),
  f('canonical-tracking-params', 'canonical', 'the canonical carries campaign parameters, so every shared link proposes its own canonical', false, [E]),
  f('canonical-has-fragment', 'canonical', 'the canonical carries a fragment, which is dropped during canonicalisation, so the tag states something it cannot say', false, [N]),
  f('canonical-og-url-mismatch', 'canonical', 'og:url and the canonical name different URLs, so the page states two addresses for itself', false, [W]),

  // -------------------------------------------------------------- hreflang
  f('hreflang-missing-self', 'hreflang', 'a page does not list itself among its alternates, which invalidates the cluster', true, [E]),
  f('hreflang-not-reciprocal', 'hreflang', 'a page points at an alternate that does not point back, so the pairing is ignored', true, [E]),
  f('hreflang-invalid-code', 'hreflang', 'the hreflang value is not a language, language-script or language-region value in any spelling', true, [E]),
  f('hreflang-region-without-language', 'hreflang', 'the hreflang value is a bare country code, and the language subtag comes first', true, [E]),
  f('hreflang-empty-code', 'hreflang', 'an alternate declares an empty hreflang value', true, [E]),
  f('hreflang-empty-href', 'hreflang', 'an alternate declares an hreflang value and no href', true, [E]),
  f('hreflang-relative', 'hreflang', 'an alternate href is relative, and hreflang requires absolute URLs', true, [E]),
  f('hreflang-duplicate-code', 'hreflang', 'one page maps the same hreflang value to two different URLs', true, [E]),
  f('hreflang-multiple-x-default', 'hreflang', 'one page declares more than one x-default target, which is not a duplicate language either because x-default is not a language', true, [E]),
  f('hreflang-dangling-target', 'hreflang', 'a page points at an alternate that is not in the cluster at all', true, [E]),
  f('hreflang-page-without-alternates', 'hreflang', 'a page in the cluster declares no alternates at all, so it is annotated by its neighbours and annotates nobody', true, [E]),
  f('hreflang-no-x-default', 'hreflang', 'every value in the cluster names a region and none is x-default, so a visitor from an unnamed country gets whichever page Google picks', true, [W]),

  // -------------------------------------------------------------- headings
  f('heading-no-h1', 'headings', 'the document has no h1, so nothing states what the page is', true, [W], { absence: true }),
  f('heading-multiple-h1', 'headings', 'the document has more than one h1', true, [W]),
  f('heading-skipped-level', 'headings', 'a level is skipped, so the outline does not describe a hierarchy', true, [W]),
  f('heading-empty', 'headings', 'a heading has no text, no label and no image alt text, so it contributes nothing to the outline', true, [E]),
  f('heading-used-for-styling', 'headings', 'a heading holds body copy, which is a paragraph that got its size from a heading tag', true, [N]),

  // ------------------------------------------------------------- analytics
  f('analytics-legacy-ua', 'analytics', 'a Universal Analytics id is still published, and it has processed nothing since July 2023', true, [W]),
  f('analytics-multiple-ga4-properties', 'analytics', 'more than one GA4 measurement id fires on one page view', true, [E]),
  f('analytics-multiple-gtm-containers', 'analytics', 'more than one tag container loads on one page', true, [E]),
  f('analytics-duplicate-config', 'analytics', 'the same gtag config runs twice, which double counts every session', true, [E]),
  f('analytics-gtag-without-library', 'analytics', 'a gtag config runs and no library or container is loaded, so the call pushes onto a dataLayer nothing reads', true, [E]),
  f('analytics-config-id-not-loaded', 'analytics', 'the library loads one property and the config names another, which is what a half finished migration looks like', true, [E]),
  f('analytics-none', 'analytics', 'the page loads no measurement of any kind', true, [N], { absence: true }),

  // --------------------------------------------------- structured data: syntax
  f('jsonld-none', 'jsonld-syntax', 'the document carries no JSON-LD', true, [W], { absence: true }),
  f('jsonld-empty-block', 'jsonld-syntax', 'a JSON-LD script element is empty, usually a template that rendered nothing', true, [E]),
  f('jsonld-unparseable', 'jsonld-syntax', 'a JSON-LD block is not valid JSON, so the whole block is discarded in silence', true, [E]),
  f('jsonld-html-escaped', 'jsonld-syntax', 'a JSON-LD block contains HTML entities, so something escaped it on the way into the page', true, [E]),
  f('jsonld-no-context', 'jsonld-syntax', 'a block declares no @context, so it parses as JSON and none of it is read as Schema.org', true, [E]),
  f('jsonld-duplicate-entity', 'jsonld-syntax', 'the same named entity is declared twice in one document', true, [W]),

  // ---------------------------------------------------- structured data: graph
  f('jsonld-entity-without-id', 'jsonld-graph', 'an entity node has no @id, so nothing else on the site can reference it', true, [W]),
  f('jsonld-node-without-type', 'jsonld-graph', 'a node declares no @type, so nothing treats it as an entity and the work it represents produces nothing', true, [E]),
  f('jsonld-duplicate-id', 'jsonld-graph', 'two nodes share one @id, so the graph describes one thing twice and differently', true, [E]),
  f('jsonld-inlined-entity', 'jsonld-graph', 'an entity is restated inside another node with no @id, or with an @id already defined at the top level', true, [W]),
  f('jsonld-dangling-reference', 'jsonld-graph', 'an @id is referenced but never defined, so the reference resolves to nothing', true, [E]),

  // ----------------------------------------------- structured data: breadcrumbs
  f('breadcrumb-missing', 'jsonld-breadcrumb', 'the page declares no BreadcrumbList', false, [W], { absence: true }),
  f('breadcrumb-position-not-sequential', 'jsonld-breadcrumb', 'positions are not 1..n, so the trail has no defined order', false, [E]),
  f('breadcrumb-missing-name', 'jsonld-breadcrumb', 'a trail item has no name, so the crumb renders as a bare link with nothing to read', false, [E]),
  f('breadcrumb-missing-item-url', 'jsonld-breadcrumb', 'a non-final trail item has no URL, so the trail cannot be followed', false, [E]),
  f('breadcrumb-relative-url', 'jsonld-breadcrumb', 'a trail item uses a relative URL', false, [E]),
  f('breadcrumb-last-item-not-this-page', 'jsonld-breadcrumb', 'the trail ends somewhere other than the page it is on', false, [E]),
  f('breadcrumb-depth-mismatch', 'jsonld-breadcrumb', 'the trail length does not match the depth of the URL path', false, [W]),
  f('breadcrumb-page-url-unknown', 'jsonld-breadcrumb', 'the page states no og:url and no absolute canonical, so the two rules that compare the trail against the page URL were not run', false, [N], { refusal: true }),

  // --------------------------------------------------------------- sitemap
  f('sitemap-not-well-formed', 'sitemap', 'the file is not well-formed XML, so nothing in it is read', false, [E]),
  f('sitemap-no-urlset', 'sitemap', 'the root element is neither urlset nor sitemapindex, so the file is not a sitemap', false, [E]),
  f('sitemap-empty', 'sitemap', 'the urlset contains no url entries, so the file is submitted and says nothing', false, [E], { absence: true }),
  f('sitemap-too-many-urls', 'sitemap', 'the file holds more than fifty thousand URLs, which is over the protocol limit', false, [E]),
  f('sitemap-url-without-loc', 'sitemap', 'a url entry has no loc element at all, which is not the same as a relative one', false, [E]),
  f('sitemap-loc-relative', 'sitemap', 'a loc is not an absolute URL', false, [E]),
  f('sitemap-loc-non-https', 'sitemap', 'a loc is http, so every entry in the file costs a redirect', false, [W]),
  f('sitemap-duplicate-loc', 'sitemap', 'a URL is listed more than once', false, [W]),
  f('sitemap-lastmod-missing', 'sitemap', 'a URL has no lastmod, the only per-URL hint in the file Google uses', false, [W]),
  f('sitemap-lastmod-empty', 'sitemap', 'a lastmod element is present and empty, which is what a template that found no date renders', false, [E]),
  f('sitemap-lastmod-invalid', 'sitemap', 'lastmod is not a W3C datetime, so it is ignored without a word anywhere', false, [E]),
  f('sitemap-lastmod-future', 'sitemap', 'lastmod is a date that has not happened yet, which is a clock or a template fault', false, [W]),
  f('sitemap-priority-or-changefreq', 'sitemap', 'the file declares priority or changefreq, both of which Google ignores', false, [N]),

  // ------------------------------------------------- sitemap: the index file
  // The index findings are separate ids rather than shared with the urlset
  // ones because the cost is different by three orders of magnitude: a bad loc
  // in a urlset loses one URL, and a bad loc in an index loses every URL in a
  // child sitemap. For most of the life of this repository a sitemap index was
  // checked for nothing at all.
  f('sitemap-index-empty', 'sitemap', 'a sitemap index lists no child sitemaps, so submitting it submits nothing', false, [E], { absence: true }),
  f('sitemap-index-too-many-sitemaps', 'sitemap', 'a sitemap index lists more than fifty thousand child sitemaps', false, [E]),
  f('sitemap-index-without-loc', 'sitemap', 'a sitemap entry in an index has no loc, so one whole child sitemap has no address', false, [E]),
  f('sitemap-index-loc-relative', 'sitemap', 'a child sitemap is named by a relative URL, so a whole file of URLs is unreachable', false, [E]),
  f('sitemap-index-loc-non-https', 'sitemap', 'a child sitemap is named over http, so every child fetch costs a redirect', false, [W]),
  f('sitemap-index-duplicate-loc', 'sitemap', 'a child sitemap is listed more than once in the index', false, [W]),
  f('sitemap-index-lastmod-missing', 'sitemap', 'a child sitemap has no lastmod, which is the signal that decides whether it is refetched at all', false, [W]),
  f('sitemap-index-lastmod-empty', 'sitemap', 'a child sitemap has a lastmod element that is present and empty', false, [E]),
  f('sitemap-index-lastmod-invalid', 'sitemap', 'a child sitemap has a lastmod that is not a W3C datetime, so it is ignored', false, [E]),

  // ---------------------------------------------------------------- robots
  f('robots-no-wildcard-group', 'robots', 'there is no User-agent: * group, so most crawlers are given no rules', false, [W], { absence: true }),
  f('robots-no-sitemap', 'robots', 'robots.txt declares no Sitemap', false, [W], { absence: true }),
  f('robots-sitemap-relative', 'robots', 'a Sitemap line is not an absolute URL, which the protocol requires', false, [E]),
  f('robots-noindex-directive', 'robots', 'robots.txt carries a Noindex line, which Google stopped supporting in September 2019, so every URL it names is fully indexable', false, [E]),
  f('robots-crawl-delay', 'robots', 'robots.txt carries a Crawl-delay line, which Google ignores, so request rate is not being controlled here', false, [N]),
  f('robots-blocks-own-sitemap', 'robots', 'robots.txt disallows the sitemap it declares', false, [E]),
  f('robots-disallow-hides-noindex', 'robots', 'a URL is disallowed and carries noindex, so the noindex is never read and the URL cannot leave the index', false, [E]),
  f('robots-disallow-contradicts-sitemap', 'robots', 'a URL is disallowed and submitted in the sitemap at the same time', false, [E]),
  f('robots-disallow-hides-canonical', 'robots', 'a URL is disallowed, so the canonical it declares is never read', false, [E]),
  // Two severities, and the distinction is real: a blocked stylesheet or
  // script changes what the rendered page contains, and a blocked image
  // changes how it looks and not what it says.
  f('robots-blocks-render-assets', 'robots', 'an asset the page needs in order to render is disallowed', false, [E, W]),

  // ------------------------------------------------------------- redirects
  f('redirect-duplicate-source', 'redirects', 'one source URL is mapped twice, and which rule wins depends on the server', true, [E]),
  f('redirect-relative-target', 'redirects', 'a target is neither absolute nor root-relative', true, [E]),
  f('redirect-to-self', 'redirects', 'a rule redirects a URL to itself', true, [E]),
  f('redirect-loop', 'redirects', 'a chain of rules never terminates', true, [E]),
  // Two severities. Two hops is a redirect that wants collapsing; three or
  // more is long enough that Google stops following it, which is a different
  // outcome rather than a worse one.
  f('redirect-chain', 'redirects', 'a source reaches its destination through more than one hop', true, [E, W]),
  f('redirect-temporary-for-permanent-move', 'redirects', 'a move that is not coming back is served as a temporary redirect', true, [W]),
  f('redirect-status-not-a-redirect', 'redirects', 'a rule in a redirect map records a status that is not a redirect at all', true, [E]),
  f('redirect-status-missing', 'redirects', 'a rule records no status, so whether the move is permanent cannot be answered from the map', true, [W], { refusal: true }),
];

export const ids = findings.map((x) => x.id);

export const byId = new Map(findings.map((x) => [x.id, x]));

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
 * Findings that are the checker declining to decide.
 *
 * These are not faults in the artefact. They are the checker saying that an
 * input it needed was not there, so a rule it owns was not run. The difference
 * matters when a limit is being asserted: a rule that silently does nothing and
 * a rule that reports that it did nothing look identical from the outside, and
 * only one of them is honest. test/limits.test.mjs requires that the blind case
 * of every limit whose refusal is catalogued produces the refusal.
 */
export const refusalIds = new Set(findings.filter((x) => x.refusal).map((x) => x.id));

/**
 * Ids that the test suite deliberately does not drive, each with the reason.
 *
 * Empty, and it should stay empty. An entry here is a check nobody has seen
 * work. If one has to be added, the reason belongs next to it in this object
 * rather than in a commit message, and test/catalogue.test.mjs asserts that
 * every entry carries one.
 */
export const notDriven = {};
