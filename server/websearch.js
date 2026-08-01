'use strict';

/**
 * Fallback de busca web via Google Programmable Search Engine (CSE),
 * restrito (na configuração do CSE) aos sites confiáveis de Warframe:
 * wiki.warframe.com, warframe.com, forums.warframe.com, warframe.market,
 * overframe.gg, reddit.com/r/Warframe.
 *
 * Sem chaves configuradas (ou com a cota diária esgotada / erro upstream),
 * degrada graciosamente para um pacote de links de busca por site.
 * Resultados são cacheados no SQLite (cota gratuita ≈ 100 buscas/dia).
 */

const crypto = require('node:crypto');
const { getDb, getMeta, setMeta } = require('./db');
const { nowSec, USER_AGENT } = require('./util');

const CACHE_TTL_SEC = 3 * 24 * 3600;
const DAILY_LIMIT = Math.max(0, parseInt(process.env.CSE_DAILY_LIMIT || '90', 10) || 0);

const normQuery = (q) => String(q).trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 120);

function linkPack(q) {
  const e = encodeURIComponent(q);
  return [
    { label: 'Wiki oficial de Warframe', url: `https://wiki.warframe.com/index.php?search=${e}` },
    { label: 'Overframe (builds)', url: `https://www.google.com/search?q=${e}+site%3Aoverframe.gg` },
    { label: 'r/Warframe (Reddit)', url: `https://www.reddit.com/r/Warframe/search/?q=${e}&restrict_sr=1` },
    { label: 'warframe.market (preços)', url: `https://www.google.com/search?q=${e}+site%3Awarframe.market` },
    { label: 'Fóruns oficiais', url: `https://www.google.com/search?q=${e}+site%3Aforums.warframe.com` },
  ];
}

function quotaState(db) {
  const today = new Date().toISOString().slice(0, 10);
  let state = { date: today, used: 0 };
  const raw = getMeta(db, 'cse_quota');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.date === today && Number.isFinite(parsed.used)) state = parsed;
    } catch { /* estado zerado */ }
  }
  return { ...state, left: Math.max(0, DAILY_LIMIT - state.used) };
}

async function webSearch(q) {
  const db = getDb();
  const key = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  const nq = normQuery(q);
  if (!nq) return null;

  if (!key || !cx) {
    return {
      mode: 'links', configured: false, links: linkPack(nq),
      note: 'Busca web não configurada - use os links diretos nos sites confiáveis:',
    };
  }

  const qhash = crypto.createHash('sha256').update(nq).digest('hex');
  const cachedRow = db.prepare('SELECT results, created_at FROM web_cache WHERE qhash = ?').get(qhash);
  if (cachedRow && nowSec() - cachedRow.created_at < CACHE_TTL_SEC) {
    return { mode: 'cse', cached: true, results: JSON.parse(cachedRow.results) };
  }

  const quota = quotaState(db);
  if (quota.left <= 0) {
    return {
      mode: 'links', configured: true, links: linkPack(nq),
      note: 'Cota diária de busca web esgotada - use os links diretos:',
    };
  }

  try {
    const url = 'https://www.googleapis.com/customsearch/v1'
      + `?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}`
      + `&q=${encodeURIComponent(nq)}&num=6&hl=pt-BR&safe=active`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    let res;
    try {
      res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': USER_AGENT } });
    } finally {
      clearTimeout(timer);
    }
    setMeta(db, 'cse_quota', JSON.stringify({ date: quota.date, used: quota.used + 1 }));
    if (!res.ok) throw new Error(`CSE HTTP ${res.status}`);
    const data = await res.json();
    const results = (Array.isArray(data.items) ? data.items : [])
      .map((i) => ({ title: i.title, snippet: i.snippet, link: i.link, site: i.displayLink }))
      .slice(0, 6);
    db.prepare('INSERT OR REPLACE INTO web_cache(qhash, query, results, created_at) VALUES (?, ?, ?, ?)')
      .run(qhash, nq, JSON.stringify(results), nowSec());
    return { mode: 'cse', cached: false, results };
  } catch {
    return {
      mode: 'links', configured: true, links: linkPack(nq),
      note: 'Busca web indisponível agora - use os links diretos:',
    };
  }
}

module.exports = { webSearch, linkPack, quotaState, normQuery };
