# Breadcrumbs that match the URL they are on

Breadcrumb markup is the easiest structured data to get syntactically right and
one of the easiest to get factually wrong, because a trail that describes the
wrong page is perfectly valid markup.

## Three rules that are checkable

**Positions count from one.** The vocabulary is one-based. A list starting at 0
claims to begin before its own beginning.

**Every URL is absolute.** Structured data has no document base to resolve a
relative URL against.

**The last item is this page.** The trail ends where the user is. A trail ending
at the category is a claim that this page is the category page, which competes
with the actual category page for the same result.

## The rule that is only checkable in context

The trail should describe the path the URL actually has. A URL with three path
segments needs four items counting the home page. When they disagree, one of
them is lying about the site's structure, and the markup is usually the one that
is wrong because the visible breadcrumbs get looked at and the JSON-LD does not.

## Generate it, do not write it

Derive the trail from the URL and the page's own title:

```js
const parts = new URL(pageUrl).pathname.split('/').filter(Boolean);
const items = [{ name: 'Home', url: base }].concat(
  parts.map((_, i) => ({
    name: titleFor(parts.slice(0, i + 1)),
    url: `${base}/${parts.slice(0, i + 1).join('/')}`,
  }))
);
```

A hand-written trail per template is internally valid and describes wherever it
was copied from. That is the failure that survives review, because reviewing it
means checking it against a URL rather than reading it.

## Keep the visible trail and the markup in step

Both should come from the same source. Marking up a trail the page does not
show, or showing one the markup does not describe, is a mismatch Google can see
and a reason to stop trusting the markup on that site.

## How to test

Open the page, read the visible breadcrumbs, read the URL, read the JSON-LD.
Three descriptions of the same path. If any two differ, fix the source they are
generated from rather than the one that looks wrong.
