/**
 * checkers.mjs
 *
 * One checker per pattern kind. Each takes the file body and returns an array
 * of { id, message }. An empty array means clean.
 *
 * These are deliberately narrow. They check the specific fault the pattern is
 * about, on artefacts small enough to reason about, and they do not pretend to
 * be a crawler. A checker that tried to judge everything would be wrong often
 * enough that nobody would trust the ones that matter.
 */

import * as cheerio from 'cheerio';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

const p = (id, message) => ({ id, message });

const isAbsolute = (url) => /^https?:\/\//i.test(url || '');
const isHttps = (url) => /^https:\/\//i.test(url || '');
const trimSlash = (url) => String(url).replace(/\/$/, '');

// W3C Datetime, which is what the sitemap protocol requires for lastmod.
const W3C_DATE = /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2}))?)?)?$/;

// Shape is necessary and not sufficient. The pattern above accepts 2026-02-30
// and 2026-13-01, and the fault this pattern is about is a lastmod Google
// cannot parse and therefore ignores, so the components are checked against
// the date they actually produce rather than against their own spelling.
const isW3CDatetime = (value) => {
  if (!W3C_DATE.test(value)) return false;
  const [year, month, day] = String(value).split(/[-T]/);
  if (month !== undefined && (Number(month) < 1 || Number(month) > 12)) return false;
  if (day !== undefined) {
    const utc = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (utc.getUTCMonth() !== Number(month) - 1 || utc.getUTCDate() !== Number(day)) return false;
  }
  return true;
};

// Language, then an optional script subtag, then an optional region. Script
// subtags are valid and in use: zh-Hant and zh-Hant-TW are correct values, and
// an earlier version of this pattern rejected them, so a correctly built
// Chinese cluster was reported as broken.
const HREFLANG_VALUE = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$/;

const load = (html) => cheerio.load(html);

const pageUrlOf = ($) =>
  $('meta[property="og:url"]').attr('content') ||
  $('link[rel="canonical"]').attr('href') ||
  '';

const hasTrackingParams = (url) => {
  try {
    const u = new URL(url);
    return [...u.searchParams.keys()].some((k) => /^(utm_|gclid|fbclid|msclkid|mc_eid)/i.test(k));
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------- canonical

function canonical(html) {
  const $ = load(html);
  const out = [];
  const inHead = $('head link[rel="canonical"]');
  const anywhere = $('link[rel="canonical"]');

  if (anywhere.length === 0) {
    return [p('canonical-missing', 'no link rel=canonical anywhere in the document')];
  }
  if (anywhere.length > inHead.length) {
    out.push(p('canonical-outside-head', 'a canonical link sits outside <head>, where it is ignored'));
  }
  if (inHead.length > 1) {
    out.push(p('canonical-multiple', `${inHead.length} canonical links in <head>; conflicting signals are discarded`));
  }

  // Every canonical in the head is checked, not only the first. When a plugin
  // appends a second one, that tag is the fault being looked for.
  const hrefs = inHead.toArray().map((n) => $(n).attr("href")).filter(Boolean);
  for (const href of hrefs) {
    if (!isAbsolute(href)) {
      out.push(p("canonical-relative", `canonical href "${href}" is not an absolute URL`));
    } else if (!isHttps(href)) {
      out.push(p("canonical-non-https", `canonical href "${href}" is http, so it names a URL that only redirects`));
    }
    if (hasTrackingParams(href)) {
      out.push(p("canonical-tracking-params", `canonical href "${href}" carries campaign parameters`));
    }
  }
  // Compared against the first canonical that is absolute, since a relative
  // one has already been reported and cannot be compared to anything.
  const declared = hrefs.find(isAbsolute);
  const og = $("meta[property='og:url']").attr("content");
  if (og && declared && isAbsolute(og) && trimSlash(og) !== trimSlash(declared)) {
    out.push(p("canonical-og-url-mismatch", `og:url "${og}" does not match canonical "${declared}"`));
  }

  return out;
}

// ----------------------------------------------------------------- hreflang

// The cluster file lists every page in the language group and the alternates
// each one declares, because reciprocity is the rule that actually matters and
// it cannot be judged from a single page.
function hreflang(body) {
  const cluster = JSON.parse(body);
  const out = [];
  const pages = cluster.pages || [];
  const byUrl = new Map(pages.map((page) => [page.url, page]));

  for (const page of pages) {
    const codes = new Map();
    let selfSeen = false;

    for (const alt of page.alternates || []) {
      if (!isAbsolute(alt.href)) {
        out.push(p('hreflang-relative', `${page.url} declares a relative alternate "${alt.href}"`));
      }
      if (alt.hreflang !== 'x-default' && !HREFLANG_VALUE.test(alt.hreflang)) {
        const code = String(alt.hreflang);
        const reason = /^[A-Z]{2}$/.test(code)
          ? 'that is a country code, and the language subtag comes first'
          : 'not a valid language, language-script or language-region value';
        out.push(p('hreflang-invalid-code', `${page.url} declares hreflang="${alt.hreflang}"; ${reason}`));
      }
      if (codes.has(alt.hreflang) && codes.get(alt.hreflang) !== alt.href) {
        out.push(p('hreflang-duplicate-code', `${page.url} maps hreflang="${alt.hreflang}" to two different URLs`));
      }
      codes.set(alt.hreflang, alt.href);
      if (alt.href === page.url) selfSeen = true;
    }

    if (!selfSeen) {
      out.push(p('hreflang-missing-self', `${page.url} does not list itself among its alternates`));
    }

    for (const alt of page.alternates || []) {
      if (alt.hreflang === 'x-default' || alt.href === page.url) continue;
      const target = byUrl.get(alt.href);
      if (!target) {
        out.push(p('hreflang-dangling-target', `${page.url} points at ${alt.href}, which is not in the cluster`));
        continue;
      }
      if (!(target.alternates || []).some((a) => a.href === page.url)) {
        out.push(p('hreflang-not-reciprocal', `${page.url} points at ${alt.href}, which does not point back`));
      }
    }
  }

  return out;
}

// ----------------------------------------------------------------- headings

function headings(html) {
  const $ = load(html);
  const out = [];
  const nodes = $('h1, h2, h3, h4, h5, h6').toArray();
  const levels = nodes.map((n) => Number(n.tagName.slice(1)));

  const h1s = levels.filter((l) => l === 1).length;
  if (h1s === 0) out.push(p('heading-no-h1', 'the document has no h1'));
  if (h1s > 1) out.push(p('heading-multiple-h1', `the document has ${h1s} h1 elements`));

  nodes.forEach((n) => {
    const text = $(n).text().trim();
    if (!text) out.push(p('heading-empty', `an empty <${n.tagName}> sits in the outline`));
    // Heuristic, not a rule: a heading this long is almost always a paragraph
    // that got its size by picking a heading tag.
    if (text.length > 160) {
      out.push(p('heading-used-for-styling', `<${n.tagName}> holds ${text.length} characters, which reads as body copy`));
    }
  });

  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) {
      out.push(p('heading-skipped-level', `h${levels[i - 1]} is followed by h${levels[i]}`));
    }
  }

  return out;
}

// ---------------------------------------------------------------- analytics

function analytics(html) {
  const $ = load(html);
  const out = [];
  const source = $.html();

  const ua = [...new Set([...source.matchAll(/UA-\d{4,10}-\d{1,4}/g)].map((m) => m[0]))];
  if (ua.length) {
    out.push(p('analytics-legacy-ua', `Universal Analytics id ${ua.join(', ')} is still published; it has processed nothing since July 2023`));
  }

  const ga4 = new Set([...source.matchAll(/G-[A-Z0-9]{6,12}/g)].map((m) => m[0]));
  if (ga4.size > 1) {
    out.push(p('analytics-multiple-ga4-properties', `${ga4.size} GA4 measurement ids fire on one page: ${[...ga4].join(', ')}`));
  }

  const gtm = new Set([...source.matchAll(/GTM-[A-Z0-9]{6,10}/g)].map((m) => m[0]));
  if (gtm.size > 1) {
    out.push(p('analytics-multiple-gtm-containers', `${gtm.size} tag containers load on one page: ${[...gtm].join(', ')}`));
  }

  const configs = [...source.matchAll(/gtag\(\s*['"]config['"]\s*,\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const repeated = [...new Set(configs.filter((id, i) => configs.indexOf(id) !== i))];
  if (repeated.length) {
    out.push(p('analytics-duplicate-config', `gtag config for ${repeated.join(', ')} runs more than once, which double counts sessions`));
  }

  return out;
}

// ------------------------------------------------------------------ json-ld

const jsonLdBlocks = ($) =>
  $('script[type="application/ld+json"]').toArray().map((n, i) => ({ index: i, raw: $(n).text() }));

const collectNodes = (doc) => {
  const docs = Array.isArray(doc) ? doc : [doc];
  return docs.flatMap((d) => (d && d['@graph']) || [d]).filter(Boolean);
};

const ENTITY_TYPES = ['Organization', 'WebSite', 'WebPage', 'ProfessionalService', 'LocalBusiness'];
const typesOf = (node) => [].concat(node['@type'] || []);

function jsonldSyntax(html) {
  const $ = load(html);
  const out = [];
  const blocks = jsonLdBlocks($);
  if (blocks.length === 0) return [p('jsonld-none', 'the document has no JSON-LD')];

  const parsed = [];
  for (const block of blocks) {
    const text = block.raw.trim();
    if (!text) {
      out.push(p('jsonld-empty-block', `JSON-LD block ${block.index + 1} is empty`));
      continue;
    }
    if (/&quot;|&#34;|&lt;|&gt;/.test(block.raw)) {
      out.push(p('jsonld-html-escaped', `JSON-LD block ${block.index + 1} contains HTML entities; something escaped it on the way in`));
    }
    try {
      parsed.push(JSON.parse(text));
    } catch (err) {
      out.push(p('jsonld-unparseable', `JSON-LD block ${block.index + 1} is not valid JSON (${err.message}); the whole block is discarded`));
    }
  }

  // A duplicate can only be asserted for nodes that carry an identity. Two
  // anonymous nodes of the same type are usually two different things, and an
  // earlier version of this check collapsed them into one signature and
  // reported them as a duplicate. A false positive costs more than a missing
  // check, because it teaches the reader to ignore the checker.
  const signatures = parsed
    .flatMap(collectNodes)
    .filter((node) => node.name || node['@id'])
    .map((node) => `${typesOf(node).join('/')}:${node.name || node['@id']}`);
  const duplicate = [...new Set(signatures.filter((s, i) => signatures.indexOf(s) !== i))];
  if (duplicate.length) {
    out.push(p('jsonld-duplicate-entity', `the same entity is declared twice: ${duplicate.join(', ')}`));
  }

  return out;
}

function jsonldGraph(html) {
  const $ = load(html);
  const out = [];
  const nodes = [];
  for (const block of jsonLdBlocks($)) {
    try {
      nodes.push(...collectNodes(JSON.parse(block.raw)));
    } catch {
      return [p('jsonld-unparseable', 'a JSON-LD block did not parse, so the graph cannot be checked')];
    }
  }

  const ids = nodes.map((n) => n['@id']).filter(Boolean);
  const defined = new Set(ids);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) out.push(p('jsonld-duplicate-id', `two nodes share @id ${id}`));
    seen.add(id);
  }

  for (const node of nodes) {
    if (typesOf(node).some((t) => ENTITY_TYPES.includes(t)) && !node['@id']) {
      out.push(p('jsonld-entity-without-id', `a ${typesOf(node).join('/')} node has no @id, so nothing else can reference it`));
    }
  }

  // A nested object that repeats a whole entity instead of pointing at one.
  const walk = (value, path) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach((v) => walk(v, path));
    if (path.length > 0 && typesOf(value).some((t) => ENTITY_TYPES.includes(t)) && Object.keys(value).length > 2) {
      out.push(p('jsonld-inlined-entity', `${path.join('.')} inlines a whole ${typesOf(value).join('/')} instead of referencing its @id`));
    }
    for (const [k, v] of Object.entries(value)) {
      if (k === '@graph') continue;
      walk(v, [...path, k]);
    }
  };
  nodes.forEach((n) => walk(n, []));

  // A bare { "@id": "..." } is a reference, and it has to resolve in the graph.
  const refs = [];
  const findRefs = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(findRefs);
    const keys = Object.keys(value).filter((k) => !k.startsWith('_'));
    if (keys.length === 1 && keys[0] === '@id') refs.push(value['@id']);
    Object.values(value).forEach(findRefs);
  };
  nodes.forEach(findRefs);
  for (const ref of new Set(refs)) {
    if (!defined.has(ref)) {
      out.push(p('jsonld-dangling-reference', `@id ${ref} is referenced but never defined in the graph`));
    }
  }

  return out;
}

function jsonldBreadcrumb(html) {
  const $ = load(html);
  const out = [];
  const pageUrl = pageUrlOf($);
  const nodes = [];
  for (const block of jsonLdBlocks($)) {
    try {
      nodes.push(...collectNodes(JSON.parse(block.raw)));
    } catch {
      return [p('jsonld-unparseable', 'a JSON-LD block did not parse')];
    }
  }

  const crumbs = nodes.filter((n) => typesOf(n).includes('BreadcrumbList'));
  if (crumbs.length === 0) return [p('breadcrumb-missing', 'the page declares no BreadcrumbList')];

  const urlOf = (entry) =>
    typeof entry.item === 'string' ? entry.item : (entry.item && entry.item['@id']) || '';

  for (const list of crumbs) {
    const items = list.itemListElement || [];
    const positions = items.map((i) => i.position).join(',');
    const expected = items.map((_, i) => i + 1).join(',');
    if (positions !== expected) {
      out.push(p('breadcrumb-position-not-sequential', `positions are [${positions}] and should be [${expected}]`));
    }

    items.forEach((entry, i) => {
      const url = urlOf(entry);
      const name = entry.name || (entry.item && entry.item.name);
      if (!name) out.push(p('breadcrumb-missing-name', `item ${i + 1} has no name`));
      if (i < items.length - 1 && !url) {
        out.push(p('breadcrumb-missing-item-url', `item ${i + 1} has no URL, so the trail cannot be followed`));
      }
      if (url && !isAbsolute(url)) {
        out.push(p('breadcrumb-relative-url', `item ${i + 1} uses the relative URL "${url}"`));
      }
    });

    const lastUrl = items.length ? urlOf(items[items.length - 1]) : '';
    if (pageUrl && lastUrl && trimSlash(lastUrl) !== trimSlash(pageUrl)) {
      out.push(p('breadcrumb-last-item-not-this-page', `the trail ends at ${lastUrl} but the page is ${pageUrl}`));
    }

    if (pageUrl && isAbsolute(pageUrl) && items.length) {
      const depth = new URL(pageUrl).pathname.split('/').filter(Boolean).length;
      if (items.length !== depth + 1) {
        out.push(p('breadcrumb-depth-mismatch', `the URL has ${depth} path segments but the trail has ${items.length} items`));
      }
    }
  }

  return out;
}

// ------------------------------------------------------------------ sitemap

function sitemap(xml) {
  const out = [];
  const valid = XMLValidator.validate(xml);
  if (valid !== true) {
    return [p('sitemap-not-well-formed', `the XML does not parse: ${valid.err.msg} at line ${valid.err.line}`)];
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    isArray: (name) => name === 'url' || name === 'sitemap',
  });
  const doc = parser.parse(xml);

  if (doc.sitemapindex) return out;

  // A file that is neither a urlset nor a sitemap index used to produce zero
  // problems, because the URL loop simply iterated an empty list. A wrong root
  // element, a sitemap saved from the wrong template, or an HTML error page
  // served at the sitemap URL all landed in that hole and were reported clean.
  if (!doc.urlset) {
    const root = Object.keys(doc).find((k) => k !== '?xml') ?? 'nothing';
    return [p('sitemap-no-urlset', `the root element is <${root}>, so this is neither a urlset nor a sitemap index`)];
  }

  const urls = doc.urlset.url || [];
  if (urls.length > 50000) {
    out.push(p('sitemap-too-many-urls', `${urls.length} URLs; the limit is 50,000 per file`));
  }

  const seen = new Set();
  for (const entry of urls) {
    const loc = String(entry.loc ?? '');
    if (!isAbsolute(loc)) {
      out.push(p('sitemap-loc-relative', `<loc>${loc}</loc> is not an absolute URL`));
    } else if (!isHttps(loc)) {
      out.push(p('sitemap-loc-non-https', `<loc>${loc}</loc> is http, so every entry costs a redirect`));
    }
    if (seen.has(loc)) out.push(p('sitemap-duplicate-loc', `${loc} is listed more than once`));
    seen.add(loc);

    if (entry.lastmod === undefined) {
      out.push(p('sitemap-lastmod-missing', `${loc} has no lastmod, the only per-URL hint in this file Google uses`));
    } else {
      const lastmod = String(entry.lastmod);
      if (!isW3CDatetime(lastmod)) {
        out.push(p('sitemap-lastmod-invalid', `lastmod "${lastmod}" is not a W3C datetime, so it is ignored`));
      } else if (new Date(lastmod).getTime() > Date.now() + 86400000) {
        out.push(p('sitemap-lastmod-future', `lastmod "${lastmod}" is in the future`));
      }
    }

    if (entry.priority !== undefined || entry.changefreq !== undefined) {
      out.push(p('sitemap-priority-or-changefreq', `${loc} declares priority or changefreq; Google ignores both`));
    }
  }

  return out;
}

// ------------------------------------------------------------------- robots

// The manifest carries robots.txt plus the indexing directives of the pages it
// governs, because the most expensive fault in this area is only visible when
// both are in view at once.
function robots(body) {
  const site = JSON.parse(body);
  const out = [];
  const groups = [];
  const sitemaps = [];
  let current = null;

  for (const line of String(site.robotsTxt || '').split(/\r?\n/).map((l) => l.trim())) {
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === 'user-agent') {
      if (!current || current.rules.length) {
        current = { agents: [value], rules: [] };
        groups.push(current);
      } else {
        current.agents.push(value);
      }
    } else if (key === 'disallow' || key === 'allow') {
      if (current) current.rules.push({ type: key, path: value });
    } else if (key === 'sitemap') {
      sitemaps.push(value);
    }
  }

  if (!groups.some((g) => g.agents.includes('*'))) {
    out.push(p('robots-no-wildcard-group', 'there is no User-agent: * group, so most crawlers are given no rules'));
  }
  if (sitemaps.length === 0) {
    out.push(p('robots-no-sitemap', 'robots.txt declares no Sitemap'));
  }
  for (const url of sitemaps) {
    if (!isAbsolute(url)) {
      out.push(p('robots-sitemap-relative', `Sitemap: ${url} must be an absolute URL`));
    }
  }

  const applicable = groups.filter(
    (g) => g.agents.includes('*') || g.agents.some((a) => /googlebot/i.test(a))
  );
  const rulesOf = (type) =>
    applicable.flatMap((g) => g.rules.filter((r) => r.type === type).map((r) => r.path)).filter(Boolean);
  const disallows = rulesOf('disallow');
  const allows = rulesOf('allow');

  // Longest matching rule wins, and Allow wins ties. That is Google's
  // documented precedence, and getting it wrong is how the "but I added an
  // Allow" conversation starts.
  const blocked = (pathname) => {
    const matches = (rule) => pathname.startsWith(rule.replace(/\*+$/, ''));
    const d = disallows.filter(matches).sort((a, b) => b.length - a.length)[0];
    if (!d) return false;
    const a = allows.filter(matches).sort((x, y) => y.length - x.length)[0];
    return !(a && a.length >= d.length);
  };

  const pathOf = (url) => {
    try { return new URL(url).pathname; } catch { return url; }
  };

  for (const url of sitemaps) {
    if (isAbsolute(url) && blocked(pathOf(url))) {
      out.push(p('robots-blocks-own-sitemap', `${url} is disallowed by this same file`));
    }
  }

  for (const page of site.pages || []) {
    if (!blocked(pathOf(page.url))) continue;
    if (/noindex/i.test(String(page.robots || ''))) {
      out.push(p('robots-disallow-hides-noindex', `${page.url} is Disallowed and carries noindex; the crawler cannot fetch it to read the noindex, so the URL can stay indexed with no description`));
    }
    if (page.inSitemap) {
      out.push(p('robots-disallow-contradicts-sitemap', `${page.url} is Disallowed but submitted in the sitemap`));
    }
    if (page.canonicalTarget) {
      out.push(p('robots-disallow-hides-canonical', `${page.url} is Disallowed, so its canonical to ${page.canonicalTarget} is never read`));
    }
  }

  // Asset entries go through pathOf for the same reason page entries do: an
  // asset list is normally copied out of a browser network panel, so it arrives
  // as a full URL, and matching a full URL against a robots.txt path matches
  // nothing at all. Until this was fixed, the check passed every site whose
  // render assets were listed the way they are usually collected.
  for (const asset of site.renderAssets || []) {
    if (blocked(pathOf(asset))) {
      out.push(p('robots-blocks-render-assets', `${asset} is Disallowed; blocking it changes how the page renders for the crawler`));
    }
  }

  return out;
}

// ---------------------------------------------------------------- redirects

function redirects(body) {
  const map = JSON.parse(body);
  const rules = map.redirects || [];
  const out = [];
  const bySource = new Map();

  for (const rule of rules) {
    if (bySource.has(rule.from)) out.push(p('redirect-duplicate-source', `${rule.from} is mapped twice`));
    bySource.set(rule.from, rule);
  }

  for (const rule of rules) {
    if (!isAbsolute(rule.to) && !String(rule.to).startsWith('/')) {
      out.push(p('redirect-relative-target', `${rule.from} points at "${rule.to}", which is neither absolute nor root-relative`));
    }
    if (rule.from === rule.to) {
      out.push(p('redirect-to-self', `${rule.from} redirects to itself`));
      continue;
    }
    if (map.permanent !== false && rule.status !== 301 && rule.status !== 308) {
      out.push(p('redirect-temporary-for-permanent-move', `${rule.from} uses ${rule.status}; a move that is not coming back should be 301`));
    }

    const path = [rule.from];
    let cursor = rule.to;
    let looped = false;
    while (bySource.has(cursor)) {
      if (path.includes(cursor)) {
        out.push(p('redirect-loop', `${path.join(' to ')} to ${cursor} never terminates`));
        looped = true;
        break;
      }
      path.push(cursor);
      cursor = bySource.get(cursor).to;
    }
    if (!looped && path.length > 1) {
      out.push(p('redirect-chain', `${path.join(' then ')} then ${cursor} costs ${path.length} hops; point the first straight at the last`));
    }
  }

  return out;
}

export const checkers = {
  canonical,
  hreflang,
  headings,
  analytics,
  'jsonld-syntax': jsonldSyntax,
  'jsonld-graph': jsonldGraph,
  'jsonld-breadcrumb': jsonldBreadcrumb,
  sitemap,
  robots,
  redirects,
};
