/**
 * cases.mjs
 *
 * One artefact per finding, small enough to read in full, written so that the
 * fault is the only interesting thing in it.
 *
 * These are shared by test/catalogue.test.mjs, which uses them to prove that
 * every catalogued finding is reachable and that no checker emits anything
 * uncatalogued, and by the per-kind test files, which make the tighter
 * assertions about exactly what a given artefact should and should not produce.
 *
 * A case declares the ids it must produce. It is allowed to produce others:
 * several of these faults genuinely travel together, and forcing every artefact
 * to isolate one id would mean writing artefacts no real site resembles. Where
 * an exact set matters, the per-kind file asserts it.
 */

const page = (head, body = '') =>
  `<!doctype html><html lang="en"><head><title>Example</title>${head}</head><body>${body}</body></html>`;

const ld = (json) => `<script type="application/ld+json">${json}</script>`;

const sitemapFile = (inner) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${inner}\n</urlset>`;

const entry = (loc, extra = '<lastmod>2026-01-15</lastmod>') => `  <url><loc>${loc}</loc>${extra}</url>`;

const CLEAN_ENTRY = entry('https://example.com/a');

// Fifty thousand and one URLs, built rather than stored. Every one of them is
// otherwise clean, so the only finding the file can produce is the count.
const oversizedSitemap = () => {
  const rows = [];
  for (let i = 0; i < 50001; i++) {
    rows.push(entry(`https://example.com/p/${i}`));
  }
  return sitemapFile(rows.join('\n'));
};

export const cases = [
  // ------------------------------------------------------------- canonical
  {
    kind: 'canonical',
    label: 'no canonical anywhere',
    body: page(''),
    expect: ['canonical-missing'],
  },
  {
    kind: 'canonical',
    label: 'two canonicals in one head',
    body: page('<link rel="canonical" href="https://example.com/a"><link rel="canonical" href="https://example.com/b">'),
    expect: ['canonical-multiple'],
  },
  {
    kind: 'canonical',
    label: 'canonical in the body',
    body: page('', '<p>Copy</p><link rel="canonical" href="https://example.com/a">'),
    expect: ['canonical-outside-head'],
  },
  {
    kind: 'canonical',
    label: 'relative canonical',
    body: page('<link rel="canonical" href="/a">'),
    expect: ['canonical-relative'],
  },
  {
    kind: 'canonical',
    label: 'canonical names an http URL',
    body: page('<link rel="canonical" href="http://example.com/a">'),
    expect: ['canonical-non-https'],
  },
  {
    kind: 'canonical',
    label: 'canonical carries campaign parameters',
    body: page('<link rel="canonical" href="https://example.com/a?utm_source=newsletter">'),
    expect: ['canonical-tracking-params'],
  },
  {
    kind: 'canonical',
    label: 'og:url disagrees with the canonical',
    body: page('<link rel="canonical" href="https://example.com/a"><meta property="og:url" content="https://example.com/b">'),
    expect: ['canonical-og-url-mismatch'],
  },

  // -------------------------------------------------------------- hreflang
  {
    kind: 'hreflang',
    label: 'a page omits itself from its own alternates',
    body: JSON.stringify({
      pages: [
        { url: 'https://example.com/en/', alternates: [{ hreflang: 'de', href: 'https://example.com/de/' }] },
        {
          url: 'https://example.com/de/',
          alternates: [
            { hreflang: 'de', href: 'https://example.com/de/' },
            { hreflang: 'en', href: 'https://example.com/en/' },
          ],
        },
      ],
    }),
    expect: ['hreflang-missing-self'],
  },
  {
    kind: 'hreflang',
    label: 'one page points at another that does not point back',
    body: JSON.stringify({
      pages: [
        {
          url: 'https://example.com/en/',
          alternates: [
            { hreflang: 'en', href: 'https://example.com/en/' },
            { hreflang: 'de', href: 'https://example.com/de/' },
          ],
        },
        { url: 'https://example.com/de/', alternates: [{ hreflang: 'de', href: 'https://example.com/de/' }] },
      ],
    }),
    expect: ['hreflang-not-reciprocal'],
  },
  {
    kind: 'hreflang',
    label: 'a country code used where a language belongs',
    body: JSON.stringify({
      pages: [
        {
          url: 'https://example.com/gb/',
          alternates: [
            { hreflang: 'en', href: 'https://example.com/gb/' },
            { hreflang: 'GB', href: 'https://example.com/gb/' },
          ],
        },
      ],
    }),
    expect: ['hreflang-invalid-code'],
  },
  {
    kind: 'hreflang',
    label: 'a relative alternate href',
    body: JSON.stringify({
      pages: [
        {
          url: 'https://example.com/en/',
          alternates: [
            { hreflang: 'en', href: 'https://example.com/en/' },
            { hreflang: 'de', href: '/de/' },
          ],
        },
      ],
    }),
    expect: ['hreflang-relative'],
  },
  {
    kind: 'hreflang',
    label: 'one hreflang value mapped to two URLs',
    body: JSON.stringify({
      pages: [
        {
          url: 'https://example.com/en/',
          alternates: [
            { hreflang: 'en', href: 'https://example.com/en/' },
            { hreflang: 'en', href: 'https://example.com/en-gb/' },
          ],
        },
        {
          url: 'https://example.com/en-gb/',
          alternates: [
            { hreflang: 'en-GB', href: 'https://example.com/en-gb/' },
            { hreflang: 'en', href: 'https://example.com/en/' },
          ],
        },
      ],
    }),
    expect: ['hreflang-duplicate-code'],
  },
  {
    kind: 'hreflang',
    label: 'an alternate that is not in the cluster',
    body: JSON.stringify({
      pages: [
        {
          url: 'https://example.com/en/',
          alternates: [
            { hreflang: 'en', href: 'https://example.com/en/' },
            { hreflang: 'fr', href: 'https://example.com/fr/' },
          ],
        },
      ],
    }),
    expect: ['hreflang-dangling-target'],
  },

  // -------------------------------------------------------------- headings
  {
    kind: 'headings',
    label: 'no h1',
    body: page('', '<h2>Section</h2><h3>Detail</h3>'),
    expect: ['heading-no-h1'],
  },
  {
    kind: 'headings',
    label: 'two h1 elements',
    body: page('', '<h1>One</h1><h1>Two</h1>'),
    expect: ['heading-multiple-h1'],
  },
  {
    kind: 'headings',
    label: 'a skipped level',
    body: page('', '<h1>Title</h1><h3>Detail</h3>'),
    expect: ['heading-skipped-level'],
  },
  {
    kind: 'headings',
    label: 'an empty heading',
    body: page('', '<h1>Title</h1><h2></h2>'),
    expect: ['heading-empty'],
  },
  {
    kind: 'headings',
    label: 'a paragraph marked up as a heading',
    body: page('', `<h1>Title</h1><h2>${'Body copy that runs on and on because the author wanted this size. '.repeat(4)}</h2>`),
    expect: ['heading-used-for-styling'],
  },

  // ------------------------------------------------------------- analytics
  {
    kind: 'analytics',
    label: 'a Universal Analytics id still on the page',
    body: page('<script>ga("create","UA-123456-1","auto");</script>'),
    expect: ['analytics-legacy-ua'],
  },
  {
    kind: 'analytics',
    label: 'two GA4 properties on one page view',
    body: page('<script src="https://www.googletagmanager.com/gtag/js?id=G-AAAAAA111"></script><script>gtag("config","G-AAAAAA111");gtag("config","G-BBBBBB222");</script>'),
    expect: ['analytics-multiple-ga4-properties'],
  },
  {
    kind: 'analytics',
    label: 'two tag containers on one page',
    body: page('<script>/* GTM-AAAA111 */</script><script>/* GTM-BBBB222 */</script>'),
    expect: ['analytics-multiple-gtm-containers'],
  },
  {
    kind: 'analytics',
    label: 'the same gtag config running twice',
    body: page('<script>gtag("config","G-AAAAAA111");</script><script>gtag("config","G-AAAAAA111");</script>'),
    expect: ['analytics-duplicate-config'],
  },

  // --------------------------------------------------- structured data: syntax
  {
    kind: 'jsonld-syntax',
    label: 'no structured data at all',
    body: page(''),
    expect: ['jsonld-none'],
  },
  {
    kind: 'jsonld-syntax',
    label: 'a block that rendered empty',
    body: page(ld('')),
    expect: ['jsonld-empty-block'],
  },
  {
    kind: 'jsonld-syntax',
    label: 'a truncated block',
    body: page(ld('{"@context":"https://schema.org","@type":"WebPage","name":')),
    expect: ['jsonld-unparseable'],
  },
  {
    kind: 'jsonld-syntax',
    label: 'a block that was HTML escaped on the way in',
    body: page(ld('{"@context":"https://schema.org","@type":"WebPage","name":"Acme &quot;Holdings&quot;"}')),
    expect: ['jsonld-html-escaped'],
  },
  {
    kind: 'jsonld-syntax',
    label: 'the same named entity declared twice',
    body: page(
      ld('{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Acme"},{"@type":"Organization","name":"Acme"}]}')
    ),
    expect: ['jsonld-duplicate-entity'],
  },

  // ---------------------------------------------------- structured data: graph
  {
    kind: 'jsonld-graph',
    label: 'an entity with no @id',
    body: page(ld('{"@context":"https://schema.org","@type":"Organization","name":"Acme"}')),
    expect: ['jsonld-entity-without-id'],
  },
  {
    kind: 'jsonld-graph',
    label: 'two nodes sharing one @id',
    body: page(
      ld('{"@context":"https://schema.org","@graph":[{"@type":"Organization","@id":"https://example.com/#org","name":"Acme"},{"@type":"Organization","@id":"https://example.com/#org","name":"Acme Group"}]}')
    ),
    expect: ['jsonld-duplicate-id'],
  },
  {
    kind: 'jsonld-graph',
    label: 'an entity restated inside another node',
    body: page(
      ld('{"@context":"https://schema.org","@type":"WebPage","@id":"https://example.com/a#page","publisher":{"@type":"Organization","name":"Acme","url":"https://example.com/"}}')
    ),
    expect: ['jsonld-inlined-entity'],
  },
  {
    kind: 'jsonld-graph',
    label: 'a reference to an @id nothing defines',
    body: page(
      ld('{"@context":"https://schema.org","@type":"WebPage","@id":"https://example.com/a#page","publisher":{"@id":"https://example.com/#org"}}')
    ),
    expect: ['jsonld-dangling-reference'],
  },

  // ----------------------------------------------- structured data: breadcrumbs
  {
    kind: 'jsonld-breadcrumb',
    label: 'no breadcrumb trail',
    body: page('<meta property="og:url" content="https://example.com/b">'),
    expect: ['breadcrumb-missing'],
  },
  {
    kind: 'jsonld-breadcrumb',
    label: 'positions that are not 1 to n',
    body: page(
      '<meta property="og:url" content="https://example.com/b">' +
        ld('{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"position":1,"name":"Home","item":"https://example.com/"},{"position":3,"name":"B","item":"https://example.com/b"}]}')
    ),
    expect: ['breadcrumb-position-not-sequential'],
  },
  {
    kind: 'jsonld-breadcrumb',
    label: 'a trail item with no name',
    body: page(
      '<meta property="og:url" content="https://example.com/b">' +
        ld('{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"position":1,"item":"https://example.com/"},{"position":2,"name":"B","item":"https://example.com/b"}]}')
    ),
    expect: ['breadcrumb-missing-name'],
  },
  {
    kind: 'jsonld-breadcrumb',
    label: 'a non-final trail item with no URL',
    body: page(
      '<meta property="og:url" content="https://example.com/b">' +
        ld('{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"position":1,"name":"Home"},{"position":2,"name":"B","item":"https://example.com/b"}]}')
    ),
    expect: ['breadcrumb-missing-item-url'],
  },
  {
    kind: 'jsonld-breadcrumb',
    label: 'a relative trail URL',
    body: page(
      '<meta property="og:url" content="https://example.com/b">' +
        ld('{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"position":1,"name":"Home","item":"/"},{"position":2,"name":"B","item":"https://example.com/b"}]}')
    ),
    expect: ['breadcrumb-relative-url'],
  },
  {
    kind: 'jsonld-breadcrumb',
    label: 'a trail that ends somewhere other than this page',
    body: page(
      '<meta property="og:url" content="https://example.com/b">' +
        ld('{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"position":1,"name":"Home","item":"https://example.com/"},{"position":2,"name":"C","item":"https://example.com/c"}]}')
    ),
    expect: ['breadcrumb-last-item-not-this-page'],
  },
  {
    kind: 'jsonld-breadcrumb',
    label: 'a trail shorter than the URL it describes',
    body: page(
      '<meta property="og:url" content="https://example.com/a/b/c">' +
        ld('{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"position":1,"name":"Home","item":"https://example.com/"},{"position":2,"name":"C","item":"https://example.com/a/b/c"}]}')
    ),
    expect: ['breadcrumb-depth-mismatch'],
  },

  // --------------------------------------------------------------- sitemap
  {
    kind: 'sitemap',
    label: 'a file that is not well-formed XML',
    body: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset><url><loc>https://example.com/a</loc></urlset>`,
    expect: ['sitemap-not-well-formed'],
  },
  {
    kind: 'sitemap',
    label: 'a root element that is neither urlset nor sitemapindex',
    body: `<?xml version="1.0" encoding="UTF-8"?>\n<pages><url><loc>https://example.com/a</loc></url></pages>`,
    expect: ['sitemap-no-urlset'],
  },
  {
    kind: 'sitemap',
    label: 'more URLs than the protocol allows in one file',
    body: oversizedSitemap(),
    expect: ['sitemap-too-many-urls'],
  },
  {
    kind: 'sitemap',
    label: 'a relative loc',
    body: sitemapFile(entry('/a')),
    expect: ['sitemap-loc-relative'],
  },
  {
    kind: 'sitemap',
    label: 'an http loc',
    body: sitemapFile(entry('http://example.com/a')),
    expect: ['sitemap-loc-non-https'],
  },
  {
    kind: 'sitemap',
    label: 'the same URL listed twice',
    body: sitemapFile([CLEAN_ENTRY, CLEAN_ENTRY].join('\n')),
    expect: ['sitemap-duplicate-loc'],
  },
  {
    kind: 'sitemap',
    label: 'a URL with no lastmod',
    body: sitemapFile(entry('https://example.com/a', '')),
    expect: ['sitemap-lastmod-missing'],
  },
  {
    kind: 'sitemap',
    label: 'a lastmod that is a date nobody can parse',
    body: sitemapFile(entry('https://example.com/a', '<lastmod>15/01/2026</lastmod>')),
    expect: ['sitemap-lastmod-invalid'],
  },
  {
    kind: 'sitemap',
    label: 'a lastmod in the future',
    body: sitemapFile(entry('https://example.com/a', '<lastmod>2099-01-01</lastmod>')),
    expect: ['sitemap-lastmod-future'],
  },
  {
    kind: 'sitemap',
    label: 'priority and changefreq, both of which are ignored',
    body: sitemapFile(entry('https://example.com/a', '<lastmod>2026-01-15</lastmod><priority>0.8</priority><changefreq>daily</changefreq>')),
    expect: ['sitemap-priority-or-changefreq'],
  },

  // ---------------------------------------------------------------- robots
  {
    kind: 'robots',
    label: 'rules written for one named crawler only',
    body: JSON.stringify({
      robotsTxt: 'User-agent: Googlebot\nDisallow: /tmp/\nSitemap: https://example.com/sitemap.xml',
    }),
    expect: ['robots-no-wildcard-group'],
  },
  {
    kind: 'robots',
    label: 'no Sitemap line',
    body: JSON.stringify({ robotsTxt: 'User-agent: *\nDisallow: /tmp/' }),
    expect: ['robots-no-sitemap'],
  },
  {
    kind: 'robots',
    label: 'a relative Sitemap line',
    body: JSON.stringify({ robotsTxt: 'User-agent: *\nDisallow: /tmp/\nSitemap: /sitemap.xml' }),
    expect: ['robots-sitemap-relative'],
  },
  {
    kind: 'robots',
    label: 'robots.txt disallowing the sitemap it declares',
    body: JSON.stringify({
      robotsTxt: 'User-agent: *\nDisallow: /seo/\nSitemap: https://example.com/seo/sitemap.xml',
    }),
    expect: ['robots-blocks-own-sitemap'],
  },
  {
    kind: 'robots',
    label: 'a disallowed URL carrying noindex',
    body: JSON.stringify({
      robotsTxt: 'User-agent: *\nDisallow: /search\nSitemap: https://example.com/sitemap.xml',
      pages: [{ url: 'https://example.com/search?q=a', robots: 'noindex, follow' }],
    }),
    expect: ['robots-disallow-hides-noindex'],
  },
  {
    kind: 'robots',
    label: 'a disallowed URL submitted in the sitemap',
    body: JSON.stringify({
      robotsTxt: 'User-agent: *\nDisallow: /archive/\nSitemap: https://example.com/sitemap.xml',
      pages: [{ url: 'https://example.com/archive/2019/', inSitemap: true }],
    }),
    expect: ['robots-disallow-contradicts-sitemap'],
  },
  {
    kind: 'robots',
    label: 'a disallowed URL whose canonical can never be read',
    body: JSON.stringify({
      robotsTxt: 'User-agent: *\nDisallow: /print/\nSitemap: https://example.com/sitemap.xml',
      pages: [{ url: 'https://example.com/print/guide', canonicalTarget: 'https://example.com/guide' }],
    }),
    expect: ['robots-disallow-hides-canonical'],
  },
  {
    kind: 'robots',
    label: 'a render asset listed the way a network panel gives it',
    body: JSON.stringify({
      robotsTxt: 'User-agent: *\nDisallow: /assets/\nSitemap: https://example.com/sitemap.xml',
      renderAssets: ['https://example.com/assets/app.js'],
    }),
    expect: ['robots-blocks-render-assets'],
  },

  // ------------------------------------------------------------- redirects
  {
    kind: 'redirects',
    label: 'one source mapped twice',
    body: JSON.stringify({
      redirects: [
        { from: '/a', to: '/b', status: 301 },
        { from: '/a', to: '/c', status: 301 },
      ],
    }),
    expect: ['redirect-duplicate-source'],
  },
  {
    kind: 'redirects',
    label: 'a target that is neither absolute nor root-relative',
    body: JSON.stringify({ redirects: [{ from: '/a', to: 'b', status: 301 }] }),
    expect: ['redirect-relative-target'],
  },
  {
    kind: 'redirects',
    label: 'a rule pointing at itself',
    body: JSON.stringify({ redirects: [{ from: '/a', to: '/a', status: 301 }] }),
    expect: ['redirect-to-self'],
  },
  {
    kind: 'redirects',
    label: 'two rules that point at each other',
    body: JSON.stringify({
      redirects: [
        { from: '/a', to: '/b', status: 301 },
        { from: '/b', to: '/a', status: 301 },
      ],
    }),
    expect: ['redirect-loop'],
  },
  {
    kind: 'redirects',
    label: 'a source that reaches its destination in two hops',
    body: JSON.stringify({
      redirects: [
        { from: '/a', to: '/b', status: 301 },
        { from: '/b', to: '/c', status: 301 },
      ],
    }),
    expect: ['redirect-chain'],
  },
  {
    kind: 'redirects',
    label: 'a permanent move served as a temporary redirect',
    body: JSON.stringify({ redirects: [{ from: '/a', to: '/b', status: 302 }] }),
    expect: ['redirect-temporary-for-permanent-move'],
  },
];

/**
 * The artefact each kind reduces to when there is nothing in it: an empty page,
 * an empty cluster, an empty map.
 *
 * test/pairs.test.mjs runs every checker against these. The point is not that
 * they come back clean, because several of them correctly do not. The point is
 * that a check which fires here is a check that is not reading the artefact,
 * and a pattern whose only evidence is a finding that fires here has proved
 * nothing about its own failing example.
 */
export const emptyArtefacts = {
  canonical: page(''),
  headings: page(''),
  analytics: page(''),
  'jsonld-syntax': page(''),
  'jsonld-graph': page(''),
  'jsonld-breadcrumb': page(''),
  hreflang: JSON.stringify({ pages: [] }),
  sitemap: sitemapFile(''),
  robots: JSON.stringify({ robotsTxt: '' }),
  redirects: JSON.stringify({ redirects: [] }),
};

// The absence findings live in the catalogue, next to the findings themselves,
// because tools/verify.mjs needs them too and a tool must not import from test/.
export { absenceIds } from '../tools/catalogue.mjs';

export const htmlKinds = [
  'canonical',
  'headings',
  'analytics',
  'jsonld-syntax',
  'jsonld-graph',
  'jsonld-breadcrumb',
];
