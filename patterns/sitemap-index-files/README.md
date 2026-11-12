# A sitemap index whose children can actually be fetched

Once a site passes fifty thousand URLs it submits a sitemap index: one small
file whose job is to name the files that hold the real list. Everything about
that file is cheap to get wrong and expensive to get wrong, because a fault in
a index entry does not cost you one URL. It costs you every URL in the child it
names.

This is also the file that is easiest to believe is fine. It parses. The
Sitemaps report in Search Console shows it as read, with a row for each child
it managed to fetch and a URL count beside each row. What the report cannot
show you is a row that should have been there. A child whose `loc` was relative
is not listed as broken, it is simply absent, and the report underneath looks
exactly like a site that has four sitemaps rather than five.

## The five faults in `fail.xml`

**A relative `loc`.** The protocol requires an absolute URL. A relative one is
not resolved against the index, it is discarded, so the child is never fetched
and never reported.

**An `http` loc on an https site.** Every child fetch starts with a redirect.
It works, and it spends crawl budget on nothing, on the one file whose whole
purpose is to be fetched often.

**The same child listed twice.** The signature of a generator that appends to
the index on deploy rather than rewriting it. Harmless until the duplicates
outnumber the real entries and the index stops being readable by a person.

**No `lastmod` at all.** On a URL entry `lastmod` is a hint. On an index entry
it is the decision: it is how Google works out whether fetching that child
again would tell it anything. An index with no `lastmod` anywhere is asking for
every child to be refetched on somebody else's schedule, which in practice
means your new pages wait.

**A `lastmod` a person can read and a parser cannot.** `15 January 2026` is
ignored, in silence, and the entry then behaves exactly like the one with no
`lastmod` at all while looking like it has one.

## The corrected file

`pass.xml` names five children, each once, each by an absolute https URL on the
site's own host, each with a `lastmod` in W3C datetime form. Two different
shapes of that format appear in it on purpose: a plain date and a full
timestamp with an offset. Both are valid, and a checker that accepts only the
first is a checker that will one day tell somebody their correct file is wrong.

## What this cannot tell you

Nothing here fetches anything, so a child named by a perfectly spelled URL that
returns 404 is reported clean. The index is also judged on its own: whether the
children between them cover the site, and whether they overlap, are questions
about the whole set of files and this is one of them.

Run `npm run verify` to see both files checked, and
`docs/what-the-checkers-cannot-see.md` for the full list of what is out of
reach.
