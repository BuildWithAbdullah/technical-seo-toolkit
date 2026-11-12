# What the checkers cannot see

Generated from `tools/limits.mjs` by `npm run docs`. Do not edit by hand:
CI regenerates this file and fails if it differs from what is committed.

There are 14 declared limits.

Every one of them is asserted rather than described, which is the only reason
this document is worth reading. A sentence saying a checker cannot see
something still reads correctly after the checker learns to see it, and a
reader who trusts a caveat that is no longer true is worse off than one who had
nothing. So each limit below carries two artefacts, and
`test/limits.test.mjs` runs both:

- a **blind** artefact the limit applies to, where the checker must stay quiet
  about the findings the limit names
- a **contrast** artefact, nearly identical, where the same checker must speak

The second half is the one people leave out. Without it a limit is
indistinguishable from a checker that simply does not work: silence is
evidence of a blind spot only once the same code has been shown to fire.

## The 2 limits where the checker says so

Two of these do not produce silence. The checker reports that an input it
needed was absent and that a rule it owns was therefore not run, and that
refusal is catalogued as a finding like any other. The distinction matters: a
rule that quietly does nothing and a rule that reports it did nothing look
identical from the outside, and only one of them is honest.

- **Two breadcrumb rules need the URL of the page and say so when they do not have it** reports `breadcrumb-page-url-unknown`.
- **Whether a move is permanent is a question about the status, and a map need not record one** reports `redirect-status-missing`.

## The 2 limits that produce a finding that is wrong

These are the uncomfortable ones. The limit does not hide a fault, it invents
one: the checker is confidently wrong about an artefact that is correct. They
are listed out loud because a reader who hits one needs to recognise it, and
the test suite holds the checker to being wrong in exactly the stated way.

- **The HTML is read as served, not as rendered** reports `canonical-missing`, which is false of the page as a crawler sees it.
- **Only JSON-LD is read, so microdata and RDFa look like no structured data at all** reports `jsonld-none`, which is false of the page as a crawler sees it.

## Every limit

### Nothing here fetches a URL

Checker: `canonical`. Limit id: `no-network`.

Every checker reads a file it was handed. None of them makes a request, so none can tell you whether the URL a canonical names returns 200, whether a redirect target exists, or whether a sitemap entry is reachable. A canonical pointing at a page that was deleted last year is spelled correctly and is reported clean.

Asserted silent on: `canonical-`.

Proved live by a contrast artefact that produces `canonical-non-https`.

### The HTML is read as served, not as rendered

Checker: `canonical`. Limit id: `no-rendering`.

There is no browser here. A canonical, a heading or a JSON-LD block that JavaScript adds after load is invisible to these checkers, and one that JavaScript removes is still counted. This limit does not only hide faults, it manufactures them: the blind artefact below sets its canonical from a script, and the checker reports the page as having no canonical at all, which is false of the page a crawler renders.

Asserted on the finding it produces rather than on silence.

Reports wrongly: `canonical-missing`. The artefact is correct and the checker says otherwise.

Proved live by a contrast artefact that the same checker reports completely clean.

### A robots.txt rule is matched against the path and not the query string

Checker: `robots`. Limit id: `robots-query-string`.

Google matches a Disallow against the path and the query string together, so Disallow: /*?sort= blocks a faceted URL. The matcher here is given a path only, because the asset and page lists in a manifest are normally pasted from a browser network panel and the query is dropped on the way in. A rule that does its work in the query string therefore looks like a rule that matches nothing.

Asserted silent on: `robots-blocks-`.

Proved live by a contrast artefact that produces `robots-blocks-render-assets`.

### Only the wildcard group and Googlebot groups are evaluated

Checker: `robots`. Limit id: `robots-other-agents`.

The precedence rules implemented here are the ones Google documents, so the only groups read are User-agent: * and any group naming Googlebot. A group aimed at another crawler is parsed and then ignored. If the fault you are chasing is that one crawler has been locked out, this will not find it.

Asserted silent on: `robots-blocks-`.

Proved live by a contrast artefact that produces `robots-blocks-render-assets`.

### The fifty megabyte limit is not checked, only the fifty thousand URL limit

Checker: `sitemap`. Limit id: `sitemap-byte-size`.

The protocol caps a sitemap at 50,000 URLs and at 50MB uncompressed, and a file can break the second without approaching the first. The entry count is checked here and the byte size is not, because size is a property of the file as served and this checker is handed a string with no claim about its encoding or whether it was gzipped. No finding in the catalogue mentions size at all.

Asserted silent on: `sitemap-too-many`, `sitemap-size`.

Proved live by a contrast artefact that produces `sitemap-too-many-urls`.

### Only JSON-LD is read, so microdata and RDFa look like no structured data at all

Checker: `jsonld-syntax`. Limit id: `jsonld-only-json-ld`.

The checkers find structured data by looking for script elements of type application/ld+json. Microdata written with itemscope and itemprop, and RDFa written with typeof and property, are both valid, both read by Google, and both invisible here. This is the second limit that manufactures a finding rather than hiding one: the blind artefact below carries a complete Organization in microdata and is reported as carrying no JSON-LD, which is true and reads as a page with no structured data.

Asserted on the finding it produces rather than on silence.

Reports wrongly: `jsonld-none`. The artefact is correct and the checker says otherwise.

Proved live by a contrast artefact that the same checker reports completely clean.

### The graph is checked for shape, never for vocabulary

Checker: `jsonld-graph`. Limit id: `jsonld-vocabulary`.

These checkers ask whether the graph is coherent: whether entities carry identities, whether references resolve, whether anything is restated. They never ask whether a property exists on a type, whether a value is the right datatype, or whether the properties a rich result requires are present. A node with a misspelled property name is structurally perfect and is reported clean. The validator at schema.org answers the vocabulary question and this does not.

Asserted silent on: `jsonld-`.

Proved live by a contrast artefact that produces `jsonld-entity-without-id`.

### The cluster manifest says nothing about where the annotations are published

Checker: `hreflang`. Limit id: `hreflang-transport`.

Reciprocity can only be judged with every page of the cluster in view, which is why the input here is a manifest rather than a page. The cost is that the manifest does not record how each annotation reaches Google. A cluster that is perfectly reciprocal in this file and declared somewhere Google does not read it, such as a sitemap that was never submitted, is reported clean.

Asserted silent on: `hreflang-`.

Proved live by a contrast artefact that produces `hreflang-not-reciprocal`.

### A redirect target outside the map is assumed to be the end of the chain

Checker: `redirects`. Limit id: `redirect-target-existence`.

Chains and loops are found by following targets back into the map. A target that is not a source in the map is treated as a final destination, because there is nothing else to treat it as. If that URL 404s, or redirects again at a layer the map does not describe, such as a CDN rule or a trailing slash normaliser, the chain is longer than this says and may not terminate at all.

Asserted silent on: `redirect-`.

Proved live by a contrast artefact that produces `redirect-chain`.

### The outline is read from the source order and counts headings nobody sees

Checker: `headings`. Limit id: `heading-visibility`.

Headings are collected in document order and judged on their text, their label and their image alt text. Whether a heading is visible is a question about CSS, and there is no CSS engine here. The blind artefact below has an h1 that is hidden, so neither a reader nor a rendered crawl finds anything stating what the page is, and this checker reports the h1 as present.

Asserted silent on: `heading-no-h1`.

Proved live by a contrast artefact that produces `heading-no-h1`.

### A canonical is judged against the page it sits on and nothing else

Checker: `canonical`. Limit id: `canonical-one-page-at-a-time`.

A canonical chain, where A names B and B names C, is the most common serious canonical fault and it cannot be seen from one document. Nor can a canonical pointing at a page that is noindex, which asks Google to consolidate signals onto a page that is asking to be dropped. Both need the target page, and this checker is handed one file.

Asserted silent on: `canonical-`.

Proved live by a contrast artefact that produces `canonical-multiple`.

### What a tag container fires is not in the page

Checker: `analytics`. Limit id: `analytics-container-contents`.

A tag container is one script element in the markup and a list of tags on Google servers. A container that fires two GA4 properties and a container that fires nothing at all are byte identical in the page. Every analytics finding here is about what the markup declares, so a page whose double counting happens inside the container is reported clean.

Asserted silent on: `analytics-multiple`, `analytics-duplicate`.

Proved live by a contrast artefact that produces `analytics-multiple-ga4-properties`.

### Two breadcrumb rules need the URL of the page and say so when they do not have it

Checker: `jsonld-breadcrumb`. Limit id: `breadcrumb-page-url`.

Whether the trail ends on the page it is on, and whether its length matches the depth of the URL, are both questions about the page URL. The page states it in og:url or in its canonical. When it states neither, those two rules cannot run, and the checker emits breadcrumb-page-url-unknown rather than passing in silence. That refusal is the limit holding: before it existed, a page with no canonical skipped both rules and was reported clean.

Asserted silent on: `breadcrumb-last-item-not-this-page`, `breadcrumb-depth-mismatch`.

Reports instead: `breadcrumb-page-url-unknown`, a note. The refusal is the limit holding.

Proved live by a contrast artefact that produces `breadcrumb-depth-mismatch`.

### Whether a move is permanent is a question about the status, and a map need not record one

Checker: `redirects`. Limit id: `redirect-status`.

A redirect map exported from a server configuration or a spreadsheet often carries only the two URLs. Without a status there is no answer to whether the move is permanent, so the checker emits redirect-status-missing instead of guessing. It used to guess: a rule with no status was reported as a temporary redirect, with the word undefined where the status code belonged, which is a verdict delivered on no evidence.

Asserted silent on: `redirect-temporary-for-permanent-move`.

Reports instead: `redirect-status-missing`, a warning. The refusal is the limit holding.

Proved live by a contrast artefact that produces `redirect-temporary-for-permanent-move`.

## What this document is not

It is not the list of findings. That is [every finding, listed](every-finding.md),
generated from the catalogue in the same way.
