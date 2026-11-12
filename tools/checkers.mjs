/**
 * checkers.mjs
 *
 * One checker per pattern kind. Each takes the file body and returns an array
 * of { id, message, severity }. An empty array means clean.
 *
 * These are deliberately narrow. They check the specific fault the pattern is
 * about, on artefacts small enough to reason about, and they do not pretend to
 * be a crawler. A checker that tried to judge everything would be wrong often
 * enough that nobody would trust the ones that matter.
 *
 * Two rules the current version follows that the first one did not.
 *
 * A finding carries its severity from the place that emits it, not from the
 * catalogue. The catalogue declares the complete set of severities each id can
 * be emitted at and test/catalogue.test.mjs compares the two in both
 * directions, so a severity the code produces and the catalogue does not
 * declare is a failure, and so is a severity the catalogue declares that no
 * case has ever produced. The second direction is the one that does the work.
 *
 * The absence of a thing and a broken version of that thing are different
 * findings. An empty canonical href is not a missing canonical and it is not a
 * relative one: it is a template that rendered nothing, and it used to be
 * reported as clean. Splitting one weak finding into missing, empty and broken
 * is where most of the faults in this file were found.
 */

import * as cheerio from 'cheerio';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

/** Severities, worst first. A finding is emitted at exactly one of these. */
export const SEVERITIES = ['error', 'warning', 'note'];

const p = (id, message, severity) => {
  if (!SEVERITIES.includes(severity)) {
    throw new Error(`${id} was emitted at severity "${severity}", which is not one of ${SEVERITIES.join(', ')}`);
  }
  return { id, message, severity };
};

const isAbsolute = (url) => /^https?:\/\//i.test(url || '');
const isHttps = (url) => /^https:\/\//i.test(url || '');
const trimSlash = (url) => String(url).replace(/\/$/, '');
const blank = (value) => value === undefined || value === null || String(value).trim() === '';

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

/**
 * Whether a string is a usable hreflang value, and the shape of the mistake
 * when it is not.
 *
 * hreflang values are not case sensitive. Google says so and BCP 47 says so,
 * and the first version of this function required a lowercase language, a
 * title-case script and an uppercase region exactly. The consequence was that
 * a correctly built cluster spelled en-gb was reported as broken, with a
 * message saying the value was not a valid language, language-script or
 * language-region value, which was false. The same version rejected es-419,
 * the standard value for Latin American Spanish, because a region subtag can
 * be a three digit UN M.49 code as well as two letters.
 *
 * So the value is normalised to lower case before it is judged, and the region
 * subtag accepts either form.
 */
const LANGUAGE = /^[a-z]{2,3}$/;
const SCRIPT = /^[a-z]{4}$/;
const REGION = /^([a-z]{2}|\d{3})$/;

export const hreflangShape = (raw) => {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === '') return 'empty';
  if (value === 'x-default') return 'valid';
  const parts = value.split('-');
  // A bare two letter code that is a region and not a language is the single
  // most common hreflang mistake, so it keeps its own answer. GB is a country;
  // the language subtag comes first and there is no language called gb.
  if (parts.length === 1 && LANGUAGE.test(parts[0])) return 'valid';
  if (parts.length === 1) return 'invalid';
  const [language, ...rest] = parts;
  if (!LANGUAGE.test(language)) return 'invalid';
  if (rest.length === 1) return SCRIPT.test(rest[0]) || REGION.test(rest[0]) ? 'valid' : 'invalid';
  if (rest.length === 2) return SCRIPT.test(rest[0]) && REGION.test(rest[1]) ? 'valid' : 'invalid';
  return 'invalid';
};

// The list of two letter codes that are regions rather than languages is long
// and the distinction only needs to be made for the handful that are not also
// languages. ISO 639-1 has no gb, us, uk, au, ca, cn, jp, br, mx or at, and
// those are the ones that turn up in a hreflang attribute by mistake.
const REGION_NOT_LANGUAGE = new Set(['gb', 'us', 'uk', 'au', 'ca', 'cn', 'jp', 'br', 'mx', 'at', 'ch', 'be']);

const load = (html) => cheerio.load(html);

const pageUrlOf = ($) =>
  $('meta[property="og:url"]').attr('content') ||
  $('head link[rel="canonical"]').attr('href') ||
  '';

const hasTrackingParams = (url) => {
  try {
    const u = new URL(url);
    return [...u.searchParams.keys()].some((k) => /^(utm_|gclid|fbclid|msclkid|mc_eid)/i.test(k));
  } catch {
    return false;
  }
};

const hasFragment = (url) => {
  try {
    return new URL(url).hash !== '';
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
    return [p('canonical-missing', 'no link rel=canonical anywhere in the document', 'warning')];
  }
  if (anywhere.length > inHead.length) {
    out.push(p('canonical-outside-head', 'a canonical link sits outside <head>, where it is ignored', 'error'));
  }
  if (inHead.length > 1) {
    out.push(p('canonical-multiple', `${inHead.length} canonical links in <head>; conflicting signals are discarded`, 'error'));
  }

  // Every canonical in the head is checked, not only the first. When a plugin
  // appends a second one, that tag is the fault being looked for.
  //
  // The href is read as an attribute that may be absent, empty or whitespace,
  // because those are three spellings of the same fault and the fault is
  // common: a canonical whose href is an unrendered template variable. The
  // first version of this checker dropped empty hrefs with filter(Boolean) and
  // reported such a document clean, and reported the whitespace spelling as a
  // relative URL, which named the wrong reason.
  const hrefs = inHead.toArray().map((n) => $(n).attr('href'));
  for (const href of hrefs) {
    if (blank(href)) {
      out.push(p(
        'canonical-empty-href',
        href === undefined
          ? 'a canonical link in <head> has no href attribute at all'
          : `a canonical link in <head> has an empty href ("${href}"), which is what an unrendered template variable looks like`,
        'error'
      ));
      continue;
    }
    if (!isAbsolute(href)) {
      out.push(p('canonical-relative', `canonical href "${href}" is not an absolute URL`, 'warning'));
    } else if (!isHttps(href)) {
      out.push(p('canonical-non-https', `canonical href "${href}" is http, so it names a URL that only redirects`, 'error'));
    }
    if (hasTrackingParams(href)) {
      out.push(p('canonical-tracking-params', `canonical href "${href}" carries campaign parameters`, 'error'));
    }
    if (hasFragment(href)) {
      out.push(p('canonical-has-fragment', `canonical href "${href}" carries a fragment, which is dropped when the URL is canonicalised, so the tag states something it cannot say`, 'note'));
    }
  }
  // Compared against the first canonical that is absolute, since a relative
  // one has already been reported and cannot be compared to anything.
  const declared = hrefs.filter((h) => !blank(h)).find(isAbsolute);
  const og = $('meta[property="og:url"]').attr('content');
  if (og && declared && isAbsolute(og) && trimSlash(og) !== trimSlash(declared)) {
    out.push(p('canonical-og-url-mismatch', `og:url "${og}" does not match canonical "${declared}"`, 'warning'));
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
    const alternates = page.alternates || [];
    const codes = new Map();
    let selfSeen = false;

    // A page that declares nothing at all is a different fault from a page
    // whose list is wrong, and it used to be reported as the latter.
    if (alternates.length === 0) {
      out.push(p('hreflang-page-without-alternates', `${page.url} is in the cluster and declares no alternates at all, so it is annotated by its neighbours and annotates nobody`, 'error'));
    }

    const xDefaults = alternates.filter((alt) => String(alt.hreflang ?? '').trim().toLowerCase() === 'x-default');
    const xDefaultTargets = new Set(xDefaults.map((alt) => alt.href));
    if (xDefaultTargets.size > 1) {
      out.push(p('hreflang-multiple-x-default', `${page.url} declares ${xDefaultTargets.size} different x-default targets, and x-default is not a language code, so this is not a duplicate language either`, 'error'));
    }

    for (const alt of alternates) {
      if (blank(alt.href)) {
        out.push(p('hreflang-empty-href', `${page.url} declares hreflang="${alt.hreflang}" with no href`, 'error'));
      } else if (!isAbsolute(alt.href)) {
        out.push(p('hreflang-relative', `${page.url} declares a relative alternate "${alt.href}"`, 'error'));
      }

      const shape = hreflangShape(alt.hreflang);
      const code = String(alt.hreflang ?? '').trim().toLowerCase();
      if (shape === 'empty') {
        out.push(p('hreflang-empty-code', `${page.url} declares an alternate with an empty hreflang value`, 'error'));
      } else if (shape === 'valid' && code.split('-').length === 1 && REGION_NOT_LANGUAGE.has(code)) {
        out.push(p('hreflang-region-without-language', `${page.url} declares hreflang="${alt.hreflang}"; that is a country code, and the language subtag comes first`, 'error'));
      } else if (shape === 'invalid') {
        out.push(p('hreflang-invalid-code', `${page.url} declares hreflang="${alt.hreflang}", which is not a language, language-script or language-region value`, 'error'));
      }

      if (codes.has(code) && codes.get(code) !== alt.href && code !== 'x-default') {
        out.push(p('hreflang-duplicate-code', `${page.url} maps hreflang="${alt.hreflang}" to two different URLs`, 'error'));
      }
      codes.set(code, alt.href);
      if (alt.href === page.url) selfSeen = true;
    }

    if (!selfSeen && alternates.length > 0) {
      out.push(p('hreflang-missing-self', `${page.url} does not list itself among its alternates`, 'error'));
    }

    for (const alt of alternates) {
      const code = String(alt.hreflang ?? '').trim().toLowerCase();
      if (code === 'x-default' || alt.href === page.url || blank(alt.href)) continue;
      const target = byUrl.get(alt.href);
      if (!target) {
        out.push(p('hreflang-dangling-target', `${page.url} points at ${alt.href}, which is not in the cluster`, 'error'));
        continue;
      }
      if (!(target.alternates || []).some((a) => a.href === page.url)) {
        out.push(p('hreflang-not-reciprocal', `${page.url} points at ${alt.href}, which does not point back`, 'error'));
      }
    }
  }

  // x-default is a recommendation rather than a requirement, so it is only
  // reported when every value in the cluster carries a region. A cluster that
  // targets en-gb, en-us and de-de and nothing else has no answer for a
  // visitor in a country it did not name, and Google picks one.
  const allCodes = pages.flatMap((page) => (page.alternates || []).map((alt) => String(alt.hreflang ?? '').trim().toLowerCase()));
  const regional = allCodes.filter((code) => code !== 'x-default');
  if (
    regional.length > 0 &&
    regional.every((code) => code.split('-').length > 1 && REGION.test(code.split('-').at(-1))) &&
    !allCodes.includes('x-default')
  ) {
    out.push(p('hreflang-no-x-default', 'every value in the cluster names a region and none is x-default, so a visitor from a country the cluster does not name is sent to whichever page Google picks', 'warning'));
  }

  return out;
}

// ----------------------------------------------------------------- headings

/**
 * The accessible name of a heading.
 *
 * Text, or the label that replaces it, or the alt text of the images inside
 * it. The first version of this used the text alone, so a heading holding one
 * image with alt text was reported as an empty heading. That is a false
 * positive on a shape that is correct, common and deliberate, and a false
 * positive costs more than a missing check because it teaches the reader to
 * ignore the checker.
 */
const headingName = ($, node) => {
  const el = $(node);
  const label = String(el.attr('aria-label') ?? '').trim();
  if (label) return label;
  const text = el.text().trim();
  if (text) return text;
  return el
    .find('img[alt], area[alt], input[alt]')
    .toArray()
    .map((img) => String($(img).attr('alt') ?? '').trim())
    .filter(Boolean)
    .join(' ');
};

function headings(html) {
  const $ = load(html);
  const out = [];
  const nodes = $('h1, h2, h3, h4, h5, h6').toArray();
  const levels = nodes.map((n) => Number(n.tagName.slice(1)));

  const h1s = levels.filter((l) => l === 1).length;
  if (h1s === 0) out.push(p('heading-no-h1', 'the document has no h1', 'warning'));
  if (h1s > 1) out.push(p('heading-multiple-h1', `the document has ${h1s} h1 elements`, 'warning'));

  nodes.forEach((n) => {
    const name = headingName($, n);
    if (!name) out.push(p('heading-empty', `a <${n.tagName}> with no text, no label and no image alt text sits in the outline`, 'error'));
    // Heuristic, not a rule: a heading this long is almost always a paragraph
    // that got its size by picking a heading tag. Emitted as a note for that
    // reason, because the repository does not fail a build over a guess.
    if (name.length > 160) {
      out.push(p('heading-used-for-styling', `<${n.tagName}> holds ${name.length} characters, which reads as body copy`, 'note'));
    }
  });

  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) {
      out.push(p('heading-skipped-level', `h${levels[i - 1]} is followed by h${levels[i]}`, 'warning'));
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
    out.push(p('analytics-legacy-ua', `Universal Analytics id ${ua.join(', ')} is still published; it has processed nothing since July 2023`, 'warning'));
  }

  const ga4 = new Set([...source.matchAll(/G-[A-Z0-9]{6,12}/g)].map((m) => m[0]));
  if (ga4.size > 1) {
    out.push(p('analytics-multiple-ga4-properties', `${ga4.size} GA4 measurement ids fire on one page: ${[...ga4].join(', ')}`, 'error'));
  }

  const gtm = new Set([...source.matchAll(/GTM-[A-Z0-9]{6,10}/g)].map((m) => m[0]));
  if (gtm.size > 1) {
    out.push(p('analytics-multiple-gtm-containers', `${gtm.size} tag containers load on one page: ${[...gtm].join(', ')}`, 'error'));
  }

  const configs = [...source.matchAll(/gtag\(\s*['"]config['"]\s*,\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const repeated = [...new Set(configs.filter((id, i) => configs.indexOf(id) !== i))];
  if (repeated.length) {
    out.push(p('analytics-duplicate-config', `gtag config for ${repeated.join(', ')} runs more than once, which double counts sessions`, 'error'));
  }

  // Which properties a library on the page actually loads. The id is in the
  // query string of the script the page fetches, so it is read from there
  // rather than from the configuration, which is the thing being judged.
  const loaded = new Set(
    [...source.matchAll(/gtag\/js\?id=([A-Za-z0-9-]+)/g)].map((m) => m[1])
  );
  const hasTagManager = gtm.size > 0 || /googletagmanager\.com\/gtm\.js/.test(source);

  if (ua.length === 0 && ga4.size === 0 && gtm.size === 0 && configs.length === 0) {
    out.push(p('analytics-none', 'the page loads no measurement of any kind, so nothing about it can be answered from analytics later', 'note'));
  }

  // A configuration call with nothing to receive it. The call pushes onto a
  // dataLayer that no library ever reads, so it is silent and it looks exactly
  // like working code in the page source.
  if (configs.length > 0 && loaded.size === 0 && !hasTagManager) {
    out.push(p('analytics-gtag-without-library', `gtag config runs for ${configs.join(', ')} and neither gtag.js nor a tag container is loaded, so the call pushes onto a dataLayer nothing reads`, 'error'));
  }

  // The library loads one property and the configuration names another. This
  // is what a half finished property migration looks like, and both halves
  // look correct on their own.
  if (loaded.size > 0) {
    for (const id of new Set(configs)) {
      if (!loaded.has(id) && !hasTagManager) {
        out.push(p('analytics-config-id-not-loaded', `gtag config names ${id} but the page loads the library for ${[...loaded].join(', ')}, so the configured property is not the measured one`, 'error'));
      }
    }
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

const parseBlocks = ($) => {
  const parsed = [];
  let broken = false;
  for (const block of jsonLdBlocks($)) {
    const text = block.raw.trim();
    if (!text) continue;
    try {
      parsed.push(JSON.parse(text));
    } catch {
      broken = true;
    }
  }
  return { parsed, broken };
};

function jsonldSyntax(html) {
  const $ = load(html);
  const out = [];
  const blocks = jsonLdBlocks($);
  if (blocks.length === 0) return [p('jsonld-none', 'the document has no JSON-LD', 'warning')];

  const parsed = [];
  for (const block of blocks) {
    const text = block.raw.trim();
    if (!text) {
      out.push(p('jsonld-empty-block', `JSON-LD block ${block.index + 1} is empty`, 'error'));
      continue;
    }
    if (/&quot;|&#34;|&lt;|&gt;/.test(block.raw)) {
      out.push(p('jsonld-html-escaped', `JSON-LD block ${block.index + 1} contains HTML entities; something escaped it on the way in`, 'error'));
    }
    try {
      parsed.push({ index: block.index, doc: JSON.parse(text) });
    } catch (err) {
      out.push(p('jsonld-unparseable', `JSON-LD block ${block.index + 1} is not valid JSON (${err.message}); the whole block is discarded`, 'error'));
    }
  }

  // A block with no @context is valid JSON and completely inert. Nothing in it
  // is read as Schema.org, so it produces no enhancement row, no warning and
  // no error: it is simply absent, which is the same symptom as a block that
  // did not parse. The first version of this checker parsed such a block
  // successfully and reported the document clean.
  for (const { index, doc } of parsed) {
    const docs = Array.isArray(doc) ? doc : [doc];
    const contextless = docs.filter((d) => d && typeof d === 'object' && !Object.hasOwn(d, '@context'));
    if (contextless.length === docs.length && docs.length > 0) {
      out.push(p('jsonld-no-context', `JSON-LD block ${index + 1} declares no @context, so none of it is interpreted as Schema.org and it produces no report anywhere`, 'error'));
    }
  }

  // A duplicate can only be asserted for nodes that carry an identity. Two
  // anonymous nodes of the same type are usually two different things, and an
  // earlier version of this check collapsed them into one signature and
  // reported them as a duplicate. A false positive costs more than a missing
  // check, because it teaches the reader to ignore the checker.
  const signatures = parsed
    .map((x) => x.doc)
    .flatMap(collectNodes)
    .filter((node) => node.name || node['@id'])
    .map((node) => `${typesOf(node).join('/')}:${node.name || node['@id']}`);
  const duplicate = [...new Set(signatures.filter((s, i) => signatures.indexOf(s) !== i))];
  if (duplicate.length) {
    out.push(p('jsonld-duplicate-entity', `the same entity is declared twice: ${duplicate.join(', ')}`, 'warning'));
  }

  return out;
}

function jsonldGraph(html) {
  const $ = load(html);
  const out = [];
  const { parsed, broken } = parseBlocks($);
  if (broken) {
    return [p('jsonld-unparseable', 'a JSON-LD block did not parse, so the graph cannot be checked', 'error')];
  }
  const nodes = parsed.flatMap(collectNodes);

  const ids = nodes.map((n) => n['@id']).filter(Boolean);
  const defined = new Set(ids);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) out.push(p('jsonld-duplicate-id', `two nodes share @id ${id}`, 'error'));
    seen.add(id);
  }

  for (const node of nodes) {
    if (typesOf(node).some((t) => ENTITY_TYPES.includes(t)) && !node['@id']) {
      out.push(p('jsonld-entity-without-id', `a ${typesOf(node).join('/')} node has no @id, so nothing else can reference it`, 'warning'));
    }
    // A node with no @type is not an entity of any kind. It parses, it sits in
    // the graph, and every rule here and at Google skips it, so it is work
    // that produces nothing.
    if (typesOf(node).length === 0) {
      out.push(p('jsonld-node-without-type', `a node${node['@id'] ? ` with @id ${node['@id']}` : ''} declares no @type, so nothing treats it as an entity`, 'error'));
    }
  }

  /**
   * A nested object that restates a whole entity instead of pointing at one.
   *
   * The test is not simply that a nested node looks like an entity. Defining
   * an entity in place under publisher or author, with its own @id, is the
   * shape Google documents and recommends: the @id is what lets the rest of
   * the site reference it. The first version of this rule flagged that shape,
   * which made it a false positive on the correct answer.
   *
   * It is a restatement when the nested node carries no @id, so nothing can
   * ever reference it, or when its @id is also defined at the top level, so
   * the document describes one thing twice and the two copies can disagree.
   */
  const walk = (value, path) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach((v) => walk(v, path));
    const looksLikeEntity =
      path.length > 0 &&
      typesOf(value).some((t) => ENTITY_TYPES.includes(t)) &&
      Object.keys(value).length > 2;
    if (looksLikeEntity) {
      const id = value['@id'];
      const restated = !id || defined.has(id);
      if (restated) {
        out.push(p(
          'jsonld-inlined-entity',
          id
            ? `${path.join('.')} restates ${typesOf(value).join('/')} ${id}, which is already defined at the top level, so the document describes it twice`
            : `${path.join('.')} inlines a whole ${typesOf(value).join('/')} with no @id, so nothing can reference it`,
          'warning'
        ));
      }
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
      out.push(p('jsonld-dangling-reference', `@id ${ref} is referenced but never defined in the graph`, 'error'));
    }
  }

  return out;
}

function jsonldBreadcrumb(html) {
  const $ = load(html);
  const out = [];
  const pageUrl = pageUrlOf($);
  const { parsed, broken } = parseBlocks($);
  if (broken) return [p('jsonld-unparseable', 'a JSON-LD block did not parse', 'error')];
  const nodes = parsed.flatMap(collectNodes);

  const crumbs = nodes.filter((n) => typesOf(n).includes('BreadcrumbList'));
  if (crumbs.length === 0) return [p('breadcrumb-missing', 'the page declares no BreadcrumbList', 'warning')];

  /**
   * Two of the rules below compare the trail against the URL of the page the
   * trail is on, and the page states that URL in og:url or in its canonical.
   * When it states neither, those two rules cannot run.
   *
   * The refusal is the finding. Before it existed, a page with no canonical
   * and no og:url skipped both rules in silence and was reported clean, so two
   * of the seven breadcrumb rules could not fire and nothing said so. A reader
   * cannot tell a rule that passed from a rule that was never asked.
   */
  const pageUrlKnown = pageUrl !== '' && isAbsolute(pageUrl);
  if (!pageUrlKnown) {
    out.push(p('breadcrumb-page-url-unknown', 'the page states no og:url and no absolute canonical, so the trail cannot be compared against the URL it is on and two of the rules here were not run', 'note'));
  }

  const urlOf = (entry) =>
    typeof entry.item === 'string' ? entry.item : (entry.item && entry.item['@id']) || '';

  for (const list of crumbs) {
    const items = list.itemListElement || [];
    const positions = items.map((i) => i.position).join(',');
    const expected = items.map((_, i) => i + 1).join(',');
    if (positions !== expected) {
      out.push(p('breadcrumb-position-not-sequential', `positions are [${positions}] and should be [${expected}]`, 'error'));
    }

    items.forEach((entry, i) => {
      const url = urlOf(entry);
      const name = entry.name || (entry.item && entry.item.name);
      if (!name) out.push(p('breadcrumb-missing-name', `item ${i + 1} has no name`, 'error'));
      if (i < items.length - 1 && !url) {
        out.push(p('breadcrumb-missing-item-url', `item ${i + 1} has no URL, so the trail cannot be followed`, 'error'));
      }
      if (url && !isAbsolute(url)) {
        out.push(p('breadcrumb-relative-url', `item ${i + 1} uses the relative URL "${url}"`, 'error'));
      }
    });

    if (!pageUrlKnown) continue;

    const lastUrl = items.length ? urlOf(items[items.length - 1]) : '';
    if (lastUrl && trimSlash(lastUrl) !== trimSlash(pageUrl)) {
      out.push(p('breadcrumb-last-item-not-this-page', `the trail ends at ${lastUrl} but the page is ${pageUrl}`, 'error'));
    }

    if (items.length) {
      const depth = new URL(pageUrl).pathname.split('/').filter(Boolean).length;
      if (items.length !== depth + 1) {
        out.push(p('breadcrumb-depth-mismatch', `the URL has ${depth} path segments but the trail has ${items.length} items`, 'warning'));
      }
    }
  }

  return out;
}

// ------------------------------------------------------------------ sitemap

/**
 * The sitemap checker reads both kinds of file the protocol defines.
 *
 * It used to read one. A file whose root element was sitemapindex returned
 * immediately with no findings, so an index with a relative loc, an http loc,
 * a duplicate entry and an unparseable lastmod was reported completely clean.
 * That is the file most large sites actually submit, and every fault in it
 * costs a whole child sitemap rather than one URL, which is why the index
 * findings are their own ids rather than shared with the urlset ones.
 */
function sitemap(xml) {
  const out = [];
  const valid = XMLValidator.validate(xml);
  if (valid !== true) {
    return [p('sitemap-not-well-formed', `the XML does not parse: ${valid.err.msg} at line ${valid.err.line}`, 'error')];
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    isArray: (name) => name === 'url' || name === 'sitemap',
  });
  const doc = parser.parse(xml);

  if (doc.sitemapindex) return sitemapIndex(doc.sitemapindex, out);

  // A file that is neither a urlset nor a sitemap index used to produce zero
  // problems, because the URL loop simply iterated an empty list. A wrong root
  // element, a sitemap saved from the wrong template, or an HTML error page
  // served at the sitemap URL all landed in that hole and were reported clean.
  if (!doc.urlset) {
    const root = Object.keys(doc).find((k) => k !== '?xml') ?? 'nothing';
    return [p('sitemap-no-urlset', `the root element is <${root}>, so this is neither a urlset nor a sitemap index`, 'error')];
  }

  const urls = doc.urlset.url || [];
  if (urls.length > 50000) {
    out.push(p('sitemap-too-many-urls', `${urls.length} URLs; the limit is 50,000 per file`, 'error'));
  }
  if (urls.length === 0) {
    out.push(p('sitemap-empty', 'the urlset contains no url entries, so the file is submitted and says nothing', 'error'));
  }

  const seen = new Set();
  for (const [i, entry] of urls.entries()) {
    // An entry with no loc at all is not an entry with a relative loc, and the
    // first version reported it as one, with a message quoting an empty
    // element the file does not contain.
    if (entry.loc === undefined) {
      out.push(p('sitemap-url-without-loc', `url entry ${i + 1} has no loc element, so there is no URL to submit`, 'error'));
      continue;
    }
    const loc = String(entry.loc).trim();
    if (!isAbsolute(loc)) {
      out.push(p('sitemap-loc-relative', `<loc>${loc}</loc> is not an absolute URL`, 'error'));
    } else if (!isHttps(loc)) {
      out.push(p('sitemap-loc-non-https', `<loc>${loc}</loc> is http, so every entry costs a redirect`, 'warning'));
    }
    if (seen.has(loc)) out.push(p('sitemap-duplicate-loc', `${loc} is listed more than once`, 'warning'));
    seen.add(loc);

    if (entry.lastmod === undefined) {
      out.push(p('sitemap-lastmod-missing', `${loc} has no lastmod, the only per-URL hint in this file Google uses`, 'warning'));
    } else if (blank(entry.lastmod)) {
      out.push(p('sitemap-lastmod-empty', `${loc} has an empty lastmod element, which is what a template that found no date renders`, 'error'));
    } else {
      const lastmod = String(entry.lastmod).trim();
      if (!isW3CDatetime(lastmod)) {
        out.push(p('sitemap-lastmod-invalid', `lastmod "${lastmod}" is not a W3C datetime, so it is ignored`, 'error'));
      } else if (new Date(lastmod).getTime() > Date.now() + 86400000) {
        out.push(p('sitemap-lastmod-future', `lastmod "${lastmod}" is in the future`, 'warning'));
      }
    }

    if (entry.priority !== undefined || entry.changefreq !== undefined) {
      out.push(p('sitemap-priority-or-changefreq', `${loc} declares priority or changefreq; Google ignores both`, 'note'));
    }
  }

  return out;
}

function sitemapIndex(index, out) {
  const children = index.sitemap || [];
  if (children.length === 0) {
    out.push(p('sitemap-index-empty', 'the sitemap index lists no child sitemaps, so submitting it submits nothing', 'error'));
  }
  if (children.length > 50000) {
    out.push(p('sitemap-index-too-many-sitemaps', `${children.length} child sitemaps; the limit is 50,000 per index`, 'error'));
  }

  const seen = new Set();
  for (const [i, child] of children.entries()) {
    if (child.loc === undefined) {
      out.push(p('sitemap-index-without-loc', `sitemap entry ${i + 1} has no loc element, so one whole child sitemap has no address`, 'error'));
      continue;
    }
    const loc = String(child.loc).trim();
    if (!isAbsolute(loc)) {
      out.push(p('sitemap-index-loc-relative', `<loc>${loc}</loc> in the index is not an absolute URL, so a whole child sitemap is unreachable`, 'error'));
    } else if (!isHttps(loc)) {
      out.push(p('sitemap-index-loc-non-https', `<loc>${loc}</loc> in the index is http, so every child sitemap is fetched through a redirect`, 'warning'));
    }
    if (seen.has(loc)) {
      out.push(p('sitemap-index-duplicate-loc', `${loc} is listed more than once in the index`, 'warning'));
    }
    seen.add(loc);

    // lastmod matters more on an index entry than on a URL entry: it is how
    // Google decides whether to refetch a child sitemap at all, so an index
    // with no lastmod anywhere asks for every child to be refetched or for
    // none of them to be.
    if (child.lastmod === undefined) {
      out.push(p('sitemap-index-lastmod-missing', `${loc} has no lastmod, which is the signal that decides whether this child sitemap is refetched`, 'warning'));
    } else if (blank(child.lastmod)) {
      out.push(p('sitemap-index-lastmod-empty', `${loc} has an empty lastmod element in the index`, 'error'));
    } else {
      const lastmod = String(child.lastmod).trim();
      if (!isW3CDatetime(lastmod)) {
        out.push(p('sitemap-index-lastmod-invalid', `lastmod "${lastmod}" on ${loc} is not a W3C datetime, so it is ignored and the child is refetched on Google's own schedule`, 'error'));
      }
    }
  }

  return out;
}

// ------------------------------------------------------------------- robots

/**
 * A robots.txt path rule, as a matcher.
 *
 * Google supports two wildcards: * matches any run of characters and a
 * trailing $ anchors the end of the path. The first version of this checker
 * only stripped trailing asterisks and then compared with startsWith, so a
 * rule with a wildcard anywhere else was matched as a literal string and
 * therefore matched nothing at all.
 *
 * The consequence was specific and bad: Disallow: /*.css$ is the ordinary way
 * to block stylesheets and it is exactly what causes the most expensive
 * finding this checker has, so a site that blocked every stylesheet was
 * reported as blocking nothing.
 */
export const robotsRuleMatcher = (rule) => {
  let body = String(rule);
  let anchored = false;
  if (body.endsWith('$')) {
    anchored = true;
    body = body.slice(0, -1);
  }
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const re = new RegExp(`^${escaped}${anchored ? '$' : ''}`);
  return (pathname) => re.test(pathname);
};

// The manifest carries robots.txt plus the indexing directives of the pages it
// governs, because the most expensive fault in this area is only visible when
// both are in view at once.
function robots(body) {
  const site = JSON.parse(body);
  const out = [];
  const groups = [];
  const sitemaps = [];
  const unsupported = [];
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
    } else {
      unsupported.push({ key, value });
    }
  }

  if (!groups.some((g) => g.agents.includes('*'))) {
    out.push(p('robots-no-wildcard-group', 'there is no User-agent: * group, so most crawlers are given no rules', 'warning'));
  }
  if (sitemaps.length === 0) {
    out.push(p('robots-no-sitemap', 'robots.txt declares no Sitemap', 'warning'));
  }
  for (const url of sitemaps) {
    if (!isAbsolute(url)) {
      out.push(p('robots-sitemap-relative', `Sitemap: ${url} must be an absolute URL`, 'error'));
    }
  }

  // Two directives that are written in robots.txt and do nothing. They are
  // separate findings because the consequences are opposite: a Noindex line is
  // believed to be removing pages from the index and is not, which is the more
  // expensive misconception in this file by a wide margin, and a Crawl-delay
  // line is believed to be controlling request rate and is not.
  for (const { key } of unsupported) {
    if (key === 'noindex') {
      out.push(p('robots-noindex-directive', 'robots.txt carries a Noindex line; Google stopped supporting it in September 2019, so every URL it names is fully indexable and nothing reports that', 'error'));
    } else if (key === 'crawl-delay') {
      out.push(p('robots-crawl-delay', 'robots.txt carries a Crawl-delay line, which Google ignores; crawl rate is set in Search Console and nowhere else', 'note'));
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
    const d = disallows.filter((rule) => robotsRuleMatcher(rule)(pathname)).sort((a, b) => b.length - a.length)[0];
    if (!d) return false;
    const a = allows.filter((rule) => robotsRuleMatcher(rule)(pathname)).sort((x, y) => y.length - x.length)[0];
    return !(a && a.length >= d.length);
  };

  const pathOf = (url) => {
    try { return new URL(url).pathname; } catch { return url; }
  };

  for (const url of sitemaps) {
    if (isAbsolute(url) && blocked(pathOf(url))) {
      out.push(p('robots-blocks-own-sitemap', `${url} is disallowed by this same file`, 'error'));
    }
  }

  for (const page of site.pages || []) {
    if (!blocked(pathOf(page.url))) continue;
    if (/noindex/i.test(String(page.robots || ''))) {
      out.push(p('robots-disallow-hides-noindex', `${page.url} is Disallowed and carries noindex; the crawler cannot fetch it to read the noindex, so the URL can stay indexed with no description`, 'error'));
    }
    if (page.inSitemap) {
      out.push(p('robots-disallow-contradicts-sitemap', `${page.url} is Disallowed but submitted in the sitemap`, 'error'));
    }
    if (page.canonicalTarget) {
      out.push(p('robots-disallow-hides-canonical', `${page.url} is Disallowed, so its canonical to ${page.canonicalTarget} is never read`, 'error'));
    }
  }

  // Asset entries go through pathOf for the same reason page entries do: an
  // asset list is normally copied out of a browser network panel, so it arrives
  // as a full URL, and matching a full URL against a robots.txt path matches
  // nothing at all. Until this was fixed, the check passed every site whose
  // render assets were listed the way they are usually collected.
  //
  // The severity depends on what the asset is. A stylesheet or a script
  // changes what the rendered page contains, so blocking one changes what is
  // indexed. An image or a font changes how it looks and not what it says.
  // The id is the same because the fault is the same; the cost is not.
  for (const asset of site.renderAssets || []) {
    if (!blocked(pathOf(asset))) continue;
    const layout = /\.(css|js|mjs)(\?|$)/i.test(pathOf(asset));
    out.push(p(
      'robots-blocks-render-assets',
      layout
        ? `${asset} is Disallowed; blocking a stylesheet or a script changes what the rendered page contains`
        : `${asset} is Disallowed; blocking it changes how the page looks to the crawler but not what it says`,
      layout ? 'error' : 'warning'
    ));
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
    if (bySource.has(rule.from)) out.push(p('redirect-duplicate-source', `${rule.from} is mapped twice`, 'error'));
    bySource.set(rule.from, rule);
  }

  for (const rule of rules) {
    if (!isAbsolute(rule.to) && !String(rule.to).startsWith('/')) {
      out.push(p('redirect-relative-target', `${rule.from} points at "${rule.to}", which is neither absolute nor root-relative`, 'error'));
    }
    if (rule.from === rule.to) {
      out.push(p('redirect-to-self', `${rule.from} redirects to itself`, 'error'));
      continue;
    }

    // A rule that records no status is a rule that cannot be judged, and the
    // first version judged it anyway: it reported the rule as a temporary
    // redirect and put the word undefined in the message where the status code
    // belonged. The refusal is the finding. A map is machine generated often
    // enough that a missing field means the export dropped it, which is worth
    // knowing on its own.
    if (rule.status === undefined || rule.status === null) {
      out.push(p('redirect-status-missing', `${rule.from} records no status, so whether this is a permanent move cannot be answered from the map`, 'warning'));
    } else if (!(Number(rule.status) >= 300 && Number(rule.status) < 400)) {
      out.push(p('redirect-status-not-a-redirect', `${rule.from} records status ${rule.status}, which is not a redirect at all`, 'error'));
    } else if (map.permanent !== false && Number(rule.status) !== 301 && Number(rule.status) !== 308) {
      out.push(p('redirect-temporary-for-permanent-move', `${rule.from} uses ${rule.status}; a move that is not coming back should be 301`, 'warning'));
    }

    const path = [rule.from];
    let cursor = rule.to;
    let looped = false;
    while (bySource.has(cursor)) {
      if (path.includes(cursor)) {
        out.push(p('redirect-loop', `${path.join(' to ')} to ${cursor} never terminates`, 'error'));
        looped = true;
        break;
      }
      path.push(cursor);
      cursor = bySource.get(cursor).to;
    }
    if (!looped && path.length > 1) {
      // Two hops is a redirect that should be collapsed. Three or more is a
      // chain long enough that Google stops following it, which is a different
      // outcome from a slow one, so the two are not the same severity.
      out.push(p(
        'redirect-chain',
        `${path.join(' then ')} then ${cursor} costs ${path.length} hops; point the first straight at the last`,
        path.length >= 3 ? 'error' : 'warning'
      ));
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
