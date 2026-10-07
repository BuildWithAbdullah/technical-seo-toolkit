# Every finding, listed

Generated from `tools/catalogue.mjs` by `npm run docs`. Do not edit by hand:
CI regenerates this file and fails if it differs from what is committed.

There are 62 findings across 10 checkers.
30 of them describe faults Search Console reports nothing about.

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

Checker: `canonical`, 7 findings.

| Finding | What it means | Silent | Absence |
|---|---|---|---|
| `canonical-missing` | the document declares no canonical at all | no | yes |
| `canonical-multiple` | two or more canonical links in one head, so all of them are discarded | no |  |
| `canonical-outside-head` | a canonical link sits in the body, where it is ignored | no |  |
| `canonical-relative` | the canonical href is relative, which is permitted and still a mistake on a site with more than one hostname | no |  |
| `canonical-non-https` | the canonical names an http URL, so it points at a URL that only redirects | no |  |
| `canonical-tracking-params` | the canonical carries campaign parameters, so every shared link proposes its own canonical | no |  |
| `canonical-og-url-mismatch` | og:url and the canonical name different URLs, so the page states two addresses for itself | no |  |

## hreflang clusters

Checker: `hreflang`, 6 findings.

| Finding | What it means | Silent | Absence |
|---|---|---|---|
| `hreflang-missing-self` | a page does not list itself among its alternates, which invalidates the cluster | yes |  |
| `hreflang-not-reciprocal` | a page points at an alternate that does not point back, so the pairing is ignored | yes |  |
| `hreflang-invalid-code` | the hreflang value is not a language, language-script or language-region value | yes |  |
| `hreflang-relative` | an alternate href is relative, and hreflang requires absolute URLs | yes |  |
| `hreflang-duplicate-code` | one page maps the same hreflang value to two different URLs | yes |  |
| `hreflang-dangling-target` | a page points at an alternate that is not in the cluster at all | yes |  |

## Heading outline

Checker: `headings`, 5 findings.

| Finding | What it means | Silent | Absence |
|---|---|---|---|
| `heading-no-h1` | the document has no h1, so nothing states what the page is | yes | yes |
| `heading-multiple-h1` | the document has more than one h1 | yes |  |
| `heading-skipped-level` | a level is skipped, so the outline does not describe a hierarchy | yes |  |
| `heading-empty` | an empty heading element sits in the outline | yes |  |
| `heading-used-for-styling` | a heading holds body copy, which is a paragraph that got its size from a heading tag | yes |  |

## Analytics tag hygiene

Checker: `analytics`, 4 findings.

| Finding | What it means | Silent | Absence |
|---|---|---|---|
| `analytics-legacy-ua` | a Universal Analytics id is still published, and it has processed nothing since July 2023 | yes |  |
| `analytics-multiple-ga4-properties` | more than one GA4 measurement id fires on one page view | yes |  |
| `analytics-multiple-gtm-containers` | more than one tag container loads on one page | yes |  |
| `analytics-duplicate-config` | the same gtag config runs twice, which double counts every session | yes |  |

## Structured data: does it parse

Checker: `jsonld-syntax`, 5 findings.

| Finding | What it means | Silent | Absence |
|---|---|---|---|
| `jsonld-none` | the document carries no JSON-LD | yes | yes |
| `jsonld-empty-block` | a JSON-LD script element is empty, usually a template that rendered nothing | yes |  |
| `jsonld-unparseable` | a JSON-LD block is not valid JSON, so the whole block is discarded in silence | yes |  |
| `jsonld-html-escaped` | a JSON-LD block contains HTML entities, so something escaped it on the way into the page | yes |  |
| `jsonld-duplicate-entity` | the same named entity is declared twice in one document | yes |  |

## Structured data: the entity graph

Checker: `jsonld-graph`, 4 findings.

| Finding | What it means | Silent | Absence |
|---|---|---|---|
| `jsonld-entity-without-id` | an entity node has no @id, so nothing else on the site can reference it | yes |  |
| `jsonld-duplicate-id` | two nodes share one @id, so the graph describes one thing twice and differently | yes |  |
| `jsonld-inlined-entity` | a whole entity is restated inside another node instead of referenced by @id | yes |  |
| `jsonld-dangling-reference` | an @id is referenced but never defined, so the reference resolves to nothing | yes |  |

## Structured data: breadcrumbs

Checker: `jsonld-breadcrumb`, 7 findings.

| Finding | What it means | Silent | Absence |
|---|---|---|---|
| `breadcrumb-missing` | the page declares no BreadcrumbList | no | yes |
| `breadcrumb-position-not-sequential` | positions are not 1..n, so the trail has no defined order | no |  |
| `breadcrumb-missing-name` | a trail item has no name, so the crumb renders as a bare link with nothing to read | no |  |
| `breadcrumb-missing-item-url` | a non-final trail item has no URL, so the trail cannot be followed | no |  |
| `breadcrumb-relative-url` | a trail item uses a relative URL | no |  |
| `breadcrumb-last-item-not-this-page` | the trail ends somewhere other than the page it is on | no |  |
| `breadcrumb-depth-mismatch` | the trail length does not match the depth of the URL path | no |  |

## Sitemap contents

Checker: `sitemap`, 10 findings.

| Finding | What it means | Silent | Absence |
|---|---|---|---|
| `sitemap-not-well-formed` | the file is not well-formed XML, so nothing in it is read | no |  |
| `sitemap-no-urlset` | the root element is neither urlset nor sitemapindex, so the file is not a sitemap | no |  |
| `sitemap-too-many-urls` | the file holds more than fifty thousand URLs, which is over the protocol limit | no |  |
| `sitemap-loc-relative` | a loc is not an absolute URL | no |  |
| `sitemap-loc-non-https` | a loc is http, so every entry in the file costs a redirect | no |  |
| `sitemap-duplicate-loc` | a URL is listed more than once | no |  |
| `sitemap-lastmod-missing` | a URL has no lastmod, the only per-URL hint in the file Google uses | no |  |
| `sitemap-lastmod-invalid` | lastmod is not a W3C datetime, so it is ignored without a word anywhere | no |  |
| `sitemap-lastmod-future` | lastmod is a date that has not happened yet, which is a clock or a template fault | no |  |
| `sitemap-priority-or-changefreq` | the file declares priority or changefreq, both of which Google ignores | no |  |

## Crawling versus indexing

Checker: `robots`, 8 findings.

| Finding | What it means | Silent | Absence |
|---|---|---|---|
| `robots-no-wildcard-group` | there is no User-agent: * group, so most crawlers are given no rules | no | yes |
| `robots-no-sitemap` | robots.txt declares no Sitemap | no | yes |
| `robots-sitemap-relative` | a Sitemap line is not an absolute URL, which the protocol requires | no |  |
| `robots-blocks-own-sitemap` | robots.txt disallows the sitemap it declares | no |  |
| `robots-disallow-hides-noindex` | a URL is disallowed and carries noindex, so the noindex is never read and the URL cannot leave the index | no |  |
| `robots-disallow-contradicts-sitemap` | a URL is disallowed and submitted in the sitemap at the same time | no |  |
| `robots-disallow-hides-canonical` | a URL is disallowed, so the canonical it declares is never read | no |  |
| `robots-blocks-render-assets` | an asset the page needs in order to render is disallowed | no |  |

## Redirect maps

Checker: `redirects`, 6 findings.

| Finding | What it means | Silent | Absence |
|---|---|---|---|
| `redirect-duplicate-source` | one source URL is mapped twice, and which rule wins depends on the server | yes |  |
| `redirect-relative-target` | a target is neither absolute nor root-relative | yes |  |
| `redirect-to-self` | a rule redirects a URL to itself | yes |  |
| `redirect-loop` | a chain of rules never terminates | yes |  |
| `redirect-chain` | a source reaches its destination through more than one hop | yes |  |
| `redirect-temporary-for-permanent-move` | a move that is not coming back is served as a temporary redirect | yes |  |

## What is not here

Everything these checkers cannot see, which is a longer list than this one and
is written out in [what the checkers cannot see](what-the-checkers-cannot-see.md).
