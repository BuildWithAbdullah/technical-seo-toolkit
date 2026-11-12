# Every finding, listed

Generated from `tools/catalogue.mjs` by `npm run docs`. Do not edit by hand:
CI regenerates this file and fails if it differs from what is committed.

There are 92 findings across 10 checkers.
43 of them describe faults Search Console reports nothing about.

`test/catalogue.test.mjs` drives every one of them out of a real call into a
real checker and then asserts set equality in both directions, so nothing in
this list is unreachable and nothing a checker emits is missing from it.

The **Silent** column is the one worth reading. A yes means Search Console,
Lighthouse and the Rich Results Test will all stay quiet while the fault is
live, which is why these are the expensive ones.

The **Absence** column marks a finding that reports the absence of a thing
rather than a fault in it. Each of those fires on an empty file, correctly, and
for that reason none of them counts as evidence that a failing example
demonstrates anything.

## Canonical tags

Checker: `canonical`, 9 findings.

| Finding | What it means | Silent | Absence |
|---|---|---|---|
| `canonical-missing` | the document declares no canonical at all | no | yes |
| `canonical-multiple` | two or more canonical links in one head, so all of them are discarded | no |  |
| `canonical-outside-head` | a canonical link sits in the body, where it is ignored | no |  |
| `canonical-empty-href` | the canonical href is empty, whitespace or absent, which is what an unrendered template variable looks like | no |  |
| `canonical-relative` | the canonical href is relative, which is permitted and still a mistake on a site with more than one hostname | no |  |
| `canonical-non-https` | the canonical names an http URL, so it points at a URL that only redirects | no |  |
| `canonical-tracking-params` | the canonical carries campaign parameters, so every shared link proposes its own canonical | no |  |
| `canonical-has-fragment` | the canonical carries a fragment, which is dropped during canonicalisation, so the tag states something it cannot say | no |  |
| `canonical-og-url-mismatch` | og:url and the canonical name different URLs, so the page states two addresses for itself | no |  |

## hreflang clusters

Checker: `hreflang`, 12 findings.

| Finding | What it means | Silent | Absence |
|---|---|---|---|
| `hreflang-missing-self` | a page does not list itself among its alternates, which invalidates the cluster | yes |  |
| `hreflang-not-reciprocal` | a page points at an alternate that does not point back, so the pairing is ignored | yes |  |
| `hreflang-invalid-code` | the hreflang value is not a language, language-script or language-region value in any spelling | yes |  |
| `hreflang-region-without-language` | the hreflang value is a bare country code, and the language subtag comes first | yes |  |
| `hreflang-empty-code` | an alternate declares an empty hreflang value | yes |  |
| `hreflang-empty-href` | an alternate declares an hreflang value and no href | yes |  |
| `hreflang-relative` | an alternate href is relative, and hreflang requires absolute URLs | yes |  |
| `hreflang-duplicate-code` | one page maps the same hreflang value to two different URLs | yes |  |
| `hreflang-multiple-x-default` | one page declares more than one x-default target, which is not a duplicate language either because x-default is not a language | yes |  |
| `hreflang-dangling-target` | a page points at an alternate that is not in the cluster at all | yes |  |
| `hreflang-page-without-alternates` | a page in the cluster declares no alternates at all, so it is annotated by its neighbours and annotates nobody | yes |  |
| `hreflang-no-x-default` | every value in the cluster names a region and none is x-default, so a visitor from an unnamed country gets whichever page Google picks | yes |  |

## Heading outline

Checker: `headings`, 5 findings.

| Finding | What it means | Silent | Absence |
|---|---|---|---|
| `heading-no-h1` | the document has no h1, so nothing states what the page is | yes | yes |
| `heading-multiple-h1` | the document has more than one h1 | yes |  |
| `heading-skipped-level` | a level is skipped, so the outline does not describe a hierarchy | yes |  |
| `heading-empty` | a heading has no text, no label and no image alt text, so it contributes nothing to the outline | yes |  |
| `heading-used-for-styling` | a heading holds body copy, which is a paragraph that got its size from a heading tag | yes |  |

## Analytics tag hygiene

Checker: `analytics`, 7 findings.

| Finding | What it means | Silent | Absence |
|---|---|---|---|
| `analytics-legacy-ua` | a Universal Analytics id is still published, and it has processed nothing since July 2023 | yes |  |
| `analytics-multiple-ga4-properties` | more than one GA4 measurement id fires on one page view | yes |  |
| `analytics-multiple-gtm-containers` | more than one tag container loads on one page | yes |  |
| `analytics-duplicate-config` | the same gtag config runs twice, which double counts every session | yes |  |
| `analytics-gtag-without-library` | a gtag config runs and no library or container is loaded, so the call pushes onto a dataLayer nothing reads | yes |  |
| `analytics-config-id-not-loaded` | the library loads one property and the config names another, which is what a half finished migration looks like | yes |  |
| `analytics-none` | the page loads no measurement of any kind | yes | yes |

## Structured data: does it parse

Checker: `jsonld-syntax`, 6 findings.

| Finding | What it means | Silent | Absence |
|---|---|---|---|
| `jsonld-none` | the document carries no JSON-LD | yes | yes |
| `jsonld-empty-block` | a JSON-LD script element is empty, usually a template that rendered nothing | yes |  |
| `jsonld-unparseable` | a JSON-LD block is not valid JSON, so the whole block is discarded in silence | yes |  |
| `jsonld-html-escaped` | a JSON-LD block contains HTML entities, so something escaped it on the way into the page | yes |  |
| `jsonld-no-context` | a block declares no @context, so it parses as JSON and none of it is read as Schema.org | yes |  |
| `jsonld-duplicate-entity` | the same named entity is declared twice in one document | yes |  |

## Structured data: the entity graph

Checker: `jsonld-graph`, 5 findings.

| Finding | What it means | Silent | Absence |
|---|---|---|---|
| `jsonld-entity-without-id` | an entity node has no @id, so nothing else on the site can reference it | yes |  |
| `jsonld-node-without-type` | a node declares no @type, so nothing treats it as an entity and the work it represents produces nothing | yes |  |
| `jsonld-duplicate-id` | two nodes share one @id, so the graph describes one thing twice and differently | yes |  |
| `jsonld-inlined-entity` | an entity is restated inside another node with no @id, or with an @id already defined at the top level | yes |  |
| `jsonld-dangling-reference` | an @id is referenced but never defined, so the reference resolves to nothing | yes |  |

## Structured data: breadcrumbs

Checker: `jsonld-breadcrumb`, 8 findings.

| Finding | What it means | Silent | Absence |
|---|---|---|---|
| `breadcrumb-missing` | the page declares no BreadcrumbList | no | yes |
| `breadcrumb-position-not-sequential` | positions are not 1..n, so the trail has no defined order | no |  |
| `breadcrumb-missing-name` | a trail item has no name, so the crumb renders as a bare link with nothing to read | no |  |
| `breadcrumb-missing-item-url` | a non-final trail item has no URL, so the trail cannot be followed | no |  |
| `breadcrumb-relative-url` | a trail item uses a relative URL | no |  |
| `breadcrumb-last-item-not-this-page` | the trail ends somewhere other than the page it is on | no |  |
| `breadcrumb-depth-mismatch` | the trail length does not match the depth of the URL path | no |  |
| `breadcrumb-page-url-unknown` | the page states no og:url and no absolute canonical, so the two rules that compare the trail against the page URL were not run | no |  |

## Sitemap contents

Checker: `sitemap`, 22 findings.

| Finding | What it means | Silent | Absence |
|---|---|---|---|
| `sitemap-not-well-formed` | the file is not well-formed XML, so nothing in it is read | no |  |
| `sitemap-no-urlset` | the root element is neither urlset nor sitemapindex, so the file is not a sitemap | no |  |
| `sitemap-empty` | the urlset contains no url entries, so the file is submitted and says nothing | no | yes |
| `sitemap-too-many-urls` | the file holds more than fifty thousand URLs, which is over the protocol limit | no |  |
| `sitemap-url-without-loc` | a url entry has no loc element at all, which is not the same as a relative one | no |  |
| `sitemap-loc-relative` | a loc is not an absolute URL | no |  |
| `sitemap-loc-non-https` | a loc is http, so every entry in the file costs a redirect | no |  |
| `sitemap-duplicate-loc` | a URL is listed more than once | no |  |
| `sitemap-lastmod-missing` | a URL has no lastmod, the only per-URL hint in the file Google uses | no |  |
| `sitemap-lastmod-empty` | a lastmod element is present and empty, which is what a template that found no date renders | no |  |
| `sitemap-lastmod-invalid` | lastmod is not a W3C datetime, so it is ignored without a word anywhere | no |  |
| `sitemap-lastmod-future` | lastmod is a date that has not happened yet, which is a clock or a template fault | no |  |
| `sitemap-priority-or-changefreq` | the file declares priority or changefreq, both of which Google ignores | no |  |
| `sitemap-index-empty` | a sitemap index lists no child sitemaps, so submitting it submits nothing | no | yes |
| `sitemap-index-too-many-sitemaps` | a sitemap index lists more than fifty thousand child sitemaps | no |  |
| `sitemap-index-without-loc` | a sitemap entry in an index has no loc, so one whole child sitemap has no address | no |  |
| `sitemap-index-loc-relative` | a child sitemap is named by a relative URL, so a whole file of URLs is unreachable | no |  |
| `sitemap-index-loc-non-https` | a child sitemap is named over http, so every child fetch costs a redirect | no |  |
| `sitemap-index-duplicate-loc` | a child sitemap is listed more than once in the index | no |  |
| `sitemap-index-lastmod-missing` | a child sitemap has no lastmod, which is the signal that decides whether it is refetched at all | no |  |
| `sitemap-index-lastmod-empty` | a child sitemap has a lastmod element that is present and empty | no |  |
| `sitemap-index-lastmod-invalid` | a child sitemap has a lastmod that is not a W3C datetime, so it is ignored | no |  |

## Crawling versus indexing

Checker: `robots`, 10 findings.

| Finding | What it means | Silent | Absence |
|---|---|---|---|
| `robots-no-wildcard-group` | there is no User-agent: * group, so most crawlers are given no rules | no | yes |
| `robots-no-sitemap` | robots.txt declares no Sitemap | no | yes |
| `robots-sitemap-relative` | a Sitemap line is not an absolute URL, which the protocol requires | no |  |
| `robots-noindex-directive` | robots.txt carries a Noindex line, which Google stopped supporting in September 2019, so every URL it names is fully indexable | no |  |
| `robots-crawl-delay` | robots.txt carries a Crawl-delay line, which Google ignores, so request rate is not being controlled here | no |  |
| `robots-blocks-own-sitemap` | robots.txt disallows the sitemap it declares | no |  |
| `robots-disallow-hides-noindex` | a URL is disallowed and carries noindex, so the noindex is never read and the URL cannot leave the index | no |  |
| `robots-disallow-contradicts-sitemap` | a URL is disallowed and submitted in the sitemap at the same time | no |  |
| `robots-disallow-hides-canonical` | a URL is disallowed, so the canonical it declares is never read | no |  |
| `robots-blocks-render-assets` | an asset the page needs in order to render is disallowed | no |  |

## Redirect maps

Checker: `redirects`, 8 findings.

| Finding | What it means | Silent | Absence |
|---|---|---|---|
| `redirect-duplicate-source` | one source URL is mapped twice, and which rule wins depends on the server | yes |  |
| `redirect-relative-target` | a target is neither absolute nor root-relative | yes |  |
| `redirect-to-self` | a rule redirects a URL to itself | yes |  |
| `redirect-loop` | a chain of rules never terminates | yes |  |
| `redirect-chain` | a source reaches its destination through more than one hop | yes |  |
| `redirect-temporary-for-permanent-move` | a move that is not coming back is served as a temporary redirect | yes |  |
| `redirect-status-not-a-redirect` | a rule in a redirect map records a status that is not a redirect at all | yes |  |
| `redirect-status-missing` | a rule records no status, so whether the move is permanent cannot be answered from the map | yes |  |

## What is not here

Everything these checkers cannot see, which is a longer list than this one and
is written out in [what the checkers cannot see](what-the-checkers-cannot-see.md).
