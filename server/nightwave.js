'use strict';

/**
 * Cruza os atos ativos do Nightwave (worldstate) com a biblioteca local de
 * guias em PT-BR. O match é por grupos de palavras-chave: um ato casa com um
 * guia se TODAS as palavras de algum grupo aparecerem no título+descrição.
 */

const { getDb } = require('./db');
const { listArticles } = require('./articles');
const { getNightwaveRaw } = require('./worldstate');
const { stripDiacritics } = require('./util');

const norm = (s) => stripDiacritics(String(s || '').toLowerCase());

/**
 * Guias de Nightwave. O `match` (grupos de palavra-chave que casam o guia com o
 * ato ativo) vive SÓ no artigo em português, que é o original: a tradução herda
 * o match do pt e contribui apenas com o TÍTULO no idioma do leitor.
 */
function loadGuides(lang = 'pt') {
  const db = getDb();
  const matchPt = new Map(db.prepare(
    "SELECT slug, match_json FROM articles WHERE kind = 'nightwave' AND lang = 'pt'"
  ).all().map((r) => [r.slug, r.match_json]));
  return listArticles('nightwave', lang, 'match_json').map((g) => {
    g = { ...g, match_json: matchPt.get(g.slug) || g.match_json };
    return g;
  }).map((g) => {
    let groups = [];
    if (g.match_json) {
      try { groups = JSON.parse(g.match_json); } catch { groups = []; }
    }
    return { slug: g.slug, title: g.title, groups };
  });
}

function matchGuide(guides, act) {
  const hay = norm(`${act.title} ${act.desc}`);
  for (const g of guides) {
    for (const group of g.groups) {
      if (Array.isArray(group) && group.length
        && group.every((w) => hay.includes(norm(w)))) {
        return { slug: g.slug, title: g.title };
      }
    }
  }
  return null;
}

/**
 * Título e descrição do ato no idioma pedido.
 *
 * A API do worldstate só devolve INGLÊS, mas o dataset da DE traduz os
 * desafios. O casamento é pelo `id` do ato SEM o timestamp da semana
 * ("1786752000000seasondailycompletemission" → "seasondailycompletemission"),
 * que é o último segmento do uniqueName do desafio. Ato que o dataset ainda não
 * conhece (os mais novos) fica no inglês da API - melhor que sumir.
 */
function translateAct(db, act, lang) {
  if (!lang || lang === 'en') return act;
  const key = String(act.id || '').replace(/^\d+/, '');
  if (!key) return act;
  let row = null;
  try {
    row = db.prepare('SELECT title, descr FROM challenges WHERE key = ? AND lang = ?').get(key, lang);
  } catch { return act; } // banco sem a tabela (versão antiga)
  if (!row) return act;
  return {
    ...act,
    title: row.title || act.title,
    desc: fillCount(row.descr, act.desc) || act.desc,
  };
}

/**
 * O texto traduzido do dataset traz o placeholder do jogo (`|COUNT|`), e o
 * número só existe no texto EN da API ("Kill 30 Eximus"). Pega o primeiro
 * número do inglês e põe no lugar do placeholder; se não houver número para
 * preencher, devolve null e o chamador fica com o inglês, que ao menos está
 * completo. Traduzido com "|COUNT|" cru na tela seria pior que não traduzir.
 */
function fillCount(descr, descEn) {
  if (!descr) return null;
  if (!descr.includes('|COUNT|')) return descr;
  const m = String(descEn || '').match(/\d[\d,.]*/);
  if (!m) return null;
  return descr.replace(/\|COUNT\|/g, m[0]);
}

async function getActs(lang = 'pt') {
  let nw = null;
  try { nw = await getNightwaveRaw(); } catch { nw = null; }
  const db = getDb();
  const guides = loadGuides(lang);
  const order = (a) => (a.isDaily ? 0 : a.isElite ? 2 : 1);
  const acts = (nw && Array.isArray(nw.activeChallenges) ? nw.activeChallenges : [])
    .filter((a) => a && a.title)
    .map((a) => ({
      id: a.id,
      title: a.title,
      desc: a.desc || '',
      isDaily: !!a.isDaily,
      isElite: !!a.isElite,
      reputation: a.reputation,
      expiry: a.expiry,
      guide: matchGuide(guides, a),
    }))
    .map((a) => translateAct(db, a, lang))
    .sort((a, b) => order(a) - order(b));
  return {
    available: !!(nw && Array.isArray(nw.activeChallenges) && nw.activeChallenges.length),
    season: nw ? { activation: nw.activation, expiry: nw.expiry, tag: nw.tag } : null,
    acts,
    guides: guides.map((g) => ({ slug: g.slug, title: g.title })),
  };
}

module.exports = { getActs, matchGuide, loadGuides, translateAct, fillCount };
