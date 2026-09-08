# hreflang clusters that are reciprocal and self-referencing

hreflang is not a per-page annotation. It is a claim about a set, and it is only
valid if the whole set agrees. This is why it is usually broken: it is
implemented one template at a time, and no single page shows the fault.

## The rules

**Reciprocity.** If A lists B, B must list A. A one-directional link is ignored
entirely, not partially. This is the rule that breaks, because a page added
later gets its alternates and the existing pages are not updated to point back.

**Self-reference.** Every page lists itself. A cluster where no page names
itself is not a cluster.

**Absolute URLs.** No base to resolve against, same as structured data.

**Language first.** `hreflang="uk"` is Ukrainian, not the United Kingdom. The
value is a language code, optionally followed by a region: `en-GB`. A bare
region code is invalid. Getting this backwards sends British visitors to a
Ukrainian page, which is a memorable way to find out.

**x-default.** Names the page served to everyone the cluster does not cover.
Optional, and the absence of it is a decision worth making rather than an
omission.

## Why the example here is a cluster file

The fail and pass examples are JSON manifests listing every page in the group
and what each declares, not single HTML documents. That is deliberate: the rule
that matters cannot be checked on one page, and a checker that only looked at
one page would pass a completely broken cluster. The markup each entry
corresponds to is one line:

```html
<link rel="alternate" hreflang="de" href="https://www.example.com/de/produkte/x">
```

## Nothing will tell you it is broken

Search Console's International Targeting report was retired. There is no report
for this. The symptom is the wrong country's page ranking in the wrong market,
which reads as a content problem and gets handed to whoever writes the content.

## How to test

Take one URL per language, fetch all of them, extract every `hreflang` link, and
check the set closes: every page lists every other page and itself, with
matching URLs on both sides. The verifier in this repository does exactly that
against the manifest, which is the same check you would run against a crawl.
