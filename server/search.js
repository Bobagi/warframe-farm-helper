'use strict';

/**
 * Índice de busca em memória (MiniSearch) sobre itens + componentes +
 * relíquias + artigos. Fuzzy + prefixo + sem acentos → tolera erro de
 * digitação e mistura PT/EN. Reconstruído no boot e após cada ingestão.
 */

const MiniSearch = require('minisearch');
const { stripDiacritics } = require('./util');
const { getDb, getMeta } = require('./db');

const CDN_IMG = 'https://cdn.warframestat.us/img/';

const KIND_BOOST = {
  item: 1.25, component: 1.2, relic: 1.1,
  faq: 1.4, nightwave: 1.3, mod: 1.0, resource: 1.15,
};

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
  for (const it of items) {
    const kind = it.category === 'Mods' ? 'mod' : it.category === 'Resources' ? 'resource' : 'item';
    const url = `/item.html?u=${encodeURIComponent(it.unique_name)}`;
    push({
      id: `i:${it.unique_name}`, kind,
      name: it.name, alt: it.name_pt || '',
      sub: it.type || it.category,
      image: it.image_name ? CDN_IMG + it.image_name : null,
      url,
    });
    if (kind !== 'item') continue;
    let raw = null;
    try { raw = JSON.parse(it.raw); } catch { /* ignora raw corrompido */ }
    const comps = raw && Array.isArray(raw.components) ? raw.components : [];
    for (const c of comps) {
      // o blueprint principal já é achado pelo nome do item
      if (!c.name || c.name === 'Blueprint') continue;
      const full = c.name.includes(it.name) ? c.name : `${it.name} ${c.name}`;
      push({
        id: `c:${it.unique_name}::${c.name}`, kind: 'component',
        name: full, alt: '',
        sub: `Componente de ${it.name}`,
        image: c.imageName ? CDN_IMG + c.imageName : null,
        url: `${url}#c-${compSlug(c.name)}`,
      });
    }
  }

  const relics = db.prepare('SELECT name, vaulted FROM relics').all();
  for (const r of relics) {
    push({
      id: `r:${r.name}`, kind: 'relic',
      name: `${r.name} Relic`, alt: `Relíquia ${r.name}`,
      sub: r.vaulted ? 'Relíquia · vaulted' : 'Relíquia · disponível',
      image: null,
      url: `/relic.html?n=${encodeURIComponent(r.name)}`,
    });
  }

  const arts = db.prepare('SELECT slug, kind, title, keywords FROM articles').all();
  for (const a of arts) {
    push({
      id: `a:${a.slug}`, kind: a.kind,
      name: a.title, alt: a.keywords || '',
      sub: a.kind === 'faq' ? 'FAQ · mecânicas do jogo' : 'Guia · Nightwave',
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
    storeFields: ['kind', 'name', 'sub', 'image', 'url'],
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
    kind: r.kind, name: r.name, sub: r.sub, image: r.image, url: r.url,
    score: Math.round(r.score * 10) / 10,
  };
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
  return { results: res.slice(0, limit).map(toResult), strong };
}

function suggest(q, limit = 8) {
  if (!mini) return [];
  const res = mini.search(q, { combineWith: 'AND' });
  const out = res.length ? res : mini.search(q, { combineWith: 'OR' });
  return out.slice(0, limit).map(toResult);
}

function stats() {
  return { docs: docCount, lastIngestSeen };
}

module.exports = { buildIndex, maybeReindex, searchLocal, suggest, stats, tokensOf };
