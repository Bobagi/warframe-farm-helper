'use strict';

/**
 * Índice de busca em memória (MiniSearch) sobre itens + componentes +
 * relíquias + artigos. Fuzzy + prefixo + sem acentos → tolera erro de
 * digitação e mistura PT/EN. Reconstruído no boot e após cada ingestão.
 */

const MiniSearch = require('minisearch');
const { stripDiacritics, COMMON_RESOURCES } = require('./util');
const { getDb, getMeta } = require('./db');

const CDN_IMG = 'https://cdn.warframestat.us/img/';

const KIND_BOOST = {
  item: 1.25, component: 1.2, relic: 1.1,
  faq: 1.4, nightwave: 1.3, mod: 1.0, resource: 1.15,
  gear: 1.2, quest: 1.25, arcane: 1.15, fish: 1.05,
};

const CATEGORY_KIND = {
  Mods: 'mod', Resources: 'resource', Fish: 'fish',
  Gear: 'gear', Quests: 'quest', Arcanes: 'arcane',
};
// só itens com componentes/drops geram sub-documentos de componente
const HAS_COMPONENTS = new Set(['item', 'gear']);

let mini = null;
let docCount = 0;
let lastIngestSeen = null;

const processTerm = (term) => {
  const t = stripDiacritics(String(term).toLowerCase());
  return t.length > 1 ? t : null;
};

const tokensOf = (q) =>
  stripDiacritics(String(q).toLowerCase()).split(/[^a-z0-9]+/).filter((t) => t.length > 1);

const compSlug = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-');

function buildDocs() {
  const db = getDb();
  const docs = [];
  const seen = new Set();
  const push = (doc) => {
    if (seen.has(doc.id)) return; // dados do WFCD têm componentes duplicados (ex.: Akfuris → 2× Furis)
    seen.add(doc.id);
    docs.push(doc);
  };

  const items = db.prepare(
    'SELECT unique_name, name, name_pt, category, type, image_name, raw FROM items'
  ).all();
  // nomes que já são itens próprios (recursos: Morphics, Orokin Cell, plantas…)
  // — não devem virar "componente" de outro item na busca
  const itemNames = new Set(items.map((i) => i.name));
  for (const it of items) {
    const kind = CATEGORY_KIND[it.category] || 'item';
    const url = `/item.html?u=${encodeURIComponent(it.unique_name)}`;
    push({
      id: `i:${it.unique_name}`, kind,
      name: it.name, namePt: it.name_pt || '', alt: it.name_pt || '',
      sub: it.type || it.category,
      image: it.image_name ? CDN_IMG + it.image_name : null,
      url,
    });
    if (!HAS_COMPONENTS.has(kind)) continue;
    let raw = null;
    try { raw = JSON.parse(it.raw); } catch { /* ignora raw corrompido */ }
    const comps = raw && Array.isArray(raw.components) ? raw.components : [];
    for (const c of comps) {
      // pula o blueprint principal e ingredientes que já são itens próprios
      // (Morphics, Orokin Cell, plantas…) — só peças de fato (Stock, Barrel,
      // Neuroptics…) viram documento de componente
      if (!c.name || c.name === 'Blueprint' || itemNames.has(c.name) || COMMON_RESOURCES.has(c.name)) continue;
      const full = c.name.includes(it.name) ? c.name : `${it.name} ${c.name}`;
      const fullPt = it.name_pt ? full.replace(it.name, it.name_pt) : '';
      push({
        id: `c:${it.unique_name}::${c.name}`, kind: 'component',
        name: full, namePt: fullPt, alt: '',
        sub: `Componente de ${it.name_pt || it.name}`,
        image: c.imageName ? CDN_IMG + c.imageName : null,
        url: `${url}#c-${compSlug(c.name)}`,
      });
    }
  }

  const relics = db.prepare('SELECT name, vaulted FROM relics').all();
  for (const r of relics) {
    push({
      id: `r:${r.name}`, kind: 'relic',
      name: `${r.name} Relic`, namePt: `Relíquia ${r.name}`, alt: `Relíquia ${r.name}`,
      sub: r.vaulted ? 'vaulted' : 'available',
      image: null,
      url: `/relic.html?n=${encodeURIComponent(r.name)}`,
    });
  }

  const arts = db.prepare('SELECT slug, kind, title, keywords FROM articles').all();
  for (const a of arts) {
    // artigos são conteúdo escrito em PT (mesmo título nos dois idiomas)
    push({
      id: `a:${a.slug}`, kind: a.kind,
      name: a.title, namePt: a.title, alt: a.keywords || '',
      sub: a.kind === 'faq' ? 'faq' : 'nightwave',
      image: null,
      url: a.kind === 'faq'
        ? `/faq.html?slug=${encodeURIComponent(a.slug)}`
        : `/nightwave.html?slug=${encodeURIComponent(a.slug)}`,
    });
  }

  return docs;
}

function buildIndex() {
  const docs = buildDocs();
  const ms = new MiniSearch({
    fields: ['name', 'alt'],
    storeFields: ['kind', 'name', 'namePt', 'sub', 'image', 'url'],
    processTerm,
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
      boost: { name: 3 },
      boostDocument: (id, term, stored) => (stored && KIND_BOOST[stored.kind]) || 1,
    },
  });
  ms.addAll(docs);
  mini = ms;
  docCount = docs.length;
  lastIngestSeen = getMeta(getDb(), 'last_ingest');
  return docCount;
}

/** Reindexa se uma ingestão nova aconteceu (ex.: `npm run ingest` manual). */
function maybeReindex() {
  const current = getMeta(getDb(), 'last_ingest');
  if (current && current !== lastIngestSeen) {
    const n = buildIndex();
    console.log(`[search] reindexado após ingestão (${n} documentos)`);
  }
}

function toResult(r) {
  return {
    kind: r.kind, name: r.name, namePt: r.namePt || '', sub: r.sub, image: r.image, url: r.url,
    score: Math.round(r.score * 10) / 10,
  };
}

/**
 * Corta a cauda de matches fracos (OR) que só bateram num termo comum e
 * poluem o resultado — mantém quem tem score dentro de uma fração do topo.
 */
function trimTail(res) {
  if (res.length <= 1) return res;
  const top = res[0].score || 0;
  const floor = top * 0.28;
  return res.filter((r) => (r.score || 0) >= floor);
}

/**
 * Busca local. `strong=false` sinaliza resultado fraco/vazio → o chamador
 * aciona o fallback de busca web.
 */
function searchLocal(q, limit = 20) {
  if (!mini) return { results: [], strong: false };
  let res = mini.search(q, { combineWith: 'AND' });
  let combined = 'AND';
  if (!res.length) {
    res = mini.search(q, { combineWith: 'OR' });
    combined = 'OR';
  }
  let strong = false;
  if (res.length) {
    if (combined === 'AND') {
      strong = true;
    } else {
      const toks = tokensOf(q);
      const ratio = toks.length ? (res[0].terms || []).length / toks.length : 0;
      strong = ratio >= 0.6;
    }
  }
  return { results: trimTail(res).slice(0, limit).map(toResult), strong };
}

function suggest(q, limit = 8) {
  if (!mini) return [];
  const res = mini.search(q, { combineWith: 'AND' });
  const out = res.length ? res : mini.search(q, { combineWith: 'OR' });
  return trimTail(out).slice(0, limit).map(toResult);
}

function stats() {
  return { docs: docCount, lastIngestSeen };
}

module.exports = { buildIndex, maybeReindex, searchLocal, suggest, stats, tokensOf, trimTail };
