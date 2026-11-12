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
 * A case declares the exact set of ids it produces.
 *
 * It did not always. The first version of this contract said a case was allowed
 * to produce findings it had not declared, on the reasoning that some of these
 * faults genuinely travel together, and test/catalogue.test.mjs asserted
 * inclusion only. The consequence is worth stating plainly: under that contract
 * every false positive the corpus triggered was invisible to the suite by
 * construction. A case about one fault could emit four more and pass.
 *
 * So `expect` names the fault the artefact is about, `also` names the findings
 * that legitimately travel with it, and the assertion is that the produced set
 * equals the union of the two exactly. Anything else fails, which is what makes
 * a new false positive a build failure rather than a thing nobody looks at.
 * Where `also` is non-empty there is a reason beside it.
 */

const page = (head, body = '') =>
  `<!doctype html><html lang="en"><head><title>Example</title>${head}</head><body>${body}</body></html>`;

const ld = (json) => `<script type="application/ld+json">${json}</script>`;

const sitemapFile = (inner) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${inner}\n</urlset>`;

const entry = (loc, extra = '<lastmod>2026-01-15</lastmod>') => `  <url><loc>${loc}</loc>${extra}</url>`;

const sitemapIndexFile = (inner) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${inner}\n</sitemapindex>`;

const childSitemap = (loc, extra = '<lastmod>2026-01-15</lastmod>') =>
  `  <sitemap><loc>${loc}</loc>${extra}</sitemap>`;

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

// Fifty thousand and one child sitemaps, built rather than stored, for the same
// reason as the file above: the only finding it can produce is the count.
const oversizedSitemapIndex = () => {
  const rows = [];
  for (let i = 0; i < 50001; i++) {
    rows.push(childSitemap(`https://example.com/sitemaps/${i}.xml`));
  }
  return sitemapIndexFile(rows.join('\n'));
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
    label: 'a bare country code used where a language belongs',
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
    expect: ['hreflang-region-without-language'],
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
    // A relative href cannot match any page URL in the cluster, so it dangles
    // as well. The two always travel together and neither is wrong.
    also: ['hreflang-dangling-target'],
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
    body: page('<script src="https://www.googletagmanager.com/gtag/js?id=G-AAAAAA111"></script><script src="https://www.googletagmanager.com/gtag/js?id=G-BBBBBB222"></script><script>gtag("config","G-AAAAAA111");gtag("config","G-BBBBBB222");</script>'),
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
    body: page('<script src="https://www.googletagmanager.com/gtag/js?id=G-AAAAAA111"></script><script>gtag("config","G-AAAAAA111");</script><script>gtag("config","G-AAAAAA111");</script>'),
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
  // ----------------------------------------------- the reasons added in the
  // 12 November rebuild. Each one is a fault that this repository reported as
  // clean, or reported under the wrong reason, for the whole of its life
  // before that date.

  // ------------------------------------------------------------- canonical
  {
    kind: 'canonical',
    label: 'canonical href is empty, which is an unrendered template variable',
    body: page('<link rel="canonical" href="">'),
    expect: ['canonical-empty-href'],
  },
  {
    kind: 'canonical',
    label: 'canonical element has no href attribute at all',
    body: page('<link rel="canonical">'),
    expect: ['canonical-empty-href'],
  },
  {
    kind: 'canonical',
    label: 'canonical href is whitespace, which used to be read as a relative URL',
    body: page('<link rel="canonical" href="   ">'),
    expect: ['canonical-empty-href'],
  },
  {
    kind: 'canonical',
    label: 'canonical carries a fragment, which canonicalisation drops',
    body: page('<link rel="canonical" href="https://example.com/a#pricing">'),
    expect: ['canonical-has-fragment'],
  },

  // -------------------------------------------------------------- hreflang
  {
    kind: 'hreflang',
    label: 'an hreflang value that is not a language in any spelling',
    body: JSON.stringify({
      pages: [{ url: 'https://example.com/a/', alternates: [{ hreflang: 'english', href: 'https://example.com/a/' }] }],
    }),
    expect: ['hreflang-invalid-code'],
  },
  {
    kind: 'hreflang',
    label: 'an alternate with an empty hreflang value',
    body: JSON.stringify({
      pages: [{ url: 'https://example.com/a/', alternates: [{ hreflang: '', href: 'https://example.com/a/' }] }],
    }),
    expect: ['hreflang-empty-code'],
  },
  {
    kind: 'hreflang',
    label: 'an alternate with a language and no href',
    body: JSON.stringify({
      pages: [{
        url: 'https://example.com/a/',
        alternates: [{ hreflang: 'en', href: 'https://example.com/a/' }, { hreflang: 'de', href: '' }],
      }],
    }),
    expect: ['hreflang-empty-href'],
  },
  {
    kind: 'hreflang',
    label: 'two different x-default targets on one page',
    body: JSON.stringify({
      pages: [{
        url: 'https://example.com/a/',
        alternates: [
          { hreflang: 'en', href: 'https://example.com/a/' },
          { hreflang: 'x-default', href: 'https://example.com/a/' },
          { hreflang: 'x-default', href: 'https://example.com/b/' },
        ],
      }],
    }),
    expect: ['hreflang-multiple-x-default'],
  },
  {
    kind: 'hreflang',
    label: 'a page in the cluster that declares no alternates at all',
    body: JSON.stringify({
      pages: [
        { url: 'https://example.com/a/', alternates: [{ hreflang: 'en', href: 'https://example.com/a/' }, { hreflang: 'de', href: 'https://example.com/b/' }] },
        { url: 'https://example.com/b/', alternates: [] },
      ],
    }),
    expect: ['hreflang-page-without-alternates'],
    also: ['hreflang-not-reciprocal'],
  },
  {
    kind: 'hreflang',
    label: 'every value names a region and none is x-default',
    body: JSON.stringify({
      pages: [
        { url: 'https://example.com/gb/', alternates: [{ hreflang: 'en-gb', href: 'https://example.com/gb/' }, { hreflang: 'en-us', href: 'https://example.com/us/' }] },
        { url: 'https://example.com/us/', alternates: [{ hreflang: 'en-us', href: 'https://example.com/us/' }, { hreflang: 'en-gb', href: 'https://example.com/gb/' }] },
      ],
    }),
    expect: ['hreflang-no-x-default'],
  },

  // ------------------------------------------------------------- analytics
  {
    kind: 'analytics',
    label: 'a page with no measurement of any kind',
    body: page(''),
    expect: ['analytics-none'],
  },
  {
    kind: 'analytics',
    label: 'a gtag config with no library and no container to receive it',
    body: page('<script>gtag("config","G-AAAAAA111");</script>'),
    expect: ['analytics-gtag-without-library'],
  },
  {
    kind: 'analytics',
    label: 'the library loads one property and the config names another',
    body: page('<script src="https://www.googletagmanager.com/gtag/js?id=G-AAAAAA111"></script><script>gtag("config","G-BBBBBB222");</script>'),
    expect: ['analytics-config-id-not-loaded'],
    also: ['analytics-multiple-ga4-properties'],
  },

  // --------------------------------------------------------- structured data
  {
    kind: 'jsonld-syntax',
    label: 'a block that parses as JSON and declares no @context',
    body: page(ld(JSON.stringify({ '@type': 'Organization', '@id': 'https://example.com/#org', name: 'Acme' }))),
    expect: ['jsonld-no-context'],
  },
  {
    kind: 'jsonld-graph',
    label: 'a node with no @type, which nothing treats as an entity',
    body: page(ld(JSON.stringify({ '@context': 'https://schema.org', '@id': 'https://example.com/#x', name: 'Acme' }))),
    expect: ['jsonld-node-without-type'],
  },
  {
    kind: 'jsonld-breadcrumb',
    label: 'a trail on a page that states no og:url and no canonical',
    body: page(ld(JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: 'https://example.com/' }],
    }))),
    expect: ['breadcrumb-page-url-unknown'],
  },

  // --------------------------------------------------------------- sitemap
  {
    kind: 'sitemap',
    label: 'a urlset with no entries in it',
    body: sitemapFile(''),
    expect: ['sitemap-empty'],
  },
  {
    kind: 'sitemap',
    label: 'a url entry with no loc element at all',
    body: sitemapFile('  <url><lastmod>2026-01-15</lastmod></url>'),
    expect: ['sitemap-url-without-loc'],
  },
  {
    kind: 'sitemap',
    label: 'a lastmod element that is present and empty',
    body: sitemapFile('  <url><loc>https://example.com/a</loc><lastmod></lastmod></url>'),
    expect: ['sitemap-lastmod-empty'],
  },

  // ------------------------------------------------- sitemap: the index file
  {
    kind: 'sitemap',
    label: 'a sitemap index that lists no child sitemaps',
    body: sitemapIndexFile(''),
    expect: ['sitemap-index-empty'],
  },
  {
    kind: 'sitemap',
    label: 'a sitemap entry in an index with no loc',
    body: sitemapIndexFile('  <sitemap><lastmod>2026-01-15</lastmod></sitemap>'),
    expect: ['sitemap-index-without-loc'],
  },
  {
    kind: 'sitemap',
    label: 'a child sitemap named by a relative URL',
    body: sitemapIndexFile('  <sitemap><loc>/sitemaps/products.xml</loc><lastmod>2026-01-15</lastmod></sitemap>'),
    expect: ['sitemap-index-loc-relative'],
  },
  {
    kind: 'sitemap',
    label: 'a child sitemap named over http',
    body: sitemapIndexFile('  <sitemap><loc>http://example.com/sitemaps/products.xml</loc><lastmod>2026-01-15</lastmod></sitemap>'),
    expect: ['sitemap-index-loc-non-https'],
  },
  {
    kind: 'sitemap',
    label: 'the same child sitemap listed twice in an index',
    body: sitemapIndexFile(
      '  <sitemap><loc>https://example.com/sitemaps/a.xml</loc><lastmod>2026-01-15</lastmod></sitemap>\n' +
      '  <sitemap><loc>https://example.com/sitemaps/a.xml</loc><lastmod>2026-01-15</lastmod></sitemap>'
    ),
    expect: ['sitemap-index-duplicate-loc'],
  },
  {
    kind: 'sitemap',
    label: 'a child sitemap with no lastmod, which is the refetch signal',
    body: sitemapIndexFile('  <sitemap><loc>https://example.com/sitemaps/a.xml</loc></sitemap>'),
    expect: ['sitemap-index-lastmod-missing'],
  },
  {
    kind: 'sitemap',
    label: 'a child sitemap with an empty lastmod element',
    body: sitemapIndexFile('  <sitemap><loc>https://example.com/sitemaps/a.xml</loc><lastmod></lastmod></sitemap>'),
    expect: ['sitemap-index-lastmod-empty'],
  },
  {
    kind: 'sitemap',
    label: 'a child sitemap with a lastmod that is not a W3C datetime',
    body: sitemapIndexFile('  <sitemap><loc>https://example.com/sitemaps/a.xml</loc><lastmod>15 January 2026</lastmod></sitemap>'),
    expect: ['sitemap-index-lastmod-invalid'],
  },
  {
    kind: 'sitemap',
    label: 'a sitemap index over the fifty thousand child limit',
    body: oversizedSitemapIndex(),
    expect: ['sitemap-index-too-many-sitemaps'],
  },

  // ---------------------------------------------------------------- robots
  {
    kind: 'robots',
    label: 'a Noindex line in robots.txt, unsupported since September 2019',
    body: JSON.stringify({
      robotsTxt: 'User-agent: *\nNoindex: /private/\nSitemap: https://example.com/sitemap.xml',
    }),
    expect: ['robots-noindex-directive'],
  },
  {
    kind: 'robots',
    label: 'a Crawl-delay line, which Google ignores',
    body: JSON.stringify({
      robotsTxt: 'User-agent: *\nCrawl-delay: 10\nDisallow: /tmp/\nSitemap: https://example.com/sitemap.xml',
    }),
    expect: ['robots-crawl-delay'],
  },

  // ------------------------------------------------------------- redirects
  {
    kind: 'robots',
    // The other severity this id is emitted at. A blocked stylesheet changes
    // what the rendered page contains and is an error; a blocked image changes
    // how it looks and not what it says, so it is a warning. Without this case
    // the catalogue would declare a severity nothing had ever produced, which
    // test/catalogue.test.mjs treats as a failure.
    label: 'a blocked image render asset, which is the warning severity of the same id',
    body: JSON.stringify({
      robotsTxt: 'User-agent: *\nDisallow: /assets/\nSitemap: https://example.com/sitemap.xml',
      renderAssets: ['https://example.com/assets/hero.png'],
    }),
    expect: ['robots-blocks-render-assets'],
  },
  {
    kind: 'redirects',
    // Three hops, which is long enough that Google stops following, so the
    // same id is emitted at error here and at warning for the two hop rule
    // inside the very same map.
    label: 'a three hop chain, which reaches both severities of redirect-chain',
    body: JSON.stringify({
      redirects: [
        { from: '/a/', to: '/b/', status: 301 },
        { from: '/b/', to: '/c/', status: 301 },
        { from: '/c/', to: '/d/', status: 301 },
      ],
    }),
    expect: ['redirect-chain'],
  },
  {
    kind: 'redirects',
    label: 'a rule in a redirect map whose status is not a redirect',
    body: JSON.stringify({ redirects: [{ from: '/old/', to: '/new/', status: 200 }] }),
    expect: ['redirect-status-not-a-redirect'],
  },
  {
    kind: 'redirects',
    label: 'a rule that records no status at all',
    body: JSON.stringify({ redirects: [{ from: '/old/', to: '/new/' }] }),
    expect: ['redirect-status-missing'],
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
/**
 * Each kind maps to every empty artefact it has, because a kind can have more
 * than one. The sitemap protocol defines two root elements and an empty file
 * of each is a different empty artefact: an empty urlset and an empty sitemap
 * index report different absences, and only one of them was modelled here
 * until the sitemap index was given checks of its own.
 */
export const emptyArtefacts = {
  canonical: [page('')],
  headings: [page('')],
  analytics: [page('')],
  'jsonld-syntax': [page('')],
  'jsonld-graph': [page('')],
  'jsonld-breadcrumb': [page('')],
  hreflang: [JSON.stringify({ pages: [] })],
  sitemap: [sitemapFile(''), sitemapIndexFile('')],
  robots: [JSON.stringify({ robotsTxt: '' })],
  redirects: [JSON.stringify({ redirects: [] })],
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
