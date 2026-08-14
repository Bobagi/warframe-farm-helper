'use strict';

/**
 * Leitura da tabela `acquisition` (populada na ingestão por wikiacq.js) e
 * enriquecimento para a página do item: cada material de pesquisa vira link
 * para a página dele, e o vendedor vira link para a wiki.
 *
 * Cobre o que o drop table NÃO cobre: pesquisa no Dojo do clã, compra em
 * vendedor/sindicato e preço no Mercado.
 */

const { itemUrl } = require('./seo');

const CDN_IMG = 'https://cdn.warframestat.us/img/';
const WIKI_BASE = 'https://wiki.warframe.com/w/';

/** URL da página da wiki a partir do nome canônico EN. */
function wikiPage(name) {
  const slug = String(name || '').trim().replace(/\s+/g, '_');
  // encodeURIComponent encoda tudo (inclusive "/"): esquema fixo, sem traversal
  return slug ? WIKI_BASE + encodeURIComponent(slug) : null;
}

const safeParse = (s) => { try { return JSON.parse(s); } catch { return null; } };

/**
 * Resolve um nome de item do dataset em {url, image, namePt} para o material
 * de pesquisa virar um link navegável. Mesma dedup do resto do site: o
 * `ORDER BY` estável evita escolher um gêmeo diferente a cada request.
 */
function makeResolver(db) {
  const stmt = db.prepare(
    'SELECT unique_name, name_pt, name_zh, image_name FROM items WHERE name = ? ORDER BY name, unique_name LIMIT 1'
  );
  const cache = new Map();
  return (name) => {
    if (!name) return null;
    if (!cache.has(name)) {
      const row = stmt.get(name);
      cache.set(name, row ? {
        url: itemUrl(row.unique_name),
        namePt: row.name_pt || null,
        nameZh: row.name_zh || null,
        image: row.image_name ? CDN_IMG + row.image_name : null,
      } : null);
    }
    return cache.get(name);
  };
}

/**
 * `{research, vendors, market}` crus do banco → prontos para renderizar.
 * Retorna null quando não há NADA (o chamador omite a seção inteira).
 */
function shape(rawEntry, resolve) {
  if (!rawEntry) return null;
  const out = { research: null, vendors: [], market: null };

  const r = rawEntry.research;
  if (r && (r.labName || (r.resources && r.resources.length))) {
    const prereqRef = r.prereq ? resolve(r.prereq) : null;
    out.research = {
      lab: r.labName || r.lab || null,
      labWiki: wikiPage(r.labName || r.lab),
      credits: Number.isFinite(r.credits) ? r.credits : null,
      affinity: Number.isFinite(r.affinity) ? r.affinity : null,
      timeSec: Number.isFinite(r.timeSec) ? r.timeSec : null,
      prereq: r.prereq || null,
      prereqUrl: prereqRef ? prereqRef.url : null,
      resources: (r.resources || []).map((res) => {
        const ref = resolve(res.name);
        return {
          name: res.name,
          namePt: ref ? ref.namePt : null,
          nameZh: ref ? ref.nameZh : null,
          count: res.count,
          url: ref ? ref.url : null,
          image: ref ? ref.image : null,
        };
      }),
    };
  }

  for (const v of rawEntry.vendors || []) {
    if (!v || v.cost == null) continue;
    out.vendors.push({
      vendor: v.vendor,
      wiki: wikiPage(v.link || v.vendor),
      currency: v.currency || null,
      cost: v.cost,
      qty: Number.isFinite(v.qty) && v.qty > 1 ? v.qty : 1,
      rank: Number.isFinite(v.rank) ? v.rank : null,
    });
  }
  // mais barato primeiro dentro de cada moeda, moedas em ordem estável
  out.vendors.sort((a, b) => String(a.currency).localeCompare(String(b.currency))
    || (a.cost - b.cost) || a.vendor.localeCompare(b.vendor));

  const m = rawEntry.market;
  if (m && (Number.isFinite(m.platinum) || Number.isFinite(m.blueprintCredits))) {
    out.market = {
      platinum: Number.isFinite(m.platinum) ? m.platinum : null,
      blueprintCredits: Number.isFinite(m.blueprintCredits) ? m.blueprintCredits : null,
    };
  }

  if (!out.research && !out.vendors.length && !out.market) return null;
  return out;
}

/**
 * Busca a aquisição de VÁRIOS nomes de uma vez (o item + os componentes dele).
 * Devolve um Map nome → objeto pronto (só com os que têm algo).
 */
function getAcquisition(db, names) {
  const wanted = [...new Set((names || []).filter((n) => typeof n === 'string' && n))];
  if (!wanted.length) return new Map();
  // o `prepare` é que estoura num banco sem a tabela (banco antigo/externo), não
  // o `get` - o try tem que envolver ELE, senão a página do item inteira cai
  let stmt;
  try { stmt = db.prepare('SELECT data FROM acquisition WHERE name = ?'); } catch { return new Map(); }
  const resolve = makeResolver(db);
  const out = new Map();
  for (const name of wanted) {
    let row;
    try { row = stmt.get(name); } catch { row = null; }
    if (!row) continue;
    const shaped = shape(safeParse(row.data), resolve);
    if (shaped) out.set(name, shaped);
  }
  return out;
}

module.exports = { getAcquisition, shape, wikiPage, makeResolver };
