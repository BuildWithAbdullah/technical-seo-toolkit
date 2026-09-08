# One entity, referenced, not repeated

The common shape for structured data is a self-contained block on every page,
each one describing the organisation from scratch. It validates. Every
enhancement report is green. And the site is telling search engines about four
subtly different organisations.

## `@id` is an identifier, not a link

Give each entity a stable `@id` and reference it everywhere else:

```json
{ "@type": "Organization", "@id": "https://www.example.com/#organization", "name": "..." }
```

```json
{ "@type": "WebPage", "publisher": { "@id": "https://www.example.com/#organization" } }
```

The `@id` does not have to resolve to a page. It has to be the same string
everywhere, forever. Deriving it from one configured base URL is what keeps that
true across templates that were written years apart:

```js
const organizationId = `${base}/#organization`;
```

## What the repetition costs

**Drift.** Three copies on three templates diverge within a year. The legal name
gains a suffix in one place, the logo path changes in another, one still has the
old apex domain. Nothing errors; the entity just becomes ambiguous.

**Confidence.** Structured data is a claim, and a claim made four different ways
is weaker than one made consistently.

**Maintenance.** Adding a social profile means editing every template that
inlines the organisation, and finding all of them is the hard part.

With references, the organisation is described once. Change the logo and every
page that mentions it is correct, because none of them held a copy.

## The nodes worth having

- `Organization`, once, on the home page, referenced from everywhere.
- `WebSite`, once, with `publisher` pointing at the organisation.
- `WebPage` per page, with `isPartOf` pointing at the website.
- Then whatever the page actually is: `Product`, `Article`, `FAQPage`.

Put them in a single `@graph` array in one script block. One block is easier to
build, easier to validate, and impossible to half-emit.

## Dangling references

A reference to an `@id` that is not defined in the same document resolves to
nothing. No validator will tell you, because referencing an `@id` defined on
another page is legal markup and sometimes intended. The verifier here checks
that every bare `{"@id": ...}` resolves within the document, which is the
stricter rule and the one worth holding yourself to.

## How to test

Crawl the site, collect every JSON-LD node, and group them by `@type`. The
organisation should appear once with one `@id`. If it appears eighty times with
none, that is the finding.

## Related

- [`../jsonld-parses/`](../jsonld-parses/) - none of this matters if the block
  does not parse
