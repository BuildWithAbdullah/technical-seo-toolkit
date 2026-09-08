# A heading outline that describes the page

Headings are the only structural summary of a page that both search engines and
screen readers consume. They are also the element most often chosen for how big
it looks.

## The rules

**One h1, and it names the page.** Not the site, not the section, the page.

**Levels descend one rung at a time.** h2 to h4 is a gap in the outline. Going
back up any distance is fine; skipping down is not.

**No empty headings.** A heading with no text contributes a rung with no label,
usually left behind when a section was emptied in a CMS.

**Headings are not a font size.** A paragraph marked as a heading claims to
summarise the section beneath it. Search engines read it that way.

## The template version of this

The most common finding on template-built sites is not a bad outline, it is no
h1 at all. The theme reserves h1 for a hero block, the page does not use that
block, and every page on the site starts at h2. Nothing warns anybody, because
each page is individually consistent.

Check by crawling for pages with zero h1 elements. It is usually all of them or
none of them.

## Where this overlaps with accessibility

Entirely. The same outline is what a screen reader user navigates by, jumping
between headings to find a section. A broken hierarchy is a document with a
scrambled table of contents, and it fails WCAG 1.3.1 Info and Relationships at
Level A and 2.4.6 Headings and Labels at Level AA.

This is worth knowing because it changes the argument. Heading structure is
frequently deprioritised as an SEO nice-to-have; it is also a legal
accessibility requirement in every jurisdiction that has adopted WCAG. See
[wcag-fix-library](https://github.com/BuildWithAbdullah/wcag-fix-library) for
the accessibility framing of the same defect.

## The heuristic in the checker

The verifier flags headings longer than 160 characters as body copy. That is a
heuristic, not a rule, and it is documented as one: a long heading is not a
violation of anything. It is a reliable signal that a tag was chosen for its
size, and in practice it finds real instances more often than it misfires.

## How to test

Read the headings alone, in order, with everything else hidden. If that list
does not work as a table of contents for the page, the outline is wrong no
matter what any tool reports.
