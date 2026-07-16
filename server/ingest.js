'use strict';

/**
 * Ingestão de dados: baixa os JSONs do WFCD (warframe-items, que já embute as
 * drop tables oficiais da DE) e popula o SQLite local. Idempotente: tudo roda
 * numa transação única com DELETE + INSERT (rodar de novo não duplica nada).
 *
 * Uso standalone: `npm run ingest` (o servidor detecta e reindexa sozinho).
 */

const fs = require('node:fs');
const path = require('node:path');
const { marked } = require('marked');
const { fetchJson, escapeHtml } = require('./util');
const { getDb, setMeta } = require('./db');

// Sanitização na origem: HTML cru dentro do markdown vira texto escapado e
// links só saem com esquemas seguros — o cliente pode confiar no html gerado.
const SAFE_HREF = /^(https?:\/\/|\/|#|mailto:)/i;
marked.use({
  renderer: {
    html(token) {
      const raw = typeof token === 'string' ? token : (token.text || token.raw || '');
      return escapeHtml(raw);
    },
    link(token) {
      const text = this.parser.parseInline(token.tokens);
      const href = String(token.href || '');
      if (!SAFE_HREF.test(href)) return text;
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
      return `<a href="${escapeHtml(href)}"${title}>${text}</a>`;
    },
  },
});

const RAW_BASE = process.env.WF_ITEMS_BASE
  || 'https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json';

// Categorias indexadas (equipamentos farmáveis + gear/quest/arcane + recursos + mods).
const CATEGORIES = [
  'Warframes', 'Primary', 'Secondary', 'Melee',
  'Archwing', 'Arch-Gun', 'Arch-Melee',
  'Sentinels', 'SentinelWeapons', 'Pets',
  'Gear', 'Quests', 'Arcanes', 'Fish',
  'Resources', 'Mods',
];

const CONTENT_DIR = process.env.CONTENT_DIR || path.join(__dirname, '..', 'content');
const REFINEMENT_RE = / (Intact|Exceptional|Flawless|Radiant)$/;

function slimDrop(d) {
  return { location: d.location, chance: d.chance, rarity: d.rarity };
}

function slimComponent(c) {
  return {
    name: c.name,
    uniqueName: c.uniqueName,
    itemCount: c.itemCount || 1,
    imageName: c.imageName,
    ducats: c.ducats,
    tradable: c.tradable === true,
    drops: Array.isArray(c.drops) ? c.drops.map(slimDrop) : [],
  };
}

/** Guarda só o que o site renderiza — mantém o banco pequeno. */
function slimItem(it) {
  const s = {
    name: it.name,
    uniqueName: it.uniqueName,
    description: it.description,
    type: it.type,
    category: it.category,
    productCategory: it.productCategory,
    masteryReq: it.masteryReq,
    buildPrice: it.buildPrice,
    buildTime: it.buildTime,
    skipBuildTimePrice: it.skipBuildTimePrice,
    consumeOnBuild: it.consumeOnBuild,
    imageName: it.imageName,
    wikiaUrl: it.wikiaUrl,
    vaulted: it.vaulted,
    tradable: it.tradable,
    marketCost: it.marketCost,
    bpCost: it.bpCost,
    drops: Array.isArray(it.drops) ? it.drops.map(slimDrop) : [],
  };
  if (Array.isArray(it.components)) s.components = it.components.map(slimComponent);
  return s;
}

/**
 * Agrupa as ~3100 entradas de Relics.json (uma por refinamento) em ~780
 * relíquias base, com rewards por refinamento e locais de drop deduplicados.
 */
function groupRelics(entries) {
  const map = new Map();
  for (const e of entries) {
    if (!e || typeof e.name !== 'string') continue;
    const m = e.name.match(REFINEMENT_RE);
    if (!m) continue; // toda entrada válida tem sufixo de refinamento
    const refinement = m[1];
    const base = e.name.replace(REFINEMENT_RE, '');
    let g = map.get(base);
    if (!g) {
      const [tier, ...rest] = base.split(' ');
      g = { name: base, tier, code: rest.join(' '), vaulted: false, drops: [], rewards: {} };
      map.set(base, g);
    }
    if (e.vaulted === true) g.vaulted = true;
    g.rewards[refinement] = (Array.isArray(e.rewards) ? e.rewards : [])
      .map((r) => ({
        name: r.item && r.item.name,
        uniqueName: r.item && r.item.uniqueName,
        rarity: r.rarity,
        chance: r.chance,
        marketSlug: r.item && r.item.warframeMarket ? r.item.warframeMarket.urlName : undefined,
      }))
      .filter((r) => r.name);
    if (refinement === 'Intact' && Array.isArray(e.drops)) {
      const seen = new Set();
      for (const d of e.drops) {
        const key = `${d.location}|${d.chance}`;
        if (seen.has(key)) continue;
        seen.add(key);
        g.drops.push(slimDrop(d));
      }
      g.drops.sort((a, b) => (b.chance || 0) - (a.chance || 0));
      g.drops = g.drops.slice(0, 15);
    }
  }
  return [...map.values()];
}

/** Frontmatter mínimo: bloco `--- ... ---` com `chave: valor` (JSON aceito no valor). */
function parseFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { attrs: {}, body: src };
  const attrs = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (!key || !val) continue;
    if (val.startsWith('[') || val.startsWith('{')) {
      try { val = JSON.parse(val); } catch { /* mantém string */ }
    }
    attrs[key] = val;
  }
  return { attrs, body: src.slice(m[0].length) };
}

function loadArticles() {
  const out = [];
  for (const kind of ['faq', 'nightwave']) {
    const dir = path.join(CONTENT_DIR, kind);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
      const src = fs.readFileSync(path.join(dir, file), 'utf8');
      const { attrs, body } = parseFrontmatter(src);
      if (!attrs.title) throw new Error(`Artigo sem "title" no frontmatter: ${kind}/${file}`);
      out.push({
        slug: String(attrs.slug || file.replace(/\.md$/, '')),
        kind,
        title: String(attrs.title),
        keywords: String(attrs.keywords || ''),
        match_json: attrs.match ? JSON.stringify(attrs.match) : null,
        sort: Number(attrs.order) || 100,
        body_md: body,
        html: marked.parse(body),
      });
    }
  }
  return out;
}

async function runIngest({ log = console.log, includeI18n = true } = {}) {
  const db = getDb();

  log('[ingest] baixando categorias do WFCD/warframe-items...');
  const itemRows = [];
  for (const cat of CATEGORIES) {
    const arr = await fetchJson(`${RAW_BASE}/${encodeURIComponent(cat)}.json`, { timeoutMs: 120000 });
    if (!Array.isArray(arr)) throw new Error(`payload inesperado em ${cat}.json`);
    log(`[ingest] ${cat}: ${arr.length} itens`);
    for (const it of arr) {
      if (!it || typeof it.uniqueName !== 'string' || typeof it.name !== 'string') continue;
      itemRows.push({
        unique_name: it.uniqueName,
        name: it.name,
        name_pt: null,
        category: cat,
        type: it.type || null,
        mastery_req: Number.isFinite(it.masteryReq) ? it.masteryReq : null,
        vaulted: it.vaulted === true ? 1 : (it.vaulted === false ? 0 : null),
        image_name: it.imageName || null,
        wiki_url: it.wikiaUrl || null,
        tradable: it.tradable === true ? 1 : 0,
        slim: slimItem(it),
      });
    }
  }

  const relicEntries = await fetchJson(`${RAW_BASE}/Relics.json`, { timeoutMs: 180000 });
  const relics = groupRelics(relicEntries);
  log(`[ingest] Relics: ${relics.length} relíquias (${relicEntries.length} entradas)`);

  if (includeI18n) {
    try {
      log('[ingest] baixando i18n (~50MB) para nomes PT-BR...');
      const i18n = await fetchJson(`${RAW_BASE}/i18n.json`, { timeoutMs: 300000, retries: 1 });
      let hits = 0;
      for (const row of itemRows) {
        const tr = i18n[row.unique_name];
        if (tr && tr.pt) {
          if (tr.pt.name && tr.pt.name !== row.name) { row.name_pt = tr.pt.name; hits++; }
          if (tr.pt.description) row.slim.descriptionPt = tr.pt.description;
        }
      }
      log(`[ingest] i18n pt aplicado em ${hits} itens`);
    } catch (err) {
      log(`[ingest] i18n falhou (seguindo só com EN): ${err.message}`);
    }
  }

  const articles = loadArticles();
  log(`[ingest] artigos locais: ${articles.length}`);

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM items').run();
    db.prepare('DELETE FROM relics').run();
    db.prepare('DELETE FROM articles').run();

    const insItem = db.prepare(`INSERT OR REPLACE INTO items
      (unique_name, name, name_pt, category, type, mastery_req, vaulted, image_name, wiki_url, tradable, raw)
      VALUES (@unique_name, @name, @name_pt, @category, @type, @mastery_req, @vaulted, @image_name, @wiki_url, @tradable, @raw)`);
    for (const r of itemRows) {
      insItem.run({
        unique_name: r.unique_name, name: r.name, name_pt: r.name_pt,
        category: r.category, type: r.type, mastery_req: r.mastery_req,
        vaulted: r.vaulted, image_name: r.image_name, wiki_url: r.wiki_url,
        tradable: r.tradable, raw: JSON.stringify(r.slim),
      });
    }

    const insRelic = db.prepare(
      'INSERT OR REPLACE INTO relics(name, tier, code, vaulted, drops, rewards) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const r of relics) {
      insRelic.run(r.name, r.tier, r.code, r.vaulted ? 1 : 0, JSON.stringify(r.drops), JSON.stringify(r.rewards));
    }

    const insArt = db.prepare(`INSERT OR REPLACE INTO articles
      (slug, kind, title, keywords, match_json, html, body_md, sort)
      VALUES (@slug, @kind, @title, @keywords, @match_json, @html, @body_md, @sort)`);
    for (const a of articles) insArt.run(a);

    setMeta(db, 'last_ingest', new Date().toISOString());
  });
  tx();

  const counts = {
    items: db.prepare('SELECT COUNT(*) c FROM items').get().c,
    relics: db.prepare('SELECT COUNT(*) c FROM relics').get().c,
    articles: db.prepare('SELECT COUNT(*) c FROM articles').get().c,
  };
  setMeta(db, 'counts', JSON.stringify(counts));
  log(`[ingest] concluído: ${counts.items} itens, ${counts.relics} relíquias, ${counts.articles} artigos.`);
  return counts;
}

module.exports = { runIngest, groupRelics, parseFrontmatter, slimItem, loadArticles, CATEGORIES };

if (require.main === module) {
  runIngest({}).then(
    () => process.exit(0),
    (err) => { console.error('[ingest] ERRO:', err); process.exit(1); }
  );
}
