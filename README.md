# Technical SEO toolkit

Crawlability, indexation, structured data and measurement, as patterns you can
run rather than advice you have to believe.

Every pattern in here is a pair of files: one that is broken in a specific,
ordinary way, and one that is fixed. A checker reads both. The broken one has
to produce exactly the findings its manifest declares, the fixed one has to
produce none, and CI fails if either stops being true. An SEO pattern library
that nobody runs is a list of opinions with syntax highlighting.

**Six of the eleven patterns produce no report in Search Console.** That is the
reason this repository exists. The crawlability faults that cost the most are
the ones where, from Google's side, nothing went wrong: the page was fetched,
the file parsed, the annotation was read and then discarded. There is no row in
any report for a signal that was valid and ignored, so the only way to find
these is to check the artefact yourself.

## What is in here

11 pattern pairs, each with a README explaining the fault, what it costs, and
what Search Console will and will not tell you about it.

| Pattern | Fault | Reported by Search Console |
|---|---|---|
| [`patterns/canonical-tags/`](patterns/canonical-tags/) | Canonicals that are duplicated, relative, empty or outside the head | Partly, and late |
| [`patterns/hreflang-clusters/`](patterns/hreflang-clusters/) | Clusters that are one-directional, do not name themselves, or use values Google cannot read | No |
| [`patterns/heading-outline/`](patterns/heading-outline/) | An outline that does not say what the page is | No |
| [`patterns/analytics-tag-hygiene/`](patterns/analytics-tag-hygiene/) | Double counting, dead property ids, configuration nothing receives | No |
| [`patterns/jsonld-parses/`](patterns/jsonld-parses/) | Structured data that is discarded before it is read | No |
| [`patterns/jsonld-entity-graph/`](patterns/jsonld-entity-graph/) | A graph that describes four organisations and means one | No |
| [`patterns/jsonld-breadcrumbs/`](patterns/jsonld-breadcrumbs/) | A trail that does not match the URL it is on | Yes |
| [`patterns/sitemap-contents/`](patterns/sitemap-contents/) | A sitemap whose per-URL hints are all ignored | Partly |
| [`patterns/sitemap-index-files/`](patterns/sitemap-index-files/) | An index whose children are never fetched, where each fault costs a whole file of URLs | Partly |
| [`patterns/robots-crawl-vs-index/`](patterns/robots-crawl-vs-index/) | Crawling and indexing confused for one control | Yes |
| [`patterns/redirect-maps/`](patterns/redirect-maps/) | Chains, loops and moves served as temporary | No |

Plus two documents generated from the code, so they cannot disagree with it:
[every finding, listed](docs/every-finding.md) and
[what the checkers cannot see](docs/what-the-checkers-cannot-see.md). And one
written by hand, because it is about what to do rather than about this code:
the [Search Console playbook](docs/search-console-playbook.md).

## One entry per reason, not one per check

There are 92 catalogued findings across ten checkers, and that number is larger
than the number of rules in the code on purpose.

A canonical that is absent, a canonical whose href is empty, and a canonical
that is relative are three different faults with three different causes and
three different fixes. While they shared one weak "canonical problem" entry,
the empty one was reported as clean, for the whole life of this repository, and
an unrendered template variable in a canonical is the single most common
canonical fault on a templated site.

Splitting the weak findings is where almost every fault in this code has been
found. The current pass split the sitemap checker's per-URL rules from its
index rules and discovered that a sitemap index was being checked for nothing
at all.

Each finding also declares the complete set of severities it can be emitted at,
and the test suite compares that against what the code produces in both
directions. The second direction is the one that does the work: a severity
declared in the catalogue that no test has ever produced fails the build, which
is what stops the severity column from becoming a description of what somebody
once intended.

## Limits

Everything these checkers cannot see is written down, and more to the point it
is asserted. There are 14 declared limits, each carrying two artefacts:

- a **blind** artefact the limit applies to, where the checker must stay quiet
  about the findings the limit names
- a **contrast** artefact, nearly identical, where the same checker must speak

The second half is the one people leave out, and without it a limit is
indistinguishable from a checker that simply does not work. Silence is evidence
of a blind spot only once the same code has been shown to fire.

Two of the limits do not produce silence at all. The checker reports that an
input it needed was absent and that one of its own rules was therefore not run,
and that refusal is catalogued as a finding like any other. The distinction
matters more than it sounds: a rule that quietly does nothing and a rule that
reports it did nothing look identical from the outside, and only one of them is
honest. Before the breadcrumb checker had that refusal, a page with no
canonical and no `og:url` skipped two of its seven rules in silence and was
reported clean.

Two more are worse than a blind spot: they manufacture a finding. There is no
browser here, so a canonical set by JavaScript is reported as a canonical that
does not exist, which is false of the page a crawler renders. That is written
out in the limits document rather than left for somebody to discover.

The full list is in [what the checkers cannot
see](docs/what-the-checkers-cannot-see.md), generated from the manifest the
tests assert.

## Verifying

```
npm install
npm test           # the unit suite
npm run verify     # every pattern pair, as data
npm run verdicts   # the same patterns through the real program, in both modes
npm run check      # the repository itself
npm run docs:check # the generated documents, which fail if they are stale
npm run thin       # the entry points, which fail if a decision moved into one
```

CI runs all seven on three exact Node versions, installs on the declared floor,
and separately requires that the declared floor refuses an install when it is
raised above the runtime. Installing at the floor passes whether or not
`--engine-strict` does anything, so on its own it proves nothing.

The suite is 219 tests. `npm run verify` checks eleven pattern pairs against
their manifests with set equality in both directions, so a failing example
cannot produce a finding nobody declared. `npm run verdicts` then runs the real
verifier as a program, twice per pattern, once in each of its two output modes,
and requires the two to agree on the findings and on the exit code.

`npm run check` makes 47 repository assertions. That number is much smaller
than the one this repository used to print, and it checks more. The previous
verifier made one assertion per file for several of its rules, so its total was
mostly a count of how many files the repository has: adding an unrelated
document moved it. A claim is now a named thing that is true or false about the
repository, and it stays one claim however many files it reads.
`test/repo.test.mjs` perturbs a copy of the tree in four ways that used to move
the old number, requires this one to stay still in all four, and requires the
claims themselves to still fail on the two perturbations that are genuinely
wrong. The consequence worth stating out loud: an assertion total from this
repository is not comparable with one from a repository that still counts per
file. Judge depth by the test count and the catalogue size.

## What this is not

It is not a crawler and it does not fetch anything. Every checker here is
handed a file and reads it, which is a deliberate trade: it means these run in
CI against artefacts you control, and it means a canonical pointing at a page
that was deleted last year is spelled correctly and comes back clean.

It is not a vocabulary validator either. The structured data checkers ask
whether the graph is coherent, never whether a property exists on a type. The
validator at schema.org answers that question and this does not.

And none of it is client work. Every artefact in here is a pattern, written
against hostnames reserved for documentation, generalised from the shape of a
fault rather than copied from anybody's site.

## Licence

MIT. No attribution required. Take the checkers, take the patterns, put them in
your own pipeline.
