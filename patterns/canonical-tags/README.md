# Canonical tags that name a real, reachable URL

A canonical tag is a claim about which URL is the one you want indexed. It is a
hint, not an instruction, and Google weighs it against everything else the site
says: internal links, the sitemap, redirects, hreflang. A canonical that
disagrees with those is discarded quietly.

## The one that removes a site from the index

Staging emitting production canonicals, or production emitting staging ones.

It comes from a relative canonical, or from a base URL hard-coded in a config
file that got copied between environments. Every page on staging says the
canonical is the production URL, which is harmless; or every page on production
says the canonical is `staging.example.com`, which is not, because Google then
tries to index a host it cannot reach and drops the pages it could.

Derive the base from the environment and build the URL from it:

```js
const canonical = new URL(path, process.env.SITE_URL).toString();
```

One line, one place, and the environment cannot be wrong because it is not
written down twice.

## Self-referencing is the default

Every indexable page should name itself. A page with no canonical is not
neutral: it invites Google to pick one, and on a site with faceted URLs,
tracking parameters and printer-friendly variants there is always a candidate.
The cost of naming yourself is one line; the cost of not is an argument you
cannot see happening.

## Where the tag has to be

In `<head>`, in the HTML the crawler receives. Two ways that goes wrong:

**In the body.** Ignored. A canonical injected by a script that appends to the
document rather than the head is not a canonical.

**Added after hydration.** Google renders, so a canonical written by client-side
JavaScript can be picked up, but the first pass sees the server response. If the
two disagree, the tag is doing the opposite of its job. Check the rendered HTML,
not the source, and check both.

## Two tags is worse than none

Conflicting canonicals in one head are discarded outright. This is common on
sites where the theme emits one and an SEO plugin emits another, and it survives
because both are individually correct. Grep the rendered head for `rel="canonical"`
and count.

## How to test

1. Fetch the page as Googlebot and read the canonical from the response body.
2. Compare it to `og:url`. They should be identical.
3. Fetch the canonical URL itself. It must return 200, not a redirect.
4. Confirm the canonical URL is in the sitemap and the current URL is not, if
   they differ.
5. Repeat on staging and confirm it points at staging.

## Related

- [`../redirect-maps/`](../redirect-maps/) - a canonical that points at a
  redirect is a signal that costs a hop to follow
- [`../sitemap-contents/`](../sitemap-contents/) - the sitemap should list
  canonical URLs and nothing else
