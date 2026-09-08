# A sitemap that says something Google uses

A sitemap is a list of URLs you are putting forward as canonical and want
crawled. It is not a site map, it is not a coverage report, and it is not a
place to list everything you have.

## Two of its five elements do nothing

`<priority>` and `<changefreq>` are ignored. Google has said so repeatedly and
for years. They are also the two elements every generator fills in by default,
which is why most sitemaps are mostly noise.

`<lastmod>` is used, conditionally. It has to be a valid W3C datetime, and it
has to be believable. Both conditions fail routinely:

**Not a datetime.** `2026-09-01 14:32:00` looks like a date and is not one; the
separator between date and time is a `T`. A bare `2026` is technically valid and
tells Google nothing it can act on. Anything the parser rejects is discarded
silently.

**Not believable.** A build pipeline that stamps today's date on every URL at
every deploy is claiming the entire site changed this morning. Google works out
fairly quickly that the field is worthless on this domain and stops reading it.
There is no way to earn that back on a schedule you control, which makes it one
of the few SEO mistakes with a lasting cost. Take the value from the content's
own `updated_at` and leave it alone when nothing changed.

## What belongs in it

Only URLs that are all four of these:

- return 200
- are self-canonical
- are indexable
- are the version you want in the index

Everything else is a contradiction you have submitted in writing. A redirecting
URL in a sitemap says "index this" and "this has moved" at once. A `noindex` page
in a sitemap says "index this" and "do not index this". A URL blocked in
`robots.txt` says "crawl this" and "do not crawl this".

## Directory form and index file

`/` and `/index.html` are two URLs. So are `/baking` and `/baking/`. Pick one
form, use it in the sitemap, canonical to it, and link to it internally.
Listing both asks Google to work out which of your two URLs is the duplicate.

## Size

50,000 URLs and 50MB uncompressed per file, then a sitemap index pointing at
several files. Splitting by content type also makes the Search Console coverage
numbers readable per section, which is worth more than the limit is.

## How to test

Take twenty URLs from the file at random and fetch them. Every one should return
200 and be self-canonical. If any redirect, the file is stale, and a stale
sitemap is worse than no sitemap because it is actively wrong.

## Related

- [`../canonical-tags/`](../canonical-tags/) - the sitemap should list canonical
  URLs and only canonical URLs
- [`../robots-crawl-vs-index/`](../robots-crawl-vs-index/) - a blocked URL in a
  sitemap is a contradiction Search Console will report back to you
