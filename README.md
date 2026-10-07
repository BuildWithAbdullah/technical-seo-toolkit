# Technical SEO Toolkit

Crawlability, indexation, structured data and measurement patterns. Each one has
a failing example and a corrected example, and every claim in the repository is
executed: 142 tests, 62 catalogued findings each driven out of a real call, and
1161 repository assertions over the tree itself.

This exists because technical SEO advice is almost entirely unverifiable prose.
A pattern nobody runs drifts, and a checklist item nobody can test becomes a
belief.

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

## Every finding, listed and driven

The ten patterns demonstrate ten faults. The checkers behind them can report 62,
and all 62 are listed in [every finding](docs/every-finding.md), which is
generated from `tools/catalogue.mjs` and regenerated in CI so it cannot go stale.

The catalogue exists because of what happened when one was written. The ten
pattern pairs drove 43 of the 62 checks. The other 19 had never been observed to
fire, which is a different thing from working, and pointing a test at them found
six real defects. They are listed below.

`test/catalogue.test.mjs` now drives every catalogued finding out of a real call
into a real checker and asserts set equality in both directions: nothing in the
catalogue is unreachable, and nothing a checker emits is missing from the
catalogue. A check cannot be added without being documented, and a documented
check cannot rot into one that never fires.

## What the test suite found

Six defects, every one of them in code that had already shipped, and every one
confirmed by writing a test that reproduced it rather than by reading the source.

**A check that passed every site it existed to catch.** The robots pattern reports
an asset the crawler needs in order to render the page being disallowed. Page
entries were converted from a URL to a path before being matched against
robots.txt; asset entries were not. An asset list is normally copied out of a
browser network panel, so it arrives as absolute URLs, and a full URL matches no
robots.txt path at all. The check reported nothing for the input it would
actually be given.

**A date check that validated the spelling of a date and not the date.** The
sitemap `lastmod` rule tested a shape, so `2026-02-30` and `2026-13-01` both
passed as valid W3C datetimes. The fault the pattern is about is a `lastmod`
Google cannot parse and silently ignores, so the checker missed the real case
while appearing to cover it.

**A sitemap with the wrong root element reported clean.** A well-formed XML file
that was neither a `urlset` nor a `sitemapindex` fell into a hole: the URL loop
iterated an empty list and finished with nothing to say. A sitemap saved from the
wrong template, or an HTML error page served at the sitemap URL, passed.

**A check that could never fire.** There was a finding for a file that was both a
sitemap index and a `urlset`. A document with two root elements is not well-formed
XML and was caught by the guard above it, and no other input can produce both
keys. It was unreachable in principle, and it is gone.

**A false positive on correct markup.** The duplicate entity check built a
signature from type plus name or `@id`, so two genuinely different anonymous nodes
of the same type collapsed into one signature and were reported as one entity
declared twice. A duplicate can only be asserted about nodes that carry an
identity, which is what it does now. A false positive costs more than a missing
check, because it is how a reader learns to ignore the output.

**A correct Chinese cluster reported as broken.** The hreflang value pattern was
language plus optional region, so it rejected `zh-Hant` and `zh-Hant-TW`, which
are valid. The message was wrong too: it blamed a country code for every
malformed value, including values that were nothing of the kind, which sends the
reader to the wrong fix.

## What the suite asserts that a pair runner cannot

`npm run verify` asks whether each corrected example is clean and whether each
failing example still fails. Both are necessary. Neither catches the two ways a
pair can be worth nothing, so the test suite adds a third outcome and a
cross-check.

**A failing example whose only evidence is an absence.** A page with no h1 is a
failing heading example, and so is a blank document. Six of the 62 findings report
the absence of a thing rather than a fault in it, they are marked as such in the
catalogue, and a failing example that produces only those has demonstrated that
it is empty. `npm run verify` now rejects that too.

**A corrected example carrying somebody else's fault.** Six of the checkers read
HTML, and every corrected page here gets copied into a theme by somebody who read
one README. So every `pass.html` is run through all six, not only its own.

## Layout

```
patterns/canonical-tags/
  README.md     what the rule is, how it fails in production, how to test
  fail.html     the failing artefact, commented
  pass.html     the corrected artefact, commented
  meta.json     the rule ids the failing example must trigger, whether Search
                Console reports the problem at all, and the manual check the
                automated one cannot replace
tools/
  checkers.mjs      one checker per pattern kind
  catalogue.mjs     every finding any checker can emit
  verify.mjs        the pattern pair runner
  check.mjs         the repository verifier
  catalogue-doc.mjs generates docs/every-finding.md
test/
  cases.mjs         one artefact per finding
  catalogue.test.mjs reachability and completeness, both directions
  pairs.test.mjs    the ten pairs, plus the third outcome and the cross-check
  <kind>.test.mjs   the checkers, with their controls
```

Artefacts are whatever the pattern is actually about: HTML for anything in the
head, XML for sitemaps, and a JSON manifest where the rule spans more than one
page. hreflang and robots use manifests deliberately, because the faults that
matter in both are only visible when several pages are in view at once, and a
checker that looked at one page would pass a completely broken site.

Every hostname in every artefact is under the reserved `.example` top-level
domain, and `npm run check` fails if one is not. Nothing here comes from a
delivered site.

## Verifying

Node 20.18.1 or newer. That exact floor is `cheerio`'s, not a round number
picked for tidiness: an earlier version of this package advertised `>=20.0.0`,
which is a range its own dependency tree will not install on. CI installs on
exactly 20.18.1 with `--engine-strict`, so the claim is tested rather than
asserted, and runs the whole suite on 20, 22 and 24.

```bash
npm install
npm test                  # 142 tests over the checkers, the catalogue and the pairs
npm run verify            # the ten pattern pairs
npm run check             # 1161 repository assertions
npm run docs -- --check   # fails if the generated finding list is stale
```

```
10 patterns checked, 6 of them invisible in Search Console, 0 failing.
1161 repository assertions, all passing.
```

The repository verifier is the one worth explaining, because it checks the claims
rather than the code. The numbers quoted in this README have to be the numbers the
repository produces. Every pattern directory has to be complete and has to declare
findings that exist. Every id `checkers.mjs` can emit has to be catalogued. The
generated document has to match the catalogue. Every test file has to be named in
the test script, because `node --test` did not accept glob patterns before Node 21
and a globbed script runs nothing on an older runtime while appearing to pass.

The test count is counted from the test sources, not parsed out of the runner's
output. Node 20 and 22 print TAP when their output is piped and Node 24 prints the
spec reporter regardless, so a verifier that reads the summary line passes on one
and fails on the other for no reason at all.

## Limits

[What the checkers cannot see](docs/what-the-checkers-cannot-see.md) is the
document to read before trusting a green run. The short version:

Every finding here comes from reading one artefact. None of these checkers is a
crawler, none of them fetches anything, and none of them sees the document a
search engine actually receives, which is the document after the server, the CDN,
the tag manager, the consent layer and the framework have each had a turn. A
canonical that is right in the template and rewritten on hydration is a different
canonical. A sitemap with no faults in it can list the wrong five thousand URLs.
Correctness of form says nothing about correctness of content.

That is why every `meta.json` carries a `manualCheck` as well as a rule, and why
`npm run check` fails if one is missing. The checker is the part that can run on
every commit. It is not the whole answer.

## Documents

| Document | What it covers |
|---|---|
| [Every finding, listed](docs/every-finding.md) | All 62 findings, which checker emits each, and which of them Search Console says nothing about. Generated. |
| [What the checkers cannot see](docs/what-the-checkers-cannot-see.md) | The limits, per checker, and the three that apply everywhere |
| [Search Console issue playbook](docs/search-console-playbook.md) | What each status means, which ones are confirmations rather than faults, which two are judgements rather than bugs, and what Search Console will never tell you |

## Scope

Crawling, indexing, canonicalisation, structured data, redirects, international
targeting, and the measurement those decisions are judged by. Not content
strategy, not keyword research, not link building.

The patterns are framework-free. They are plain HTML, XML and JSON so they can
be lifted into a theme, a static site generator, a Next.js app or a page builder
without translation. The tooling has two dependencies, `cheerio` and
`fast-xml-parser`, and the reasoning for keeping them is in the limits document:
hand-rolling an HTML parser is how a checker ends up confidently wrong about a
document a browser reads correctly.

## Related

- [core-web-vitals-checklist](https://github.com/BuildWithAbdullah/core-web-vitals-checklist) - the performance half of the same audit
- [site-audit-cli](https://github.com/BuildWithAbdullah/site-audit-cli) - runs the technical SEO checks against a live URL, alongside accessibility, performance and security
- [wcag-fix-library](https://github.com/BuildWithAbdullah/wcag-fix-library) - heading structure again, framed as the accessibility requirement it also is
- [wordpress-security-hardening](https://github.com/BuildWithAbdullah/wordpress-security-hardening) - including the bot protection rules that deindex sites by accident

## Licence

MIT. Use them, ship them, no attribution required.
