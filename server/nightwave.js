'use strict';

/**
 * Cruza os atos ativos do Nightwave (worldstate) com a biblioteca local de
 * guias em PT-BR. O match é por grupos de palavras-chave: um ato casa com um
 * guia se TODAS as palavras de algum grupo aparecerem no título+descrição.
 */

const { getDb } = require('./db');
const { getNightwaveRaw } = require('./worldstate');
const { stripDiacritics } = require('./util');

const norm = (s) => stripDiacritics(String(s || '').toLowerCase());

function loadGuides() {
  const db = getDb();
  return db.prepare(
    "SELECT slug, title, keywords, match_json FROM articles WHERE kind = 'nightwave' ORDER BY sort, title"
  ).all().map((g) => {
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

async function getActs() {
  let nw = null;
  try { nw = await getNightwaveRaw(); } catch { nw = null; }
  const guides = loadGuides();
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
    .sort((a, b) => order(a) - order(b));
  return {
    available: !!(nw && Array.isArray(nw.activeChallenges) && nw.activeChallenges.length),
    season: nw ? { activation: nw.activation, expiry: nw.expiry, tag: nw.tag } : null,
    acts,
    guides: guides.map((g) => ({ slug: g.slug, title: g.title })),
  };
}

module.exports = { getActs, matchGuide, loadGuides };
