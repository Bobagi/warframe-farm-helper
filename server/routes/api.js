'use strict';

const express = require('express');
const { getDb, getMeta } = require('../db');
const { listArticles, getArticle } = require('../articles');
const { searchLocal, suggest, stats } = require('../search');
const { webSearch } = require('../websearch');
const { getTopOrders } = require('../market');
const { getFissures, fissuresSource, getBaro, getCycles } = require('../worldstate');
const { getVarzia } = require('../varzia');
const { getActs } = require('../nightwave');
const {
  buildItemDetail, buildRelicDetail, buildFarmable, saveFarmableSnapshot, loadFarmableSnapshot,
} = require('../itemview');

const router = express.Router();

// ---- rate limit simples por IP (protege cota do CSE e APIs externas) ----
const BUCKET_MAX = 30; // burst
const REFILL_PER_SEC = 1;
const buckets = new Map();

function rateLimit(req, res, next) {
  const ip = req.ip || 'desconhecido';
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b) {
    b = { tokens: BUCKET_MAX, at: now };
    buckets.set(ip, b);
  }
  b.tokens = Math.min(BUCKET_MAX, b.tokens + ((now - b.at) / 1000) * REFILL_PER_SEC);
  b.at = now;
  if (b.tokens < 1) {
    res.status(429).json({ error: 'Muitas requisições - espere um instante e tente de novo.' });
    return;
  }
  b.tokens -= 1;
  next();
}
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, v] of buckets) if (v.at < cutoff) buckets.delete(k);
}, 10 * 60 * 1000).unref();

const asyncRoute = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// ---- rotas ----

router.get('/health', (req, res) => {
  const db = getDb();
  let counts = {};
  try { counts = JSON.parse(getMeta(db, 'counts') || '{}'); } catch { counts = {}; }
  res.json({
    ok: true,
    ready: (counts.items || 0) > 0,
    counts,
    lastIngest: getMeta(db, 'last_ingest'),
    searchDocs: stats().docs,
  });
});

/**
 * País do visitante, para o cliente abrir já no idioma certo.
 *
 * A origem é o header `CF-IPCountry`, que o Cloudflare põe em toda requisição
 * (a zona inteira é proxied). NÃO é geolocalização do navegador: não pede
 * permissão, não identifica ninguém e nada é gravado - o header entra e sai na
 * mesma resposta.
 *
 * `no-store` porque a resposta é diferente por visitante: se um cache
 * intermediário guardasse isso, um chinês serviria país para um brasileiro.
 * Por isso também é um endpoint separado, e não um atributo no HTML (que a
 * app serve com `max-age`).
 */
router.get('/geo', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const cc = String(req.get('cf-ipcountry') || '').trim().toUpperCase();
  // XX = desconhecido e T1 = Tor, ambos na doc do Cloudflare; devolve null e o
  // cliente cai na detecção pelo idioma do navegador
  const ok = /^[A-Z]{2}$/.test(cc) && cc !== 'XX' && cc !== 'T1';
  res.json({ country: ok ? cc : null });
});

router.get('/search', rateLimit, asyncRoute(async (req, res) => {
  const q = String(req.query.q || '').slice(0, 120).trim();
  if (q.length < 2) {
    res.json({ query: q, results: [], strong: true, web: null });
    return;
  }
  const { results, strong } = searchLocal(q, 20);
  const forceWeb = req.query.web === '1';
  let web = null;
  if (forceWeb || !strong) web = await webSearch(q);
  res.json({ query: q, results, strong, web });
}));

router.get('/suggest', rateLimit, (req, res) => {
  const q = String(req.query.q || '').slice(0, 120).trim();
  res.json({ results: q.length >= 2 ? suggest(q, 8) : [] });
});

// idioma da PROSA do servidor (descrição, passo a passo, locais de drop): só há
// Redação do servidor em pt, en e zh. 'pt' → pt; 'zh' → zh; es/ru/qualquer
// outro → en (fallback internacional - antes es/ru caíam em pt, vazando
// português); sem lang → pt (o site é PT-first).
//
// Por que o chinês tem redação PRÓPRIA e es/ru não: es/ru mantêm nome de item em
// inglês porque market/wiki/trade da comunidade usam inglês. O servidor chinês
// do jogo é um ecossistema separado, com nomenclatura oficial própria, e o
// jogador de lá procura por ela - por isso zh tem nome, descrição e prosa.
// Idioma para CONTEÚDO que existe nos 5 (artigos traduzidos, desafios do
// Nightwave vindos do dataset). Diferente do `pickLang`, que é para a PROSA
// gerada pelo servidor e só existe em pt/en/zh.
const SUPPORTED = new Set(['pt', 'en', 'es', 'ru', 'zh']);
const uiLang = (v) => {
  const s2 = String(v || '').toLowerCase();
  return SUPPORTED.has(s2) ? s2 : 'pt';
};

const pickLang = (v) => {
  const s = String(v || '').toLowerCase();
  if (s === '' || s === 'pt') return 'pt';
  return s === 'zh' ? 'zh' : 'en';
};

router.get('/item', asyncRoute(async (req, res) => {
  const u = String(req.query.u || '').slice(0, 250);
  if (!u.startsWith('/Lotus/')) {
    res.status(400).json({ error: 'parâmetro "u" inválido' });
    return;
  }
  const detail = await buildItemDetail(u, pickLang(req.query.lang));
  if (!detail) {
    res.status(404).json({ error: 'item não encontrado' });
    return;
  }
  // a marcação da Varzia nas relíquias vive no buildItemDetail: o passo a passo
  // precisa dela para não contradizer a tabela de relíquias
  res.json(detail);
}));

router.get('/relic', asyncRoute(async (req, res) => {
  const name = String(req.query.n || '').slice(0, 40).trim();
  if (!/^[A-Za-z]+ [A-Za-z0-9]+$/.test(name)) {
    res.status(400).json({ error: 'parâmetro "n" inválido (ex.: n=Lith K12)' });
    return;
  }
  const detail = buildRelicDetail(name);
  if (!detail) {
    res.status(404).json({ error: 'relíquia não encontrada' });
    return;
  }
  let fissures = [];
  try { fissures = (await getFissures()).filter((f) => f.tier === detail.tier); } catch { fissures = []; }
  const varzia = await getVarzia().catch(() => null);
  const inVarzia = !!(varzia && varzia.relics.includes(detail.name));
  res.json({
    ...detail,
    activeFissures: fissures,
    // só interessa quando a relíquia está vaulted: é o caso em que o site
    // dizia "espere voltar" e ela já voltou
    varzia: inVarzia
      ? { expiry: varzia.expiry, location: varzia.location, primes: varzia.primes.map((p) => p.name) }
      : null,
  });
}));

router.get('/fissures', asyncRoute(async (req, res) => {
  const fissures = await getFissures();
  res.json({ fissures, source: fissuresSource() });
}));

router.get('/farmable', asyncRoute(async (req, res) => {
  const data = await buildFarmable();
  const source = fissuresSource();
  if (source === 'ok' && data.items.length) {
    saveFarmableSnapshot(data);
    res.json({ ...data, source });
    return;
  }
  // fonte degradada (warframestat fora do ar/atrasado): serve a última foto
  // saudável com aviso datado, em vez de painel vazio
  const snap = loadFarmableSnapshot();
  if (snap) {
    res.json({ ...snap.data, source, fallback: { savedAt: snap.savedAt } });
    return;
  }
  res.json({ ...data, source });
}));

router.get('/nightwave', asyncRoute(async (req, res) => {
  res.json(await getActs(uiLang(req.query.lang)));
}));

router.get('/baro', asyncRoute(async (req, res) => {
  res.json({ baro: await getBaro() });
}));

router.get('/varzia', asyncRoute(async (req, res) => {
  res.json({ varzia: await getVarzia() });
}));

router.get('/cycles', asyncRoute(async (req, res) => {
  res.json({ cycles: await getCycles() });
}));

router.get('/faq', (req, res) => {
  res.json({ articles: listArticles('faq', uiLang(req.query.lang)) });
});

router.get('/article/:slug', (req, res) => {
  const slug = String(req.params.slug || '').slice(0, 120);
  if (!/^[a-z0-9-]+$/.test(slug)) {
    res.status(400).json({ error: 'slug inválido' });
    return;
  }
  const row = getArticle(slug, uiLang(req.query.lang));
  if (!row) {
    res.status(404).json({ error: 'artigo não encontrado' });
    return;
  }
  res.json(row);
});

router.get('/market/:slug', rateLimit, asyncRoute(async (req, res) => {
  const slug = String(req.params.slug || '').slice(0, 80);
  // valida antes de qualquer coisa (o slug entra numa URL externa) e responde
  // com o status certo - slug malformado é erro do cliente, não 200
  if (!/^[a-z0-9_]{2,80}$/.test(slug)) {
    res.status(400).json({ error: 'slug inválido' });
    return;
  }
  res.json(await getTopOrders(slug));
}));

router.use((req, res) => res.status(404).json({ error: 'rota não encontrada' }));

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  console.error('[api] erro:', err);
  res.status(500).json({ error: 'erro interno' });
});

module.exports = router;
