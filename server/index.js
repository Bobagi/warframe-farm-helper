'use strict';

const path = require('node:path');
const express = require('express');
const { getDb } = require('./db');
const { runIngest, loadArticles } = require('./ingest');
const search = require('./search');
const seo = require('./seo');
const api = require('./routes/api');

const PORT = parseInt(process.env.PORT || '3064', 10);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// horário da atualização diária dos dados (UTC) - drop tables mudam com updates
const INGEST_UTC_HOUR = 7;
const INGEST_UTC_MINUTE = 43;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback'); // atrás do nginx local

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    // cdn.warframestat.us faz 301 → raw.githubusercontent.com; o CSP checa o
    // destino do redirect, então ambos precisam estar liberados p/ as artes.
    // Os hosts do Google servem os pixels/criativos do AdSense.
    "img-src 'self' https://cdn.warframestat.us https://raw.githubusercontent.com data: https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google",
    // 'unsafe-inline' cobre os atributos style="" do layout; script-src fica
    // estrito ('self' + hosts do AdSense, sem inline) - é ele que barra XSS.
    // (JSON-LD <script type="application/ld+json"> é bloco de DADOS, não
    // executa - o CSP não o bloqueia.)
    "style-src 'self' 'unsafe-inline'",
    // anúncios Google AdSense: o adsbygoogle.js SÓ é injetado pelo ads.js após
    // consentimento no banner de cookies (LGPD) - nunca tag estática no HTML.
    "script-src 'self' https://pagead2.googlesyndication.com https://tpc.googlesyndication.com https://googleads.g.doubleclick.net https://www.googletagservices.com https://adservice.google.com https://ep2.adtrafficquality.google",
    "connect-src 'self' https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google https://csi.gstatic.com",
    "font-src 'self'",
    // os criativos do AdSense rodam em iframes destas origens
    'frame-src https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://pagead2.googlesyndication.com https://www.google.com https://ep2.adtrafficquality.google',
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
  next();
});

app.use('/api', api);

// Em produção o nginx intercepta /st.js e /st/ e manda para o Umami (ver
// README). Rodando a app sozinha (dev, teste) esses caminhos não existem e o
// navegador loga "Refused to execute script" em TODA página - ruído que já me
// fez procurar bug de front onde não havia. Devolve um script vazio e válido.
app.get('/st.js', (req, res) => {
  res.type('application/javascript')
    .setHeader('Cache-Control', 'no-store');
  res.send('/* analytics: servido pelo nginx em produção */\n');
});

// ---- SEO: páginas SSR (meta por recurso), sitemap e redirects das URLs legadas ----

const sendSsr = (res, html) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.type('html').send(html);
};
// página SSR ou cai no 404 (handler final)
const ssrRoute = (render) => (req, res, next) => {
  const html = render(req.params.slug);
  if (!html) { next(); return; }
  sendSsr(res, html);
};

app.get('/sitemap.xml', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.type('application/xml').send(seo.sitemapXml());
});

app.get('/item/:slug', ssrRoute((s) => seo.renderItemPage(s)));
app.get('/relic/:slug', ssrRoute((s) => seo.renderRelicPage(s)));
app.get('/faq/:slug', ssrRoute((s) => seo.renderArticlePage('faq', s)));
app.get('/nightwave/:slug', ssrRoute((s) => seo.renderArticlePage('nightwave', s)));
app.get('/legal/:slug', ssrRoute((s) => seo.renderArticlePage('legal', s)));

// URLs limpas das páginas fixas (os .html antigos redirecionam para cá)
app.get('/faq', (req, res) => sendSsr(res, seo.renderFaqIndex()));
app.get('/nightwave', (req, res) => sendSsr(res, seo.renderNightwaveIndex()));
app.get('/buscar', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'buscar.html')));
app.get('/fissuras', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'fissuras.html')));

// redirects 301 das URLs antigas (links já indexados/salvos continuam valendo)
app.get('/item.html', (req, res) => {
  const u = String(req.query.u || '');
  const url = u ? seo.itemUrl(u) : '';
  if (url && !url.startsWith('/item.html')) { res.redirect(301, url); return; }
  sendSsr(res, seo.renderNoindex('item.html')); // item desconhecido: página com erro do cliente
});
app.get('/relic.html', (req, res) => {
  const n = String(req.query.n || '').trim();
  if (/^[A-Za-z]+ [A-Za-z0-9]+$/.test(n)) { res.redirect(301, seo.relicUrl(n)); return; }
  sendSsr(res, seo.renderNoindex('relic.html'));
});
app.get('/faq.html', (req, res) => {
  const slug = String(req.query.slug || '');
  res.redirect(301, /^[a-z0-9-]+$/.test(slug) ? `/faq/${slug}` : '/faq');
});
app.get('/nightwave.html', (req, res) => {
  const slug = String(req.query.slug || '');
  res.redirect(301, /^[a-z0-9-]+$/.test(slug) ? `/nightwave/${slug}` : '/nightwave');
});
app.get('/buscar.html', (req, res) => {
  const q = String(req.query.q || '');
  res.redirect(301, q ? `/buscar?q=${encodeURIComponent(q)}` : '/buscar');
});
app.get('/fissuras.html', (req, res) => res.redirect(301, '/fissuras'));
app.get('/index.html', (req, res) => res.redirect(301, '/'));

app.use(express.static(PUBLIC_DIR, {
  maxAge: '15m',
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    if (filePath.includes(`${path.sep}fonts${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));

app.use((req, res) => {
  res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
});

// ---- ingestão agendada ----
let ingesting = false;

async function safeIngest(reason) {
  if (ingesting) return;
  ingesting = true;
  try {
    console.log(`[cron] ingestão (${reason})...`);
    await runIngest({});
    search.maybeReindex();
  } catch (err) {
    console.error('[cron] ingestão falhou:', err.message);
  } finally {
    ingesting = false;
  }
}

function msUntilNextIngest() {
  const now = new Date();
  const next = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    INGEST_UTC_HOUR, INGEST_UTC_MINUTE, 0, 0
  ));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

function scheduleDailyIngest() {
  const ms = msUntilNextIngest();
  console.log(`[cron] próxima ingestão em ${Math.round(ms / 60000)} min`);
  setTimeout(async () => {
    await safeIngest('diária');
    scheduleDailyIngest();
  }, ms).unref();
}

async function boot() {
  const db = getDb();
  // A migração de `articles` (que ganhou a coluna `lang`) DERRUBA a tabela, e
  // ela é 100% derivada dos markdown do repo. Repopula na hora, sem rede: sem
  // isto o FAQ ficaria vazio até a próxima ingestão diária.
  if (db.prepare('SELECT COUNT(*) c FROM articles').get().c === 0) {
    try {
      const arts = loadArticles();
      const ins = db.prepare(`INSERT OR REPLACE INTO articles
        (slug, lang, kind, title, keywords, match_json, html, body_md, sort)
        VALUES (@slug, @lang, @kind, @title, @keywords, @match_json, @html, @body_md, @sort)`);
      db.transaction(() => { for (const a of arts) ins.run(a); })();
      console.log(`[boot] artigos repopulados do markdown: ${arts.length}`);
    } catch (err) {
      console.error('[boot] falha ao repopular artigos:', err.message);
    }
  }
  const count = db.prepare('SELECT COUNT(*) c FROM items').get().c;
  if (count === 0) {
    console.log('[boot] banco vazio - rodando a primeira ingestão (pode levar alguns minutos)...');
    try {
      await runIngest({});
    } catch (err) {
      console.error('[boot] ingestão inicial falhou (nova tentativa em 5 min):', err.message);
      const retry = setInterval(async () => {
        const c = db.prepare('SELECT COUNT(*) c FROM items').get().c;
        if (c > 0) { clearInterval(retry); return; }
        try {
          await runIngest({});
          search.buildIndex();
          clearInterval(retry);
        } catch (e) {
          console.error('[boot] nova tentativa falhou:', e.message);
        }
      }, 5 * 60 * 1000);
      retry.unref();
    }
  }

  const docs = search.buildIndex();
  console.log(`[boot] índice de busca: ${docs} documentos`);

  app.listen(PORT, () => {
    console.log(`[boot] warframe-farm-helper ouvindo em http://127.0.0.1:${PORT}`);
  });

  scheduleDailyIngest();
  // pega ingestões manuais (`npm run ingest`) sem reiniciar o servidor
  setInterval(() => {
    try { search.maybeReindex(); } catch (err) { console.error('[search]', err.message); }
  }, 5 * 60 * 1000).unref();
}

boot().catch((err) => {
  console.error('[boot] erro fatal:', err);
  process.exit(1);
});
