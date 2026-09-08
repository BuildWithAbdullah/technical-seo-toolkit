# Crawling and indexing are different controls

`robots.txt` controls fetching. `noindex` controls indexing. They are two
different mechanisms operating at two different stages, and almost every
expensive indexation fault comes from using one to do the other's job.

## The order of operations

1. The crawler reads `robots.txt` and decides whether it is allowed to fetch.
2. If allowed, it fetches the page.
3. Having fetched it, it reads the `robots` meta tag and the `X-Robots-Tag`
   header, and obeys them.

Step 3 only happens if step 2 does. That is the entire mechanism, and it
explains the fault below completely.

## Disallow plus noindex is a page that cannot leave the index

You want a page gone. You add `noindex` to it, and you also add a `Disallow`
rule so the crawler stops wasting time on it. Both feel like the same
instruction expressed twice.

The `Disallow` prevents the fetch. The `noindex` is never read. Google keeps the
URL, because it knows the URL exists from links pointing at it, and shows it in
results with no title and no description. Search Console labels this **Indexed,
though blocked by robots.txt**, which is an accurate description that is
routinely read as a warning rather than as the answer.

The fix reads backwards until you follow the order of operations: **remove the
Disallow.** Let the crawler fetch the page, read the `noindex`, and drop it. Once
it is gone, and only then, block crawling if you still want to.

## The same fault in three other costumes

- **Disallowed and in the sitemap.** Two instructions authored by the same
  person that contradict each other.
- **Disallowed and carrying a canonical.** The canonical is never read, so the
  duplicate is never consolidated.
- **Disallowed CSS and JavaScript.** Google renders pages. Blocking the assets
  that build the page means it is judged on what is left, which on a
  JavaScript-rendered site can be nothing.

## What robots.txt is actually for

Crawl budget on genuinely infinite space: search result pages, faceted
navigation with unbounded combinations, calendars that generate a URL per day
forever. Those you want unfetched, and you do not care about the index status of
URLs nobody links to.

## Precedence, which is where the arguments start

The most specific matching rule wins, measured by path length, and `Allow` wins
a tie. So `Disallow: /assets/` plus `Allow: /assets/` leaves the directory
crawlable, and `Disallow: /assets/` plus `Allow: /assets/app.css` exempts that
one file. The checker in this repository implements exactly that precedence,
because reasoning about it from memory is how the wrong rule ships.

## How to test

Use URL Inspection on the live URL. It tells you whether the page is crawlable
and what indexing directive was found. If it reports the page as blocked, then
whatever `noindex` you believe you have set is not being read, regardless of
what the page source says.
