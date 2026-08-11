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
const { fetchJson, escapeHtml, COMMON_RESOURCES } = require('./util');
const { fetchAcquisitionIndex } = require('./wikiacq');
const { getDb, setMeta } = require('./db');

// Sanitização na origem: HTML cru dentro do markdown vira texto escapado e
// links só saem com esquemas seguros - o cliente pode confiar no html gerado.
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
  'Resources', 'Mods', 'Railjack',
];

// tipos DENTRO de Misc.json que valem virar item buscável (gear/coisas que o
// jogador procura), além de recursos. Deixa de fora o lixo (Nightwave Challenge,
// Captura, Conservation Tag, Medallion, Ship-cosmetic, Equipment Adapter…).
const SEARCHABLE_MISC_TYPES = new Set([
  'Amp', 'Focus Lens', 'Eidolon Shard', 'Ayatan Sculpture', 'Cut Gem',
  'Exalted Weapon', 'Kitgun Component', 'K-Drive Component', 'Pet Resource',
  'Ship Segment',
]);

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

/** Guarda só o que o site renderiza - mantém o banco pequeno. */
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

/**
 * Índice reverso "usado para construir": varre os components de cada item e,
 * quando um componente É um item avulso que vale uma página (uma arma/
 * companheiro - não um recurso bruto), registra component -> produto. Ex.:
 * Furis -> Afuris. Casa por `uniqueName` (robusto a nomes iguais). Dedup por
 * (componente, produto), SOMANDO a quantidade quando o produto lista o mesmo
 * componente mais de uma vez (a Afuris pede 2× Furis). `itemRows` = as linhas
 * já montadas para a tabela items (cada uma com `.slim.components`).
 */
function buildCraftingUses(itemRows) {
  const byUnique = new Map(itemRows.map((r) => [r.unique_name, r]));
  const uses = new Map(); // "component product" (uniqueNames não têm espaço) -> linha
  for (const r of itemRows) {
    const comps = r.slim && r.slim.components;
    if (!Array.isArray(comps)) continue;
    for (const c of comps) {
      const cu = c.uniqueName;
      if (!cu || cu === r.unique_name) continue; // sem id ou auto-referência
      const compItem = byUnique.get(cu);
      // só itens avulsos indexados que NÃO são recurso bruto (senão "Morphics
      // usado em 500 coisas" polui) - filtra por categoria e pela lista comum
      if (!compItem || compItem.category === 'Resources' || COMMON_RESOURCES.has(c.name)) continue;
      const key = `${cu} ${r.unique_name}`;
      const prev = uses.get(key);
      if (prev) prev.item_count += (c.itemCount || 1);
      else uses.set(key, {
        component_unique: cu,
        product_unique: r.unique_name,
        product_name: r.name,
        item_count: c.itemCount || 1,
      });
    }
  }
  return [...uses.values()];
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

  // Recursos "clássicos" de craft (Plastids, Ferrite, Orokin Cell, Neurodes…) e
  // os cosméticos de recompensa (retratos/cenas/glifos) vivem em Misc/Skins/
  // Glyphs.json - fora das CATEGORIES. Puxa os RECURSOS como itens buscáveis
  // (página com "onde farmar") e monta um mapa nome→imagem p/ a arte das
  // recompensas de quest, sem jogar 9k cosméticos na busca.
  const assetMap = new Map(); // nome -> image_name (1º vence)
  const addAsset = (nm, img) => { if (nm && img && !assetMap.has(nm)) assetMap.set(nm, img); };
  for (const file of ['Misc.json', 'Skins.json', 'Glyphs.json', 'Sigils.json']) {
    let arr;
    try { arr = await fetchJson(`${RAW_BASE}/${file}`, { timeoutMs: 120000 }); }
    catch (err) { log(`[ingest] ${file} falhou (seguindo): ${err.message}`); continue; }
    if (!Array.isArray(arr)) continue;
    let res = 0;
    for (const it of arr) {
      if (!it || typeof it.name !== 'string') continue;
      addAsset(it.name, it.imageName);
      // recurso de craft = type "Resource" OU usado como ingrediente em alguma
      // receita (`parents`). O WFCD tagueia inconsistente: Neurodes/Ferrite são
      // type "Misc" mas têm parents (115/160 usos) - o `parents>0` os pega; lixo
      // Misc (Archon Shards, itens de evento) tem parents 0 e fica de fora.
      const isCraftRes = it.type === 'Resource'
        || (Array.isArray(it.parents) && it.parents.length > 0);
      const isSearchableMisc = isCraftRes || SEARCHABLE_MISC_TYPES.has(it.type);
      if (file === 'Misc.json' && isSearchableMisc && typeof it.uniqueName === 'string') {
        itemRows.push({
          unique_name: it.uniqueName, name: it.name, name_pt: null,
          // recurso/ingrediente → categoria Resources (kind=resource, página de
          // "onde farmar"); gear de Misc (Amp, Focus Lens…) fica como Misc.
          category: isCraftRes ? 'Resources' : 'Misc',
          type: it.type, mastery_req: Number.isFinite(it.masteryReq) ? it.masteryReq : null,
          vaulted: null,
          image_name: it.imageName || null, wiki_url: it.wikiaUrl || null,
          tradable: it.tradable === true ? 1 : 0, slim: slimItem(it),
        });
        res++;
      }
    }
    log(`[ingest] ${file}: ${arr.length} entradas${res ? ` (+${res} recursos buscáveis)` : ''}`);
  }
  log(`[ingest] mapa de arte (assets): ${assetMap.size} nomes`);

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

  const craftingUses = buildCraftingUses(itemRows);
  log(`[ingest] índice "usado para construir": ${craftingUses.length} relações`);

  // "como conseguir" que não é drop (pesquisa no Dojo, vendedores, Mercado):
  // módulos de dados da wiki. Se a wiki cair, o que já está no banco FICA -
  // por isso a tabela só é reescrita quando veio índice novo.
  let acquisition = null;
  try {
    const res = await fetchAcquisitionIndex({ log });
    if (res.index.size) acquisition = res.index;
    log(`[ingest] aquisição (dojo/vendedor/mercado): ${res.index.size} itens`
      + (res.failed.length ? ` (falharam: ${res.failed.join(', ')})` : ''));
  } catch (err) {
    log(`[ingest] aquisição falhou (mantendo a anterior): ${err.message}`);
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM items').run();
    db.prepare('DELETE FROM assets').run();
    db.prepare('DELETE FROM relics').run();
    db.prepare('DELETE FROM articles').run();
    db.prepare('DELETE FROM crafting_uses').run();

    const insAsset = db.prepare('INSERT OR REPLACE INTO assets(name, image_name) VALUES (?, ?)');
    for (const [nm, img] of assetMap) insAsset.run(nm, img);

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

    const insUse = db.prepare(`INSERT OR REPLACE INTO crafting_uses
      (component_unique, product_unique, product_name, item_count)
      VALUES (@component_unique, @product_unique, @product_name, @item_count)`);
    for (const u of craftingUses) insUse.run(u);

    if (acquisition) {
      db.prepare('DELETE FROM acquisition').run();
      const insAcq = db.prepare('INSERT OR REPLACE INTO acquisition(name, data) VALUES (?, ?)');
      for (const [nm, data] of acquisition) insAcq.run(nm, JSON.stringify(data));
    }

    setMeta(db, 'last_ingest', new Date().toISOString());
  });
  tx();

  const counts = {
    items: db.prepare('SELECT COUNT(*) c FROM items').get().c,
    assets: db.prepare('SELECT COUNT(*) c FROM assets').get().c,
    relics: db.prepare('SELECT COUNT(*) c FROM relics').get().c,
    articles: db.prepare('SELECT COUNT(*) c FROM articles').get().c,
    craftingUses: db.prepare('SELECT COUNT(*) c FROM crafting_uses').get().c,
    acquisition: db.prepare('SELECT COUNT(*) c FROM acquisition').get().c,
  };
  setMeta(db, 'counts', JSON.stringify(counts));
  log(`[ingest] concluído: ${counts.items} itens, ${counts.relics} relíquias, ${counts.articles} artigos.`);
  return counts;
}

module.exports = {
  runIngest, groupRelics, parseFrontmatter, slimItem, loadArticles, buildCraftingUses, CATEGORIES,
};

if (require.main === module) {
  runIngest({}).then(
    () => process.exit(0),
    (err) => { console.error('[ingest] ERRO:', err); process.exit(1); }
  );
}
