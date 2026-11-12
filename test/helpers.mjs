/**
 * helpers.mjs
 *
 * Small shared pieces. Nothing here makes an assertion; the point is that a
 * test file reads as the artefact and the expected findings, with no scaffolding
 * in between.
 */

import { checkers } from '../tools/checkers.mjs';

/** The ids a checker produces for a body, sorted so assertions are stable. */
export const run = (kind, body) => checkers[kind](body, `${kind}.fixture`).map((p) => p.id).sort();

/** The full findings, when the message is the thing under test. */
export const runFull = (kind, body) => checkers[kind](body, `${kind}.fixture`);

/** A minimal document. Nothing is in the head or the body that was not asked for. */
export const page = (head = '', body = '') =>
  `<!doctype html><html lang="en"><head><title>Example</title>${head}</head><body>${body}</body></html>`;

/** A JSON-LD script element. */
export const ld = (json) => `<script type="application/ld+json">${json}</script>`;

/** A sitemap wrapper, with the namespace a real file carries. */
export const sitemap = (inner) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${inner}\n</urlset>`;

export const url = (loc, extra = '<lastmod>2026-01-15</lastmod>') => `<url><loc>${loc}</loc>${extra}</url>`;

/** A cluster manifest from a list of [url, [[code, href], ...]] pairs. */
export const cluster = (pages) =>
  JSON.stringify({
    pages: pages.map(([pageUrl, alternates]) => ({
      url: pageUrl,
      alternates: alternates.map(([hreflang, href]) => ({ hreflang, href })),
    })),
  });

/** A reciprocal, self-referencing two-language cluster. The control case. */
export const validCluster = (codeA = 'en', codeB = 'de') =>
  cluster([
    ['https://example.com/a/', [[codeA, 'https://example.com/a/'], [codeB, 'https://example.com/b/']]],
    ['https://example.com/b/', [[codeB, 'https://example.com/b/'], [codeA, 'https://example.com/a/']]],
  ]);

/**
 * The same control cluster with an x-default, for use when every value in it
 * names a region.
 *
 * A cluster where every alternate carries a region and none is x-default has
 * no answer for a visitor from a country it did not name, which is its own
 * finding. So a test about whether a value shape is accepted has to declare an
 * x-default, or it ends up asserting two things and reading as though it
 * asserts one.
 */
export const regionalCluster = (codeA, codeB) =>
  cluster([
    ['https://example.com/a/', [[codeA, 'https://example.com/a/'], [codeB, 'https://example.com/b/'], ['x-default', 'https://example.com/a/']]],
    ['https://example.com/b/', [[codeB, 'https://example.com/b/'], [codeA, 'https://example.com/a/'], ['x-default', 'https://example.com/a/']]],
  ]);
