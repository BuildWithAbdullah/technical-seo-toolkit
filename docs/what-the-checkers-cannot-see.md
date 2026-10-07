# What the checkers cannot see

Read this before trusting a green run.

Every finding in this repository is produced by reading one artefact that is
small enough to reason about. None of these checkers is a crawler, none of them
fetches anything, and none of them sees the page a search engine actually
receives. That gap is where most real technical SEO faults live, so a clean run
here means the artefact you handed over is correct, and nothing more than that.

Three limits apply everywhere, and they matter more than any of the per-checker
notes below.

**The artefact is not the page.** Every HTML pattern here is checked as source.
A search engine sees the document after the server, the CDN, the tag manager, the
consent layer and the framework have all had a turn. A canonical that is right in
the template and rewritten on hydration is a different canonical. A JSON-LD block
that is valid in your editor and escaped by the CMS on the way out is a broken
block. The only way to know what is being served is to fetch the URL and read the
response, and nothing in this repository does that.

**Nothing here is a judgement about whether a page should be indexed.** The
checkers tell you that two controls contradict each other, that a trail does not
match its URL, that a date cannot be parsed. Whether a given page belongs in the
index at all is a decision about the site, and no check can make it for you.

**A clean artefact can still be the wrong artefact.** A sitemap with no faults in
it can list the wrong five thousand URLs. A reciprocal hreflang cluster can point
at pages that nobody should land on. Correctness of form says nothing about
correctness of content.

## Per checker

### canonical

Reads the document as source. It does not fetch the canonical target, so it
cannot tell you whether that URL returns 200, redirects, is itself canonicalised
elsewhere, or is blocked from crawling. It compares against `og:url` only, so a
disagreement with a sitemap entry, an hreflang alternate or an internal link is
invisible here. It treats a trailing slash difference as the same address, which
is nearly always right and is occasionally wrong on a server that serves both.

### hreflang

Reads a manifest, which means it is checking what you believe the cluster is
rather than what the pages declare. Building that manifest by hand is how a
cluster gets certified against its own documentation. It also cannot see hreflang
delivered in HTTP headers or in a sitemap, which are both valid and both common
on large sites, and it does not fetch any alternate, so a reciprocal cluster
pointing at four 404s passes.

### headings

The outline is read in document order from the source. A page that moves headings
with CSS, or renders half of them after hydration, has an outline this checker
never sees. The body-copy finding is openly a heuristic with a threshold at 160
characters: a long heading is usually a paragraph that got its size from a tag,
and sometimes it is a long heading. Nothing here judges whether the headings
describe the page, which is the thing that actually matters and is not mechanical.

### analytics

Finds measurement ids in the served source. It cannot see a tag injected by a tag
manager at runtime, which is how most duplicate tags arrive, so the usual cause
of the fault is the one case this checker misses. It also cannot tell you who
owns a container: an id is an id, and whether you can log into the account behind
it is something only a person can check. Every `meta.json` carries a
`manualCheck` for exactly this reason.

### jsonld-syntax

Reports that a block did not parse, was escaped, or rendered empty. It does not
validate against Schema.org, so a block that parses cleanly and uses a property
that does not exist, or omits one a rich result requires, passes. Eligibility for
a rich result is Google's judgement and changes without notice; this checker only
tells you the block survived the parser.

### jsonld-graph

Judges one document. The fault this pattern is really about, four templates
describing four different organisations, is a property of a whole site and needs
every page's graph collected before it can be seen. On one page, an entity
referenced from elsewhere and not defined here looks like a dangling reference
even when the site is coherent. It also only treats top-level and `@graph` nodes
as definitions, so an `@id` declared on a nested object does not count as defined.

### jsonld-breadcrumb

Compares the trail against the page's own declared URL and the depth of its path.
A site whose URL structure deliberately does not mirror its navigation will trip
the depth finding while being entirely correct, which is why that one is a
finding and not an error. It cannot compare the trail against the breadcrumbs a
visitor sees, because those are rendered, and a trail that disagrees with the
visible navigation is the version Google stops trusting.

### sitemap

Reads one file. It does not fetch a single URL in it, so it cannot tell you that
half the entries redirect, that some are excluded by a `noindex`, or that others
are canonicalised to somewhere else, and those are the faults that make a sitemap
actively misleading. It validates `lastmod` as a date, which means both its shape
and that the date exists, but it has no way to know whether the date is true, and
a `lastmod` that updates on every deploy is worse than none at all.

### robots

Implements Google's documented precedence: longest matching rule wins and `Allow`
wins a tie. It matches rule paths as prefixes and strips a trailing wildcard, so
a rule with a wildcard in the middle of the path, or an end-of-string anchor, is
matched more loosely than a real crawler would match it. Other crawlers do not
all follow Google's precedence. And the manifest describes what you think the
site serves: the only way to know a URL is fetchable is to ask the URL Inspection
tool about that URL.

### redirects

Reads the map, not the server. A clean map deployed onto a host that adds its own
rules, a CDN with a redirect layer of its own, or a platform that forces a
trailing slash, produces chains this file cannot predict. Checking the map is
worth doing before a migration and proves nothing after one: the finding that
matters on launch day comes from following every source URL with a real request
and counting the hops.

## The dependencies

Two: `cheerio` for HTML and `fast-xml-parser` for XML. Both are here deliberately.
Hand-rolling an HTML parser is how a checker ends up confidently wrong about a
document a browser reads correctly, and a checker that is confidently wrong is
worse than no checker. The consequence is that the HTML these patterns are judged
against is the HTML `cheerio` builds, which is close to a browser and is not a
browser.
