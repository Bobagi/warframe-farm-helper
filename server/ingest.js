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
const { fetchJson, escapeHtml, COMMON_RESOURCES, cleanName, stripIconTags } = require('./util');
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
    image(token) {
      const src = String(token.href || '');
      if (!SAFE_HREF.test(src)) return escapeHtml(token.text || '');
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(token.text || '')}"${title} loading="lazy">`;
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

/**
 * Uma entrada de `Misc.json` vira item buscável? E em que categoria?
 *
 * Cinco critérios, nesta ordem:
 *  1. `type: "Resource"` - o WFCD já diz que é recurso.
 *  2. tem `parents` - é ingrediente de alguma receita (Neurodes/Ferrite são
 *     `type: "Misc"` mas têm 115/160 usos, e é o `parents` que os pega).
 *  3. `SEARCHABLE_MISC_TYPES` - gear de Misc que o jogador procura (Amp, Focus
 *     Lens, escultura Ayatan…).
 *  4. ★ **tem local de drop** (2026-08-11). Os três primeiros exigiam que a
 *     coisa fosse INGREDIENTE, e por isso o site inteiro não conhecia as MOEDAS
 *     e TOKENS do jogo: Vainthorn (Espinobre), Vosfor, Corrupted Holokey,
 *     Archon Shard, o Stock do Kahl. Nenhum é ingrediente de receita nenhuma
 *     (gasta-se com um vendedor), então `parents` vem vazio e o WFCD os deixa
 *     como `type: "Misc"`. Eram 117 coisas farmáveis invisíveis na busca. Se o
 *     jogo DROPA, o site sabe responder "onde consigo" - que é a pergunta do site.
 *  5. ★ **os COMPONENTES têm local de drop** (2026-08-15). O 4 só olha o drop do
 *     próprio item, e o que se FORJA a partir de blueprint dropável escapava:
 *     Orokin Catalyst/Reactor, adaptadores Exilus, Omni Forma, as naves.
 *
 * `viaDrops` marca as dos critérios 4 e 5: elas passam por um guard de nome numa
 * 2ª passada, para nunca criarem uma 2ª página de algo que o site já tem.
 */
function classifyMisc(it) {
  if (!it || typeof it.name !== 'string' || typeof it.uniqueName !== 'string') return { take: false };
  const isIngredient = Array.isArray(it.parents) && it.parents.length > 0;
  const isResource = it.type === 'Resource' || isIngredient;
  if (isResource) return { take: true, viaDrops: false, category: 'Resources' };
  if (SEARCHABLE_MISC_TYPES.has(it.type)) return { take: true, viaDrops: false, category: 'Misc' };
  // ★ o CAMINHO do item no jogo vale mais que a etiqueta `type`: as peças de
  // Kitgun infestado (Vermisplicer, Sporelacer, Arcroid, Thymoid, Palmaris,
  // Ulnaris) vêm tipadas como "Pistol" em vez de "Kitgun Component", e assim
  // escapavam de SEARCHABLE_MISC_TYPES. Quem mora sob /Lotus/Weapons/ é peça de
  // arma, ponto - e o caminho não depende de a DE etiquetar direito.
  if (String(it.uniqueName).startsWith('/Lotus/Weapons/')) {
    return { take: true, viaDrops: false, category: 'Misc' };
  }
  if (Array.isArray(it.drops) && it.drops.length > 0) {
    // moeda/token/fragmento (o balde genérico "Misc") é recurso, com página de
    // "onde farmar"; o resto (cena de Captura, medalhão de sindicato, adaptador
    // de arcana, arena de Simulacrum) fica em Misc e o rótulo mostra o tipo real
    return { take: true, viaDrops: true, category: it.type === 'Misc' ? 'Resources' : 'Misc' };
  }
  // ★ 5. os COMPONENTES têm local de drop (2026-08-15). O critério 4 só olha os
  // drops do PRÓPRIO item, e itens que se obtêm forjando o blueprint dropável
  // ficavam invisíveis: Orokin Catalyst/Reactor (o blueprint cai de sortie/
  // Nightwave), os adaptadores Exilus, Omni Forma e as naves (Mantis, Xiphos,
  // Scimitar, Parallax, cujas peças caem em missão). Se alguma PARTE dele
  // dropa, o site sabe responder "onde consigo" - mesma pergunta, um nível
  // abaixo. Passa pelos mesmos guards de nome da 2ª passada (viaDrops).
  if (Array.isArray(it.components)
      && it.components.some((c) => c && Array.isArray(c.drops) && c.drops.length > 0)) {
    return { take: true, viaDrops: true, category: it.type === 'Misc' ? 'Resources' : 'Misc' };
  }
  return { take: false };
}

/** Linha da tabela `items` a partir de uma entrada de Misc.json já classificada. */
function miscRow(it, category) {
  return {
    unique_name: it.uniqueName, name: cleanName(it.name), name_pt: null, name_zh: null,
    category,
    type: it.type, mastery_req: Number.isFinite(it.masteryReq) ? it.masteryReq : null,
    vaulted: null,
    image_name: it.imageName || null, wiki_url: it.wikiaUrl || null,
    tradable: it.tradable === true ? 1 : 0, slim: slimItem(it),
  };
}

/**
 * Resolve as entradas que só entram pelo critério NOVO (têm local de drop).
 * Roda DEPOIS de todo o resto para não depender da ordem do arquivo, e aplica
 * dois guards, ambos aprendidos na marra:
 *
 *  1. **nome já é item** → o site já responde por ele; entrar de novo criaria
 *     uma 2ª página e um 2º resultado (o WFCD repete a Forma em Misc.json como
 *     `/Lotus/StoreItems/...`, só com drops).
 *  2. **★ nome já é NOME DE PEÇA de alguma receita** → o índice de busca pula o
 *     componente cujo nome já é item próprio (para não gerar "Braton Prime
 *     Orokin Cell"), então promover esse nome a item **apaga da busca todas as
 *     peças com esse nome de uma vez**. A moeda "Stock" do Kahl fez exatamente
 *     isso com 62 armas, entre elas "Braton Prime Stock", que é chip de exemplo
 *     da home. Nome de peça vence nome de moeda.
 *
 * Ordena por `uniqueName` mais curto para a entrada canônica (`/Lotus/Types/…`)
 * ganhar da mirror de loja (`/Lotus/StoreItems/…`) quando as duas existem.
 */
function pickDropOnlyRows(dropOnly, itemRows) {
  const taken = new Set(itemRows.map((r) => r.name));
  const componentNames = new Set();
  for (const r of itemRows) {
    for (const c of (r.slim && r.slim.components) || []) if (c.name) componentNames.add(c.name);
  }
  const rows = [];
  let blocked = 0;
  for (const it of [...dropOnly].sort((a, b) => a.uniqueName.length - b.uniqueName.length)) {
    const name = cleanName(it.name);
    if (taken.has(name) || componentNames.has(name)) { blocked++; continue; }
    taken.add(name);
    rows.push(miscRow(it, classifyMisc(it).category));
  }
  return { rows, blocked };
}

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

/**
 * ★ Catálogo de peças separado (WFCD #992, 2026-09-24). Antes cada item trazia
 * os `components` EMBUTIDOS (nome, imagem, ducats, drops); desde então vem só
 * `{ uniqueName, itemCount }` e a definição mora em `Components.json` (peças
 * de receita) ou no próprio catálogo de itens (recursos como Orokin Cell, que
 * ficam em Resources.json). Passaram 2 semanas sem ninguém notar: o ingest
 * gravou toda página de item sem nome de peça e sem local de drop.
 *
 * `sources` = arrays de entradas; a 1ª definição de um uniqueName vence, então
 * passe `Components.json` primeiro.
 */
function buildComponentCatalog(sources) {
  const byUnique = new Map();
  for (const arr of sources) {
    for (const e of arr || []) {
      if (e && typeof e.uniqueName === 'string' && typeof e.name === 'string' && !byUnique.has(e.uniqueName)) {
        byUnique.set(e.uniqueName, e);
      }
    }
  }
  return byUnique;
}

/**
 * Troca as referências `{ uniqueName, itemCount }` de `it.components` pela
 * definição do catálogo (in place), mantendo o `itemCount` da receita.
 * Componente que já veio com nome (formato antigo) fica como está.
 * Devolve quantas referências havia e quantas ficaram sem resolver.
 */
function resolveComponents(it, catalog) {
  const stats = { refs: 0, missing: 0 };
  if (!it || !Array.isArray(it.components)) return stats;
  it.components = it.components.map((c) => {
    if (!c || typeof c.name === 'string') return c;
    stats.refs++;
    const def = catalog.get(c.uniqueName);
    if (!def) { stats.missing++; return c; }
    const { parentUniqueNames, category, ...rest } = def;
    return { ...rest, ...c, itemCount: c.itemCount || 1 };
  });
  return stats;
}

// Teto de referências sem definição. Acima disso o formato do WFCD mudou de
// novo e gravar seria trocar o banco bom por páginas sem peça (o que aconteceu
// de 24/09 a 08/10/2026): melhor abortar e manter o que já está no ar.
const MAX_MISSING_COMPONENTS = 0.05;

// Idiomas baixados de `i18n/<lang>.json` (um arquivo por idioma desde o #992;
// antes era um `i18n.json` único de ~50MB). pt/zh traduzem nome e descrição de
// item; es/ru só entram nos desafios do Nightwave. Inglês é o próprio dataset.
const I18N_LANGS = ['pt', 'zh', 'es', 'ru'];

/**
 * Aplica as traduções (`i18n` = { pt: {uniqueName: {name, description}}, zh: … })
 * nas linhas de item e nos desafios do Nightwave. Puro (sem rede) para teste.
 */
function applyTranslations(itemRows, challengeRows, i18n) {
  let hits = 0;
  let zhHits = 0;
  for (const row of itemRows) {
    const pt = i18n.pt && i18n.pt[row.unique_name];
    if (pt) {
      const name = cleanName(pt.name);
      if (name && name !== row.name) { row.name_pt = name; hits++; }
      if (pt.description) row.slim.descriptionPt = stripIconTags(pt.description);
    }
    // chinês simplificado: nome E descrição. Diferente de es/ru (onde o nome
    // fica em inglês de propósito, porque market/wiki/trade usam inglês), o
    // servidor chinês do jogo tem nomenclatura PRÓPRIA e o jogador procura
    // por ela - sem isso a busca em chinês não acha nada.
    const zh = i18n.zh && i18n.zh[row.unique_name];
    if (zh) {
      const name = cleanName(zh.name);
      if (name && name !== row.name) { row.name_zh = name; zhHits++; }
      if (zh.description) row.slim.descriptionZh = stripIconTags(zh.description);
    }
  }
  // mesma passada do i18n: traduz os desafios do Nightwave. O dataset deixa
  // tokens de cor tipo `<DT_EXPLOSION>` colados ANTES da palavra traduzida
  // ("Dano <DT_EXPLOSION>Explosivo") - no jogo isso pinta o texto, aqui vazava
  // cru pro jogador (issue: "Detonador" mostrando a tag literal).
  for (const c of challengeRows) {
    c.langs = {};
    for (const l of ['pt', 'en', 'es', 'ru', 'zh']) {
      const v = l === 'en' ? { name: c.en, description: c.enDescr } : (i18n[l] && i18n[l][c.u]);
      if (v && (v.name || v.description)) {
        c.langs[l] = { title: stripIconTags(v.name) || null, descr: stripIconTags(v.description) || null };
      }
    }
  }
  const translated = challengeRows.filter((c) => Object.keys(c.langs).some((l) => l !== 'en')).length;
  return { hits, zhHits, translated };
}

/** Guarda só o que o site renderiza - mantém o banco pequeno. */
function slimItem(it) {
  const s = {
    name: it.name,
    uniqueName: it.uniqueName,
    description: stripIconTags(it.description),
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

/**
 * Artigos do disco, por idioma.
 *
 * `content/<kind>/*.md` é o português (idioma-base do conteúdo) e
 * `content/<kind>/<lang>/*.md` é a tradução, com o MESMO nome de arquivo - é o
 * nome que amarra os dois, então renomear um .md renomeia a tradução junto.
 * Tradução sem original é ignorada (seria um artigo órfão, sem URL canônica).
 */
function loadArticles() {
  const out = [];
  const ler = (kind, dir, file, lang) => {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    const { attrs, body } = parseFrontmatter(src);
    if (!attrs.title) throw new Error(`Artigo sem "title" no frontmatter: ${kind}/${lang}/${file}`);
    return {
      slug: String(attrs.slug || file.replace(/\.md$/, '')),
      lang,
      kind,
      title: String(attrs.title),
      keywords: String(attrs.keywords || ''),
      match_json: attrs.match ? JSON.stringify(attrs.match) : null,
      sort: Number(attrs.order) || 100,
      body_md: body,
      html: marked.parse(body),
    };
  };
  for (const kind of ['faq', 'nightwave', 'legal']) {
    const dir = path.join(CONTENT_DIR, kind);
    if (!fs.existsSync(dir)) continue;
    const base = new Set();
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
      base.add(file);
      out.push(ler(kind, dir, file, 'pt'));
    }
    // subpastas de idioma
    for (const lang of fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^[a-z]{2}$/.test(e.name)).map((e) => e.name)) {
      const sub = path.join(dir, lang);
      for (const file of fs.readdirSync(sub).filter((f) => f.endsWith('.md')).sort()) {
        if (!base.has(file)) continue; // tradução órfã: sem original, sem página
        out.push(ler(kind, sub, file, lang));
      }
    }
  }
  return out;
}

async function runIngest({ log = console.log, includeI18n = true } = {}) {
  const db = getDb();

  log('[ingest] baixando categorias do WFCD/warframe-items...');
  // Baixa TUDO antes de processar: as peças de um item podem estar definidas em
  // Components.json ou em qualquer outro arquivo (Orokin Cell mora em
  // Resources.json), e a classificação do Misc já olha os drops das peças.
  // Sem Components.json o fetch lança e o ingest aborta mantendo o banco atual.
  const componentDefs = await fetchJson(`${RAW_BASE}/Components.json`, { timeoutMs: 120000 });
  if (!Array.isArray(componentDefs)) throw new Error('payload inesperado em Components.json');
  log(`[ingest] Components: ${componentDefs.length} peças`);
  const catArrays = [];
  for (const cat of CATEGORIES) {
    const arr = await fetchJson(`${RAW_BASE}/${encodeURIComponent(cat)}.json`, { timeoutMs: 120000 });
    if (!Array.isArray(arr)) throw new Error(`payload inesperado em ${cat}.json`);
    catArrays.push([cat, arr]);
  }
  const miscArrays = [];
  for (const file of ['Misc.json', 'Skins.json', 'Glyphs.json', 'Sigils.json']) {
    let arr;
    try { arr = await fetchJson(`${RAW_BASE}/${file}`, { timeoutMs: 120000 }); }
    catch (err) { log(`[ingest] ${file} falhou (seguindo): ${err.message}`); continue; }
    if (Array.isArray(arr)) miscArrays.push([file, arr]);
  }
  {
    const catalog = buildComponentCatalog([componentDefs, ...catArrays.map((a) => a[1]), ...miscArrays.map((a) => a[1])]);
    let refs = 0;
    let missing = 0;
    for (const [, arr] of [...catArrays, ...miscArrays]) {
      for (const it of arr) {
        const st = resolveComponents(it, catalog);
        refs += st.refs;
        missing += st.missing;
      }
    }
    log(`[ingest] peças resolvidas: ${refs - missing}/${refs}`);
    if (refs && missing / refs > MAX_MISSING_COMPONENTS) {
      throw new Error(`${missing} de ${refs} peças sem definição no catálogo; formato do WFCD mudou? Banco mantido.`);
    }
  }

  const itemRows = [];
  for (const [cat, arr] of catArrays) {
    log(`[ingest] ${cat}: ${arr.length} itens`);
    for (const it of arr) {
      if (!it || typeof it.uniqueName !== 'string' || typeof it.name !== 'string') continue;
      itemRows.push({
        unique_name: it.uniqueName,
        name: cleanName(it.name),
        name_pt: null,
        name_zh: null,
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
  // desafios do Nightwave: a API do worldstate só manda inglês, mas o dataset
  // tem nome e descrição traduzidos. Chave = último segmento do uniqueName.
  const challengeRows = [];
  const assetMap = new Map(); // nome -> image_name (1º vence)
  const addAsset = (nm, img) => { if (nm && img && !assetMap.has(nm)) assetMap.set(nm, img); };
  // Candidatos do critério NOVO (só drop). Ficam de molho e são resolvidos DEPOIS
  // de todo o resto entrar, porque o guard de nome não pode depender da ordem do
  // arquivo: o WFCD tem duas Formas em Misc.json (a canônica com 71 `parents` e a
  // `/Lotus/StoreItems/...` só com drops) e, se a de loja vier primeiro, um guard
  // feito em uma passada só deixa AS DUAS entrarem.
  const dropOnly = [];
  for (const [file, arr] of miscArrays) {
    let res = 0;
    for (const it of arr) {
      if (!it || typeof it.name !== 'string') continue;
      addAsset(it.name, it.imageName);
      if (file !== 'Misc.json') continue;
      if (it.type === 'Nightwave Challenge' && typeof it.uniqueName === 'string') {
        challengeRows.push({
          key: it.uniqueName.split('/').pop().toLowerCase(), en: it.name, enDescr: it.description, u: it.uniqueName,
        });
      }
      const cls = classifyMisc(it);
      if (!cls.take) continue;
      if (cls.viaDrops) { dropOnly.push(it); continue; } // resolvido na 2ª passada
      itemRows.push(miscRow(it, cls.category));
      res++;
    }
    log(`[ingest] ${file}: ${arr.length} entradas${res ? ` (+${res} recursos buscáveis)` : ''}`);
  }
  {
    const { rows, blocked } = pickDropOnlyRows(dropOnly, itemRows);
    itemRows.push(...rows);
    log(`[ingest] Misc com local de drop no item ou nos componentes (moedas, tokens, cenas, potatoes, naves): +${rows.length}`
      + (blocked ? ` (${blocked} recusados: nome já usado por item ou por peça)` : ''));
  }

  log(`[ingest] mapa de arte (assets): ${assetMap.size} nomes`);

  const relicEntries = await fetchJson(`${RAW_BASE}/Relics.json`, { timeoutMs: 180000 });
  const relics = groupRelics(relicEntries);
  log(`[ingest] Relics: ${relics.length} relíquias (${relicEntries.length} entradas)`);

  let i18nOk = false;
  if (includeI18n) {
    try {
      log(`[ingest] baixando i18n (${I18N_LANGS.join('/')}) para nomes traduzidos...`);
      const i18n = {};
      for (const lang of I18N_LANGS) {
        i18n[lang] = await fetchJson(`${RAW_BASE}/i18n/${lang}.json`, { timeoutMs: 180000, retries: 1 });
      }
      const { hits, zhHits, translated } = applyTranslations(itemRows, challengeRows, i18n);
      log(`[ingest] i18n aplicado: ${hits} nomes pt, ${zhHits} nomes zh, ${translated} desafios do Nightwave`);
      i18nOk = true;
    } catch (err) {
      log(`[ingest] i18n falhou: ${err.message}`);
    }
  }
  if (!i18nOk) {
    // Sem tradução nova, herda a do banco: um dia sem i18n não pode apagar os
    // nomes PT/ZH que já estão no ar (de 24/09 a 08/10/2026 apagou).
    const prev = new Map(db.prepare('SELECT unique_name, name_pt, name_zh, raw FROM items').all()
      .map((r) => [r.unique_name, r]));
    let kept = 0;
    for (const row of itemRows) {
      const p = prev.get(row.unique_name);
      if (!p) continue;
      row.name_pt = p.name_pt;
      row.name_zh = p.name_zh;
      try {
        const old = JSON.parse(p.raw);
        if (old.descriptionPt) row.slim.descriptionPt = old.descriptionPt;
        if (old.descriptionZh) row.slim.descriptionZh = old.descriptionZh;
      } catch { /* raw velho ilegível: segue sem */ }
      if (p.name_pt || p.name_zh) kept++;
    }
    log(`[ingest] i18n: mantidos os nomes traduzidos anteriores (${kept} itens)`);
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
      (unique_name, name, name_pt, name_zh, category, type, mastery_req, vaulted, image_name, wiki_url, tradable, raw)
      VALUES (@unique_name, @name, @name_pt, @name_zh, @category, @type, @mastery_req, @vaulted, @image_name, @wiki_url, @tradable, @raw)`);
    for (const r of itemRows) {
      insItem.run({
        unique_name: r.unique_name, name: r.name, name_pt: r.name_pt, name_zh: r.name_zh || null,
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

    // sem i18n novo os desafios só teriam inglês: mantém a tabela anterior
    if (i18nOk) db.prepare('DELETE FROM challenges').run();
    const insCh = db.prepare('INSERT OR REPLACE INTO challenges(key, lang, title, descr) VALUES (?, ?, ?, ?)');
    for (const c of challengeRows) {
      for (const [l, v] of Object.entries(c.langs || {})) insCh.run(c.key, l, v.title, v.descr);
    }

    const insArt = db.prepare(`INSERT OR REPLACE INTO articles
      (slug, lang, kind, title, keywords, match_json, html, body_md, sort)
      VALUES (@slug, @lang, @kind, @title, @keywords, @match_json, @html, @body_md, @sort)`);
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
  classifyMisc, miscRow, pickDropOnlyRows, buildComponentCatalog, resolveComponents, applyTranslations,
};

if (require.main === module) {
  runIngest({}).then(
    () => process.exit(0),
    (err) => { console.error('[ingest] ERRO:', err); process.exit(1); }
  );
}
