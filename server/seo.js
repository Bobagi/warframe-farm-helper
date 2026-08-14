'use strict';

/**
 * SEO server-side: URLs bonitas (/item/<slug>, /relic/<slug>, /faq/<slug>,
 * /nightwave/<slug>), injeção de <title>/description/canonical/Open Graph/
 * JSON-LD nos templates estáticos e sitemap.xml dinâmico.
 *
 * Núcleo em funções PURAS (slugify/assignSlugs/injectHead/buildSitemapXml…)
 * para os testes não dependerem do banco; a cola com o SQLite fica nos
 * wrappers (rebuild/itemForSlug/render*Page/sitemapXml).
 *
 * Segurança: TODO texto que entra em HTML/XML passa por escapeHtml/escapeXml -
 * nomes de item e artigos vêm de dados EXTERNOS (WFCD/wiki), nunca confiar.
 */

const fs = require('node:fs');
const path = require('node:path');
const { getDb, getMeta } = require('./db');
const { stripDiacritics, escapeHtml, CATEGORY_KIND } = require('./util');

const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://warframe.bobagi.space';
const CDN_IMG = 'https://cdn.warframestat.us/img/';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const OG_IMAGE = `${SITE_ORIGIN}/og-banner.png`;

// rótulo PT por categoria do WFCD - usado em descriptions e no bloco SSR
const CATEGORY_EN = {
  Mods: 'Mod', Resources: 'Resource', Melee: 'Melee weapon',
  Primary: 'Primary weapon', Secondary: 'Secondary weapon', Warframes: 'Warframe',
  Arcanes: 'Arcano', Fish: 'Peixe', Pets: 'Companheiro', Quests: 'Quest',
  Gear: 'Equipamento', Railjack: 'Railjack', Misc: 'Item',
  SentinelWeapons: 'Arma de sentinela', Sentinels: 'Sentinela',
  'Arch-Gun': 'Arch-Gun', 'Arch-Melee': 'Arch-Melee', Archwing: 'Archwing',
};

// ---------------------------------------------------------------------------
// núcleo puro
// ---------------------------------------------------------------------------

const escapeXml = escapeHtml; // mesmo conjunto de entidades cobre XML 1.0

/**
 * URL segura para um `href` renderizado no servidor: só http/https passa.
 * `escapeHtml` neutraliza aspas/tags mas NÃO o esquema - um `wiki_url` do
 * dataset externo (WFCD) valendo `javascript:...` viraria href executável
 * (a CSP script-src 'self' já bloquearia a execução, mas sanitizamos na
 * origem, como a ingestão de markdown faz). Esquema perigoso → null (sem link).
 */
function safeHttpUrl(url) {
  const s = String(url || '').trim();
  return /^https?:\/\//i.test(s) ? s : null;
}

/** "Apótico do Anoitecer" → "apotico-do-anoitecer" */
function slugify(name) {
  return stripDiacritics(String(name || '').toLowerCase())
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Atribui um slug único a cada item. `rows` DEVE vir em ordem estável
 * (ORDER BY name, unique_name): nomes duplicados (o dataset tem ~200) ganham
 * sufixo -2, -3… de forma determinística entre reinícios/ingestões.
 */
function assignSlugs(rows) {
  const byUnique = new Map();
  const bySlug = new Map();
  for (const r of rows) {
    let slug = slugify(r.name) || 'item';
    if (bySlug.has(slug)) {
      let n = 2;
      while (bySlug.has(`${slug}-${n}`)) n += 1;
      slug = `${slug}-${n}`;
    }
    byUnique.set(r.unique_name, slug);
    bySlug.set(slug, r.unique_name);
  }
  return { byUnique, bySlug };
}

/**
 * Página canônica por (kind + nome sem acento): o MESMO critério de dedup da
 * busca (search.js), para o canonical apontar exatamente para a página que a
 * busca linka. Itens "gêmeos" (uniqueNames diferentes, mesmo nome) apontam o
 * canonical para o primeiro da ordem estável - o Google consolida neles.
 */
function assignCanonicals(rows) {
  const canonicalByUnique = new Map();
  const firstByKey = new Map();
  for (const r of rows) {
    const kind = CATEGORY_KIND[r.category] || 'item';
    const key = `${kind}::${stripDiacritics(String(r.name).toLowerCase())}`;
    if (!firstByKey.has(key)) firstByKey.set(key, r.unique_name);
    canonicalByUnique.set(r.unique_name, firstByKey.get(key));
  }
  return canonicalByUnique;
}

/** HTML de artigo/descrição → texto puro de uma linha (p/ meta description). */
function stripTags(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Corta em limite de chars sem quebrar palavra (p/ meta description). */
function truncate(text, max = 158) {
  const s = String(text || '');
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${cut.slice(0, sp > 40 ? sp : cut.length)}…`;
}

/**
 * Injeta metadados no <head> de um template:
 *  - substitui o <title>. Por padrão remove o data-i18n (páginas de item/relíquia/
 *    artigo têm título específico que o cliente reescreve via document.title após o
 *    fetch). Se `meta.titleI18n` vier, MANTÉM um data-i18n=<chave> - usado nos
 *    ÍNDICES (/faq, /nightwave), que o cliente não reescreve: assim o crawler lê o
 *    título rico (SSR) e o cliente JS relocaliza a aba para en/es/ru;
 *  - substitui a <meta name="description"> (ou insere se não houver);
 *  - insere canonical + Open Graph/Twitter + JSON-LD antes do </head>.
 * Tudo escapado - os valores vêm de dados externos. Os .replace() usam FUNÇÃO de
 * substituição (não string) para que `$&`/`$'`/`$$`/`` $` `` num nome de item ou
 * artigo do WFCD sejam inseridos literalmente, nunca interpretados como padrão.
 */
function injectHead(html, meta) {
  let out = html;
  if (meta.title) {
    const attr = meta.titleI18n ? ` data-i18n="${escapeHtml(meta.titleI18n)}"` : '';
    out = out.replace(/<title\b[^>]*>[\s\S]*?<\/title>/, () => `<title${attr}>${escapeHtml(meta.title)}</title>`);
  }
  if (meta.description) {
    const tag = `<meta name="description" content="${escapeHtml(meta.description)}">`;
    out = /<meta name="description"/.test(out)
      ? out.replace(/<meta name="description"[^>]*>/, () => tag)
      : out.replace('</head>', () => `  ${tag}\n</head>`);
  }
  const parts = [];
  if (meta.robots) parts.push(`<meta name="robots" content="${escapeHtml(meta.robots)}">`);
  if (meta.canonical) {
    const canon = meta.canonical.startsWith('http') ? meta.canonical : SITE_ORIGIN + meta.canonical;
    parts.push(`<link rel="canonical" href="${escapeHtml(canon)}">`);
    parts.push(`<meta property="og:url" content="${escapeHtml(canon)}">`);
  }
  if (meta.title) {
    parts.push(`<meta property="og:title" content="${escapeHtml(meta.title)}">`);
    parts.push(`<meta name="twitter:title" content="${escapeHtml(meta.title)}">`);
  }
  if (meta.description) {
    parts.push(`<meta property="og:description" content="${escapeHtml(meta.description)}">`);
    parts.push(`<meta name="twitter:description" content="${escapeHtml(meta.description)}">`);
  }
  parts.push(`<meta property="og:type" content="${escapeHtml(meta.ogType || 'website')}">`);
  parts.push('<meta property="og:site_name" content="Warframe Farm Helper">');
  parts.push('<meta property="og:locale" content="pt_BR">');
  const img = meta.ogImage || OG_IMAGE;
  parts.push(`<meta property="og:image" content="${escapeHtml(img)}">`);
  parts.push(`<meta name="twitter:card" content="${meta.ogImage ? 'summary' : 'summary_large_image'}">`);
  parts.push(`<meta name="twitter:image" content="${escapeHtml(img)}">`);
  if (meta.jsonLd) {
    // "<" escapado impede fechar a tag <script> por dentro do JSON
    const json = JSON.stringify(meta.jsonLd).replace(/</g, '\\u003c');
    parts.push(`<script type="application/ld+json">${json}</script>`);
  }
  return out.replace('</head>', () => `${parts.map((p) => `  ${p}`).join('\n')}\n</head>`);
}

/** Injeta atributos data-* no <body> (como o cliente descobre o recurso). */
function injectBodyData(html, attrs) {
  const pairs = Object.entries(attrs || {})
    .map(([k, v]) => `data-${k}="${escapeHtml(v)}"`).join(' ');
  return pairs ? html.replace('<body>', () => `<body ${pairs}>`) : html;
}

/** Substitui o marcador <!-- ssr:content --> pelo bloco pré-renderizado. */
function injectContent(html, ssrHtml) {
  return ssrHtml ? html.replace('<!-- ssr:content -->', () => ssrHtml) : html;
}

/** Monta o sitemap a partir de [{loc, lastmod?, changefreq?, priority?}]. */
function buildSitemapXml(entries) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
  for (const e of entries) {
    const loc = e.loc.startsWith('http') ? e.loc : SITE_ORIGIN + e.loc;
    lines.push('  <url>');
    lines.push(`    <loc>${escapeXml(loc)}</loc>`);
    if (e.lastmod) lines.push(`    <lastmod>${escapeXml(e.lastmod)}</lastmod>`);
    if (e.changefreq) lines.push(`    <changefreq>${e.changefreq}</changefreq>`);
    if (e.priority) lines.push(`    <priority>${e.priority}</priority>`);
    lines.push('  </url>');
  }
  lines.push('</urlset>');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// estado (mapas de slug) + cola com o banco
// ---------------------------------------------------------------------------

let slugByUnique = new Map();
let uniqueBySlug = new Map();
let canonicalByUnique = new Map();
let lastIngestSeen = null;
let cachedSitemap = null;

function rebuild() {
  const db = getDb();
  const rows = db.prepare(
    'SELECT unique_name, name, category FROM items ORDER BY name, unique_name'
  ).all();
  const { byUnique, bySlug } = assignSlugs(rows);
  slugByUnique = byUnique;
  uniqueBySlug = bySlug;
  canonicalByUnique = assignCanonicals(rows);
  lastIngestSeen = getMeta(db, 'last_ingest');
  cachedSitemap = null;
  return rows.length;
}

/** Reconstrói os mapas se uma ingestão nova aconteceu (barato: 1 SELECT meta). */
function ensureFresh() {
  const current = getMeta(getDb(), 'last_ingest');
  if (slugByUnique.size === 0 || (current && current !== lastIngestSeen)) rebuild();
}

/**
 * URL bonita de um item; cai na URL legada se o mapa não conhecer o unique.
 * Garante o índice montado: quem chama daqui (materiais de pesquisa, "usado
 * para construir") pode ser o PRIMEIRO acesso do processo, e sem isto todo
 * link sairia na forma legada `/item.html?u=` até alguém abrir uma página SSR.
 */
function itemUrl(uniqueName) {
  ensureFresh();
  const slug = slugByUnique.get(uniqueName);
  return slug ? `/item/${slug}` : `/item.html?u=${encodeURIComponent(uniqueName)}`;
}

const relicUrl = (name) => `/relic/${slugify(name)}`;
const articleUrl = (kind, slug) => (kind === 'faq' ? `/faq/${slug}` : `/nightwave/${slug}`);

function itemForSlug(slug) {
  ensureFresh();
  const u = uniqueBySlug.get(String(slug || '').toLowerCase());
  if (!u) return null;
  return getDb().prepare(
    'SELECT unique_name, name, name_pt, name_zh, category, type, image_name, vaulted, wiki_url, raw FROM items WHERE unique_name = ?'
  ).get(u);
}

function relicForSlug(slug) {
  const s = String(slug || '').toLowerCase();
  if (!/^[a-z0-9-]{3,40}$/.test(s)) return null;
  return getDb().prepare(
    "SELECT name, tier, code, vaulted, rewards FROM relics WHERE LOWER(REPLACE(name, ' ', '-')) = ?"
  ).get(s);
}

function articleForSlug(kind, slug) {
  const s = String(slug || '').slice(0, 120);
  if (!/^[a-z0-9-]+$/.test(s)) return null;
  return getDb().prepare(
    "SELECT slug, kind, title, html FROM articles WHERE slug = ? AND kind = ? AND lang = 'pt'"
  ).get(s, kind);
}

// ---------------------------------------------------------------------------
// templates + páginas SSR
// ---------------------------------------------------------------------------

const tplCache = new Map();
function template(file) {
  if (!tplCache.has(file)) {
    tplCache.set(file, fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8'));
  }
  return tplCache.get(file);
}

const safeParse = (s) => { try { return JSON.parse(s); } catch { return {}; } };

/** Título/descrição/JSON-LD de um item (puro dado o row - testável). */
function itemMeta(row, canonicalSlug) {
  const raw = safeParse(row.raw);
  // Título e <h1> usam o nome CANÔNICO em inglês, que é o que a comunidade
  // busca. Os nomes localizados não somem: entram no corpo do SSR como "also
  // known as", que dá cauda longa sem poluir o title.
  const display = row.name;
  const alsoKnown = [row.name_pt, row.name_zh].filter((n) => n && n !== row.name);
  const isPrime = / Prime( |$)/.test(row.name);
  const cat = CATEGORY_EN[row.category] || row.category;
  // O título segue o padrão de busca REAL que o Search Console mostra chegando
  // aqui ("where to farm X", "how to get X", "X farm"), todas em inglês.
  const title = `Where to farm ${display} · Warframe Farm Helper`;
  const description = truncate(isPrime
    ? `How to farm ${display} in Warframe: which relics drop each part, available vs vaulted, intact and radiant chances, ducats, crafting cost and a step by step.`
    : `Where to get ${display} in Warframe: drop locations with official chances, clan research and vendors, crafting cost and a step by step. ${cat}.`);
  const canonical = `/item/${canonicalSlug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: row.name, item: SITE_ORIGIN + canonical },
    ],
  };
  return {
    title,
    description,
    canonical,
    ogType: 'article',
    ogImage: raw.imageName ? CDN_IMG + raw.imageName : null,
    jsonLd,
    display,
    alsoKnown,
    categoryEn: cat,
    descriptionEn: raw.description || '',
    image: raw.imageName ? CDN_IMG + raw.imageName : null,
  };
}

/** Bloco de conteúdo pré-renderizado do item (o que um crawler sem JS vê). */
function itemSsrBlock(row, meta) {
  const parts = ['<section class="hero" style="padding-top:8px">'];
  parts.push(`<h1>${escapeHtml(meta.display)}</h1>`);
  const status = row.vaulted === 1 ? ' · Vaulted' : row.vaulted === 0 ? ' · Available' : '';
  parts.push(`<p class="lead">${escapeHtml(meta.categoryEn)}${row.type && row.type !== row.category ? ` · ${escapeHtml(row.type)}` : ''}${status}</p>`);
  if (meta.image) {
    parts.push(`<img src="${escapeHtml(meta.image)}" alt="${escapeHtml(row.name)}" width="128" height="128" loading="lazy" style="image-rendering:auto">`);
  }
  if (meta.alsoKnown && meta.alsoKnown.length) {
    parts.push(`<p class="small">Also known as: ${escapeHtml(meta.alsoKnown.join(' · '))}</p>`);
  }
  if (meta.descriptionEn) parts.push(`<p class="desc">${escapeHtml(meta.descriptionEn)}</p>`);
  const wiki = safeHttpUrl(row.wiki_url);
  if (wiki) parts.push(`<p class="small"><a href="${escapeHtml(wiki)}" rel="noopener">Wiki page</a></p>`);
  parts.push('</section>');
  const acq = acquisitionSsr(row.name);
  if (acq) parts.push(acq);
  return parts.join('\n      ');
}

/**
 * "Como conseguir" no HTML SSR: pesquisa no Dojo e vendedores. É a informação
 * que o crawler (e a IA que lê a página sem JS) mais precisa e que não está em
 * lugar nenhum do dataset de drop. Só texto, sem link externo montado a partir
 * de dado do banco.
 */
function acquisitionSsr(name) {
  // require preguiçoso de propósito: acquisition.js importa `itemUrl` DAQUI, e
  // um require no topo fecharia um ciclo (um dos dois receberia `{}`)
  const { getAcquisition } = require('./acquisition');
  const map = getAcquisition(getDb(), [name]);
  const a = map.get(name);
  if (!a) return null;
  const parts = ['<section class="panel panel-acq"><h2 class="eyebrow">How to get it</h2>'];
  if (a.research) {
    const r = a.research;
    const mats = r.resources.map((m) => `${m.count}x ${m.name}`).join(', ');
    const bits = [
      r.lab ? `Researched in the ${r.lab} at the clan Dojo` : 'Clan Dojo research',
      r.credits != null ? `${r.credits.toLocaleString('en-US')} credits` : null,
      mats || null,
      r.prereq ? `requires ${r.prereq} researched first` : null,
    ].filter(Boolean);
    parts.push(`<p>${escapeHtml(bits.join(' · '))}.</p>`);
  }
  if (a.vendors.length) {
    parts.push('<h3>Where to buy</h3><ul>');
    for (const v of a.vendors.slice(0, 8)) {
      parts.push(`<li>${escapeHtml(`${v.vendor}: ${v.cost.toLocaleString('pt-BR')} ${v.currency || ''}`.trim())}</li>`);
    }
    parts.push('</ul>');
  }
  if (a.market) {
    const bits = [
      a.market.platinum != null ? `${a.market.platinum} platinum for the finished item` : null,
      a.market.blueprintCredits != null
        ? `${a.market.blueprintCredits.toLocaleString('en-US')} credits for the blueprint` : null,
    ].filter(Boolean);
    if (bits.length) parts.push(`<p>In-game Market: ${escapeHtml(bits.join(', '))}.</p>`);
  }
  parts.push('</section>');
  return parts.join('\n      ');
}

function renderItemPage(slug) {
  const row = itemForSlug(slug);
  if (!row) return null;
  const canonicalUnique = canonicalByUnique.get(row.unique_name) || row.unique_name;
  const canonicalSlug = slugByUnique.get(canonicalUnique) || slug;
  const meta = itemMeta(row, canonicalSlug);
  let html = injectHead(template('item.html'), meta);
  html = injectBodyData(html, { 'item-u': row.unique_name });
  return injectContent(html, itemSsrBlock(row, meta));
}

/** Bloco SSR da relíquia: recompensas Intact visíveis para crawlers. */
function relicSsrBlock(row) {
  const rewards = safeParse(row.rewards);
  const intact = Array.isArray(rewards.Intact) ? rewards.Intact : [];
  const parts = ['<section class="hero" style="padding-top:8px">'];
  parts.push(`<h1>${escapeHtml(row.name)} Relic</h1>`);
  parts.push(`<p class="lead">${escapeHtml(row.tier)} tier · ${row.vaulted ? 'Vaulted (no longer drops in missions)' : 'Available - drops in missions'}</p>`);
  if (intact.length) {
    parts.push('<h2 class="eyebrow">Recompensas (Intact)</h2><ul class="rowlist">');
    for (const rw of intact) {
      parts.push(`<li class="row"><span class="grow name small">${escapeHtml(rw.name)}</span><span class="num small">${escapeHtml(String(rw.chance))}%</span></li>`);
    }
    parts.push('</ul>');
  }
  parts.push('</section>');
  return parts.join('\n      ');
}

function renderRelicPage(slug) {
  const row = relicForSlug(slug);
  if (!row) return null;
  const meta = {
    title: `${row.name} Relic drops and rewards · Warframe Farm Helper`,
    description: truncate(`What the ${row.name} relic drops in Warframe, reward by reward and refinement by refinement (Intact to Radiant), the chance of each part, and where the relic itself drops.`),
    canonical: relicUrl(row.name),
    ogType: 'article',
  };
  let html = injectHead(template('relic.html'), meta);
  html = injectBodyData(html, { 'relic-name': row.name });
  return injectContent(html, relicSsrBlock(row));
}

/** Página de artigo (FAQ/guia de Nightwave) com o CONTEÚDO completo no HTML. */
function renderArticlePage(kind, slug) {
  const art = articleForSlug(kind, slug);
  if (!art) return null;
  const text = stripTags(art.html);
  const meta = {
    title: `${art.title} · Warframe Farm Helper`,
    description: truncate(text),
    canonical: articleUrl(kind, art.slug),
    ogType: 'article',
  };
  const tpl = kind === 'faq' ? 'faq.html' : 'nightwave.html';
  let html = injectHead(template(tpl), meta);
  html = injectBodyData(html, { 'art-slug': art.slug });
  // o html do artigo já foi SANITIZADO na ingestão (markdown do repo);
  // título re-escapado aqui por segurança
  const ssr = [
    '<article class="panel article">',
    `<h1>${escapeHtml(art.title)}</h1>`,
    art.html,
    '</article>',
  ].join('\n');
  return injectContent(html, ssr);
}

/** Lista do FAQ com JSON-LD FAQPage (perguntas+respostas completas do banco). */
function renderFaqIndex() {
  const rows = getDb().prepare(
    "SELECT slug, title, html FROM articles WHERE kind = 'faq' AND lang = 'pt' ORDER BY sort, title"
  ).all();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: rows.map((r) => ({
      '@type': 'Question',
      name: r.title,
      url: SITE_ORIGIN + articleUrl('faq', r.slug),
      acceptedAnswer: { '@type': 'Answer', text: truncate(stripTags(r.html), 1200) },
    })),
  };
  return injectHead(template('faq.html'), {
    title: 'Warframe FAQ · game mechanics explained',
    titleI18n: 'title.faq', // índice: cliente relocaliza a aba (en/es/ru); crawler lê o título rico
    description: 'Warframe game mechanics explained: Helminth, inventory slots, void relics, ducats and Baro, Forma, how to get platinum, vaulted primes and more.',
    canonical: '/faq',
    jsonLd,
  });
}

/** Lista de guias do Nightwave (canonical limpo). */
function renderNightwaveIndex() {
  return injectHead(template('nightwave.html'), {
    title: 'Warframe Nightwave · this week acts and guides',
    titleI18n: 'title.nightwave', // índice: cliente relocaliza a aba (en/es/ru); crawler lê o título rico
    description: 'Active Warframe Nightwave acts with a guide on how to complete each one: Forward Artillery on a Crewship, Duviri enigmas, Eximus, Kuva Siphon and more.',
    canonical: '/nightwave',
  });
}

/** Template cru com noindex (fallback das URLs legadas sem recurso conhecido). */
function renderNoindex(file) {
  return injectHead(template(file), { robots: 'noindex' });
}

// ---------------------------------------------------------------------------
// sitemap
// ---------------------------------------------------------------------------

function sitemapXml() {
  ensureFresh();
  if (cachedSitemap) return cachedSitemap;
  const db = getDb();
  const lastmod = String(getMeta(db, 'last_ingest') || new Date().toISOString()).slice(0, 10);
  const entries = [
    { loc: '/', lastmod, changefreq: 'daily', priority: '1.0' },
    { loc: '/fissuras', lastmod, changefreq: 'hourly', priority: '0.8' },
    { loc: '/faq', lastmod, changefreq: 'weekly', priority: '0.8' },
    { loc: '/nightwave', lastmod, changefreq: 'daily', priority: '0.8' },
    { loc: '/buscar', lastmod, changefreq: 'weekly', priority: '0.5' },
  ];
  // itens: só a página CANÔNICA de cada (kind+nome) - gêmeos ficam de fora
  const rows = db.prepare(
    'SELECT unique_name, name, category FROM items ORDER BY name, unique_name'
  ).all();
  for (const r of rows) {
    if ((canonicalByUnique.get(r.unique_name) || r.unique_name) !== r.unique_name) continue;
    const slug = slugByUnique.get(r.unique_name);
    if (slug) entries.push({ loc: `/item/${slug}`, lastmod, changefreq: 'weekly', priority: '0.7' });
  }
  for (const r of db.prepare('SELECT name FROM relics ORDER BY name').all()) {
    entries.push({ loc: relicUrl(r.name), lastmod, changefreq: 'weekly', priority: '0.5' });
  }
  for (const a of db.prepare("SELECT slug, kind FROM articles WHERE lang = 'pt' ORDER BY kind, slug").all()) {
    entries.push({ loc: articleUrl(a.kind, a.slug), lastmod, changefreq: 'monthly', priority: '0.7' });
  }
  cachedSitemap = buildSitemapXml(entries);
  return cachedSitemap;
}

module.exports = {
  SITE_ORIGIN,
  // núcleo puro (testável sem banco)
  slugify, assignSlugs, assignCanonicals, stripTags, truncate,
  injectHead, injectBodyData, injectContent, buildSitemapXml, itemMeta,
  escapeXml, safeHttpUrl,
  // cola com o banco / páginas
  rebuild, ensureFresh, itemUrl, relicUrl, articleUrl,
  itemForSlug, relicForSlug, articleForSlug,
  renderItemPage, renderRelicPage, renderArticlePage,
  renderFaqIndex, renderNightwaveIndex, renderNoindex,
  sitemapXml,
};
