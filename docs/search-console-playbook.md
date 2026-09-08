# Search Console issue playbook

What each status actually means, how to confirm it, and what to do. The
statuses are precise; the trouble is that several of them are read as errors
when they are confirmations that something is working, and two of them are read
as problems to fix when they are usually judgements to accept.

## First, the two that are not faults

**Alternate page with proper canonical tag.** Google found a duplicate, read
your canonical, and honoured it. This is the system working. On a site with
faceted URLs or tracking parameters this bucket is legitimately large. Nothing
to do.

**Excluded by noindex tag.** You asked for this. Confirm the pages listed are
the pages you meant, and move on.

## The two that are judgements, not bugs

**Discovered, currently not indexed.** Google knows the URL exists and has not
fetched it. Usually crawl budget: the site has more URLs than its authority
justifies crawling, often because of infinite faceted space. Sometimes server
speed, because slow responses reduce crawl rate.

Not fixed by resubmitting the sitemap. Fixed by having fewer, better URLs, or by
being worth crawling more often.

**Crawled, currently not indexed.** Google fetched it, read it, and decided not
to index it. This is a quality judgement and it is the one that generates the
most wasted effort, because it feels technical and is not.

Before treating it as a content problem, rule out the technical causes: the page
is nearly identical to another, it is thin because the content loads client-side
and the render did not complete, or it is one of thousands of near-identical
templated pages. If none of those apply, the answer is that the page is not
worth indexing yet, and no amount of technical work changes that.

## The ones that are faults

| Status | What it means | Confirm with | Fix |
|---|---|---|---|
| **Indexed, though blocked by robots.txt** | Google knows the URL from links but cannot fetch it, so it cannot read your noindex | URL Inspection reports the page as blocked | Remove the Disallow so the noindex can be read. See [robots-crawl-vs-index](../patterns/robots-crawl-vs-index/) |
| **Duplicate, Google chose a different canonical than user** | Your canonical was read and overruled by other signals | Compare internal links, sitemap entries and redirects for the two URLs | Make the other signals agree with the canonical. Google is telling you the site contradicts itself |
| **Duplicate without user-selected canonical** | No canonical at all, and Google picked one | Fetch the page and look for the tag | Add a self-referencing canonical. See [canonical-tags](../patterns/canonical-tags/) |
| **Page with redirect** | Neutral for a URL you redirected on purpose | curl the URL and count hops | Only act if it is unintended, or if the hop count is above one. See [redirect-maps](../patterns/redirect-maps/) |
| **Soft 404** | Returns 200 with content that reads as missing | Fetch it and look at what renders | Return a real 404, or put real content on it. Empty category pages are the usual source |
| **Server error (5xx)** | Fetch failed | Check logs for Googlebot user agents specifically | Often rate limiting or a WAF rule treating Googlebot as a threat |
| **Blocked due to access forbidden (403)** | The crawler is being refused | Fetch with a Googlebot user agent from outside your network | Usually bot protection at the CDN or host. This is the one that silently deindexes a whole site after a security change |

## Reading the numbers

**The 28 day lag.** Search Console data is not live. Judging a change made three
days ago against this week's numbers produces confident conclusions about noise.

**Impressions against sessions.** Compare Search Console clicks with the organic
sessions your analytics reports for the same period. They measure different
things and will never match, but they should be the same order of magnitude. A
large divergence means one of them is measuring something that is not human
search traffic, and it is worth knowing which before either number is used to
make a decision. See [analytics-tag-hygiene](../patterns/analytics-tag-hygiene/).

**Validation.** Requesting validation queues a recrawl of the affected URLs. It
does not make Google agree with you. Validation of a quality judgement will fail
and the failure means nothing changed, not that something is broken.

## What Search Console will never tell you

The reason this repository has a machine-checkable half. None of the following
produce a report of any kind:

- A one-directional hreflang cluster
- Structured data that failed to parse
- Four copies of your organisation entity across four templates
- A redirect chain, as distinct from a redirect
- Two analytics tags on one page
- A heading outline that says nothing about the page
- A breadcrumb trail describing a different page

Six of the ten patterns here are in that category. They are found by looking, or
by a check that runs in CI, and not otherwise.
