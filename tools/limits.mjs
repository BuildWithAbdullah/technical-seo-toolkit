/**
 * limits.mjs
 *
 * What the checkers in this repository cannot see, declared as data so that it
 * can be asserted rather than described.
 *
 * Why this file exists rather than a paragraph in a document
 * ----------------------------------------------------------
 * A sentence saying a checker cannot see something still reads correctly after
 * the checker learns to see it. The document goes on being reassuring and is
 * now wrong, and a reader who trusts it is worse off than one who had nothing.
 * So each limit below carries two artefacts:
 *
 *   blind     an artefact the limit applies to. The ids the checker must not
 *             emit for it are named in `absent`. If a checker starts seeing
 *             one of them, this entry fails and has to be rewritten or
 *             removed, which is the point.
 *
 *   contrast  a nearly identical artefact where the same checker does fire,
 *             naming the id in `contrastExpect`. Without this half, a limit is
 *             indistinguishable from a checker that is simply broken: silence
 *             proves a blind spot only once the same code has been shown to
 *             speak.
 *
 * Both halves are asserted, in both directions, by test/limits.test.mjs.
 *
 * The refusal case
 * ----------------
 * Some blind cases legitimately produce a finding, and that finding is the
 * checker declining to decide. `breadcrumb-page-url-unknown` is the breadcrumb
 * checker saying it was given no page URL and therefore did not run two of its
 * rules. That is the limit holding rather than breaking, so those entries name
 * the refusal in `refusal` and still forbid the ids in `absent`. Without the
 * distinction, an honest refusal reads as the limit having been fixed.
 *
 * docs/what-the-checkers-cannot-see.md is generated from this file by
 * tools/limits-doc.mjs, and CI fails if the document is stale.
 */

const page = (head = '', body = '') =>
  `<!doctype html><html lang="en"><head><title>Example</title>${head}</head><body>${body}</body></html>`;
const ld = (json) => `<script type="application/ld+json">${json}</script>`;
const urlset = (inner) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${inner}</urlset>`;
const entry = (loc) => `<url><loc>${loc}</loc><lastmod>2026-01-15</lastmod></url>`;

export const limits = [
  {
    id: 'no-network',
    kind: 'canonical',
    title: 'Nothing here fetches a URL',
    what:
      'Every checker reads a file it was handed. None of them makes a request, so none can tell you whether the URL a canonical names returns 200, whether a redirect target exists, or whether a sitemap entry is reachable. A canonical pointing at a page that was deleted last year is spelled correctly and is reported clean.',
    blind: page('<link rel="canonical" href="https://example.com/a-page-that-no-longer-exists/">'),
    absent: ['canonical-'],
    contrast: page('<link rel="canonical" href="http://example.com/a/">'),
    contrastExpect: 'canonical-non-https',
  },
  {
    id: 'no-rendering',
    kind: 'canonical',
    title: 'The HTML is read as served, not as rendered',
    what:
      'There is no browser here. A canonical, a heading or a JSON-LD block that JavaScript adds after load is invisible to these checkers, and one that JavaScript removes is still counted. This limit does not only hide faults, it manufactures them: the blind artefact below sets its canonical from a script, and the checker reports the page as having no canonical at all, which is false of the page a crawler renders.',
    blind: page('<script>document.head.insertAdjacentHTML("beforeend", String.fromCharCode(60) + "link rel=canonical href=https://example.com/a/>")</script>'),
    absent: [],
    expectWrongly: 'canonical-missing',
    contrast: page('<link rel="canonical" href="https://example.com/a/">'),
    contrastExpect: null,
  },
  {
    id: 'robots-query-string',
    kind: 'robots',
    title: 'A robots.txt rule is matched against the path and not the query string',
    what:
      'Google matches a Disallow against the path and the query string together, so Disallow: /*?sort= blocks a faceted URL. The matcher here is given a path only, because the asset and page lists in a manifest are normally pasted from a browser network panel and the query is dropped on the way in. A rule that does its work in the query string therefore looks like a rule that matches nothing.',
    blind: JSON.stringify({
      robotsTxt: 'User-agent: *\nDisallow: /*?sort=\nSitemap: https://example.com/sitemap.xml',
      renderAssets: ['https://example.com/catalogue/?sort=price'],
    }),
    absent: ['robots-blocks-'],
    contrast: JSON.stringify({
      robotsTxt: 'User-agent: *\nDisallow: /catalogue/\nSitemap: https://example.com/sitemap.xml',
      renderAssets: ['https://example.com/catalogue/theme.css'],
    }),
    contrastExpect: 'robots-blocks-render-assets',
  },
  {
    id: 'robots-other-agents',
    kind: 'robots',
    title: 'Only the wildcard group and Googlebot groups are evaluated',
    what:
      'The precedence rules implemented here are the ones Google documents, so the only groups read are User-agent: * and any group naming Googlebot. A group aimed at another crawler is parsed and then ignored. If the fault you are chasing is that one crawler has been locked out, this will not find it.',
    blind: JSON.stringify({
      robotsTxt: 'User-agent: bingbot\nDisallow: /assets/\nUser-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml',
      renderAssets: ['https://example.com/assets/theme.css'],
    }),
    absent: ['robots-blocks-'],
    contrast: JSON.stringify({
      robotsTxt: 'User-agent: *\nDisallow: /assets/\nSitemap: https://example.com/sitemap.xml',
      renderAssets: ['https://example.com/assets/theme.css'],
    }),
    contrastExpect: 'robots-blocks-render-assets',
  },
  {
    id: 'sitemap-byte-size',
    kind: 'sitemap',
    title: 'The fifty megabyte limit is not checked, only the fifty thousand URL limit',
    what:
      'The protocol caps a sitemap at 50,000 URLs and at 50MB uncompressed, and a file can break the second without approaching the first. The entry count is checked here and the byte size is not, because size is a property of the file as served and this checker is handed a string with no claim about its encoding or whether it was gzipped. No finding in the catalogue mentions size at all.',
    blind: urlset(Array.from({ length: 40 }, (_, i) => entry(`https://example.com/${'segment/'.repeat(30)}${i}`)).join('')),
    absent: ['sitemap-too-many', 'sitemap-size'],
    contrast: urlset(Array.from({ length: 50001 }, (_, i) => entry(`https://example.com/p/${i}`)).join('')),
    contrastExpect: 'sitemap-too-many-urls',
  },
  {
    id: 'jsonld-only-json-ld',
    kind: 'jsonld-syntax',
    title: 'Only JSON-LD is read, so microdata and RDFa look like no structured data at all',
    what:
      'The checkers find structured data by looking for script elements of type application/ld+json. Microdata written with itemscope and itemprop, and RDFa written with typeof and property, are both valid, both read by Google, and both invisible here. This is the second limit that manufactures a finding rather than hiding one: the blind artefact below carries a complete Organization in microdata and is reported as carrying no JSON-LD, which is true and reads as a page with no structured data.',
    blind: page('', '<div itemscope itemtype="https://schema.org/Organization"><span itemprop="name">Acme</span><a itemprop="url" href="https://example.com/">Acme</a></div>'),
    absent: [],
    expectWrongly: 'jsonld-none',
    contrast: page(ld(JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', '@id': 'https://example.com/#org', name: 'Acme' }))),
    contrastExpect: null,
  },
  {
    id: 'jsonld-vocabulary',
    kind: 'jsonld-graph',
    title: 'The graph is checked for shape, never for vocabulary',
    what:
      'These checkers ask whether the graph is coherent: whether entities carry identities, whether references resolve, whether anything is restated. They never ask whether a property exists on a type, whether a value is the right datatype, or whether the properties a rich result requires are present. A node with a misspelled property name is structurally perfect and is reported clean. The validator at schema.org answers the vocabulary question and this does not.',
    blind: page(ld(JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': 'https://example.com/#org',
      nmae: 'Acme',
      favouriteColour: 'blue',
    }))),
    absent: ['jsonld-'],
    contrast: page(ld(JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Acme',
    }))),
    contrastExpect: 'jsonld-entity-without-id',
  },
  {
    id: 'hreflang-transport',
    kind: 'hreflang',
    title: 'The cluster manifest says nothing about where the annotations are published',
    what:
      'Reciprocity can only be judged with every page of the cluster in view, which is why the input here is a manifest rather than a page. The cost is that the manifest does not record how each annotation reaches Google. A cluster that is perfectly reciprocal in this file and declared somewhere Google does not read it, such as a sitemap that was never submitted, is reported clean.',
    blind: JSON.stringify({
      pages: [
        { url: 'https://example.com/a/', alternates: [{ hreflang: 'en', href: 'https://example.com/a/' }, { hreflang: 'de', href: 'https://example.com/b/' }] },
        { url: 'https://example.com/b/', alternates: [{ hreflang: 'de', href: 'https://example.com/b/' }, { hreflang: 'en', href: 'https://example.com/a/' }] },
      ],
    }),
    absent: ['hreflang-'],
    contrast: JSON.stringify({
      pages: [
        { url: 'https://example.com/a/', alternates: [{ hreflang: 'en', href: 'https://example.com/a/' }, { hreflang: 'de', href: 'https://example.com/b/' }] },
        { url: 'https://example.com/b/', alternates: [{ hreflang: 'de', href: 'https://example.com/b/' }] },
      ],
    }),
    contrastExpect: 'hreflang-not-reciprocal',
  },
  {
    id: 'redirect-target-existence',
    kind: 'redirects',
    title: 'A redirect target outside the map is assumed to be the end of the chain',
    what:
      'Chains and loops are found by following targets back into the map. A target that is not a source in the map is treated as a final destination, because there is nothing else to treat it as. If that URL 404s, or redirects again at a layer the map does not describe, such as a CDN rule or a trailing slash normaliser, the chain is longer than this says and may not terminate at all.',
    blind: JSON.stringify({ redirects: [{ from: '/old/', to: '/a-target-that-404s/', status: 301 }] }),
    absent: ['redirect-'],
    contrast: JSON.stringify({ redirects: [{ from: '/old/', to: '/middle/', status: 301 }, { from: '/middle/', to: '/new/', status: 301 }] }),
    contrastExpect: 'redirect-chain',
  },
  {
    id: 'heading-visibility',
    kind: 'headings',
    title: 'The outline is read from the source order and counts headings nobody sees',
    what:
      'Headings are collected in document order and judged on their text, their label and their image alt text. Whether a heading is visible is a question about CSS, and there is no CSS engine here. The blind artefact below has an h1 that is hidden, so neither a reader nor a rendered crawl finds anything stating what the page is, and this checker reports the h1 as present.',
    blind: page('', '<h1 hidden>Pricing</h1><h2>Plans</h2>'),
    absent: ['heading-no-h1'],
    contrast: page('', '<h2>Plans</h2>'),
    contrastExpect: 'heading-no-h1',
  },
  {
    id: 'canonical-one-page-at-a-time',
    kind: 'canonical',
    title: 'A canonical is judged against the page it sits on and nothing else',
    what:
      'A canonical chain, where A names B and B names C, is the most common serious canonical fault and it cannot be seen from one document. Nor can a canonical pointing at a page that is noindex, which asks Google to consolidate signals onto a page that is asking to be dropped. Both need the target page, and this checker is handed one file.',
    blind: page('<link rel="canonical" href="https://example.com/b/">'),
    absent: ['canonical-'],
    contrast: page('<link rel="canonical" href="https://example.com/a/"><link rel="canonical" href="https://example.com/b/">'),
    contrastExpect: 'canonical-multiple',
  },
  {
    id: 'analytics-container-contents',
    kind: 'analytics',
    title: 'What a tag container fires is not in the page',
    what:
      'A tag container is one script element in the markup and a list of tags on Google servers. A container that fires two GA4 properties and a container that fires nothing at all are byte identical in the page. Every analytics finding here is about what the markup declares, so a page whose double counting happens inside the container is reported clean.',
    blind: page('<script async src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC1234"></script>'),
    absent: ['analytics-multiple', 'analytics-duplicate'],
    contrast: page('<script async src="https://www.googletagmanager.com/gtag/js?id=G-AAAAAA1111"></script><script>gtag("config","G-AAAAAA1111");gtag("config","G-BBBBBB2222")</script>'),
    contrastExpect: 'analytics-multiple-ga4-properties',
  },
  {
    id: 'breadcrumb-page-url',
    kind: 'jsonld-breadcrumb',
    title: 'Two breadcrumb rules need the URL of the page and say so when they do not have it',
    what:
      'Whether the trail ends on the page it is on, and whether its length matches the depth of the URL, are both questions about the page URL. The page states it in og:url or in its canonical. When it states neither, those two rules cannot run, and the checker emits breadcrumb-page-url-unknown rather than passing in silence. That refusal is the limit holding: before it existed, a page with no canonical skipped both rules and was reported clean.',
    blind: page('', '') .replace('</head>', `${ld(JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: 'https://example.com/' }],
    }))}</head>`),
    absent: ['breadcrumb-last-item-not-this-page', 'breadcrumb-depth-mismatch'],
    refusal: 'breadcrumb-page-url-unknown',
    contrast: page('<link rel="canonical" href="https://example.com/a/b/">', '')
      .replace('</head>', `${ld(JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: 'https://example.com/' }],
      }))}</head>`),
    contrastExpect: 'breadcrumb-depth-mismatch',
  },
  {
    id: 'redirect-status',
    kind: 'redirects',
    title: 'Whether a move is permanent is a question about the status, and a map need not record one',
    what:
      'A redirect map exported from a server configuration or a spreadsheet often carries only the two URLs. Without a status there is no answer to whether the move is permanent, so the checker emits redirect-status-missing instead of guessing. It used to guess: a rule with no status was reported as a temporary redirect, with the word undefined where the status code belonged, which is a verdict delivered on no evidence.',
    blind: JSON.stringify({ redirects: [{ from: '/old/', to: '/new/' }] }),
    absent: ['redirect-temporary-for-permanent-move'],
    refusal: 'redirect-status-missing',
    contrast: JSON.stringify({ redirects: [{ from: '/old/', to: '/new/', status: 302 }] }),
    contrastExpect: 'redirect-temporary-for-permanent-move',
  },
];

export const limitIds = limits.map((l) => l.id);
