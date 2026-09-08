# Technical SEO Toolkit

Crawlability, indexation, structured data and measurement patterns. Each one has
a failing example and a corrected example, and `npm run verify` checks both:
the corrected file must be clean, and the failing file must still fail.

This exists because technical SEO advice is almost entirely unverifiable prose.
A pattern nobody runs drifts, and a checklist item nobody can test becomes a
belief. Here, the claims are executable.

## The part that matters more than the patterns

**Six of the ten patterns produce no report in Search Console.**

Google tells you when it disagrees with your canonical, when a page redirects,
when a URL is blocked. It does not tell you that your hreflang cluster points
one way, that a structured data block failed to parse, that four templates
describe four different organisations, that a redirect takes four hops, or that
two analytics tags are counting every session twice.

Those failures are indistinguishable from never having done the work. They are
found by looking, or by a check that runs on every commit, and not otherwise.
The `gscReports` field in each `meta.json` records which category the pattern is
in, and the verifier prints it.

| Pattern | What breaks | In Search Console |
|---|---|---|
| [Canonical tags](patterns/canonical-tags/) | Relative canonicals, staging leaking into production, two tags in one head | Yes, after the fact |
| [Crawl versus index](patterns/robots-crawl-vs-index/) | Disallow plus noindex, so the noindex is never read and the URL cannot leave the index | Yes |
| [Sitemap contents](patterns/sitemap-contents/) | priority and changefreq noise, unparseable lastmod, redirecting URLs submitted as canonical | Partly |
| [Breadcrumbs](patterns/jsonld-breadcrumbs/) | A valid trail that describes a different page | Partly |
| [Redirect maps](patterns/redirect-maps/) | Chains, loops, 302s on permanent moves | **No** |
| [hreflang clusters](patterns/hreflang-clusters/) | One-directional links, missing self-reference, country codes used as languages | **No** |
| [Structured data parsing](patterns/jsonld-parses/) | Truncated, escaped, duplicated and empty JSON-LD, all failing silently | **No** |
| [Entity graph](patterns/jsonld-entity-graph/) | The organisation described from scratch on every template | **No** |
| [Heading outline](patterns/heading-outline/) | No h1, skipped levels, paragraphs marked up as headings | **No** |
| [Analytics tag hygiene](patterns/analytics-tag-hygiene/) | Dead UA properties, duplicate tags, containers owned by somebody else | **No** |

## Layout

```
patterns/canonical-tags/
  README.md     what the rule is, how it fails in production, how to test
  fail.html     the failing artefact, commented
  pass.html     the corrected artefact, commented
  meta.json     the rule ids the failing example must trigger, and whether
                Search Console reports the problem at all
```

Artefacts are whatever the pattern is actually about: HTML for anything in the
head, XML for sitemaps, and a JSON manifest where the rule spans more than one
page. hreflang and robots use manifests deliberately, because the faults that
matter in both are only visible when several pages are in view at once, and a
checker that looked at one page would pass a completely broken site.

## Verifying

```bash
npm install
npm run verify
```

```
OK     Canonical tags that name a real, reachable URL (fail.html: canonical-outside-head, canonical-multiple, ...)
OK     A migration map with no chains and no loops (fail.json: redirect-chain, redirect-loop, ...)
       Search Console does not report this. Page indexing reports Page with redirect as a neutral status.

10 patterns checked, 6 of them invisible in Search Console, 0 failing.
```

The build fails if a corrected example stops being clean or a failing example
stops failing.

## Documents

| Document | What it covers |
|---|---|
| [Search Console issue playbook](docs/search-console-playbook.md) | What each status means, which ones are confirmations rather than faults, which two are judgements rather than bugs, and what Search Console will never tell you |

## Scope

Crawling, indexing, canonicalisation, structured data, redirects, international
targeting, and the measurement those decisions are judged by. Not content
strategy, not keyword research, not link building.

The patterns are framework-free. They are plain HTML, XML and JSON so they can
be lifted into a theme, a static site generator, a Next.js app or a page builder
without translation.

## Related

- [core-web-vitals-checklist](https://github.com/BuildWithAbdullah/core-web-vitals-checklist) - the performance half of the same audit
- [wcag-fix-library](https://github.com/BuildWithAbdullah/wcag-fix-library) - heading structure again, framed as the accessibility requirement it also is
- [wordpress-security-hardening](https://github.com/BuildWithAbdullah/wordpress-security-hardening) - including the bot protection rules that deindex sites by accident

## Licence

MIT. Use them, ship them, no attribution required.
