'use strict';

/**
 * Monta o detalhe de um item: componentes com relíquias (disponível vs
 * vaulted, chances intact/radiante), outras fontes de drop, requisitos de
 * forja, fissuras ativas relevantes e o passo a passo em PT-BR.
 */

const { getDb } = require('./db');
const { getFissures } = require('./worldstate');
const { getResourceDrops } = require('./drops');
const { getQuestInfo } = require('./questwiki');
const { getTopOrders } = require('./market');
const { placePt } = require('../public/js/places');
const { COMMON_RESOURCES } = require('./util');

// sufixo EN de cosmético/coisa → rótulo PT (mostrado ANTES do nome, com ":")
const REWARD_SUFFIX = {
  scene: 'Cena', portrait: 'Retrato', glyph: 'Glifo', sigil: 'Emblema', emblem: 'Emblema',
  segment: 'Segmento', decoration: 'Decoração', noggle: 'Estatueta', mod: 'Mod',
};

/**
 * Traduz uma recompensa de quest da wiki para PT com a ORDEM certa (o sufixo
 * inglês vira prefixo: "Orvius Blueprint" → "Orvius (Projeto)", "Alone Portrait"
 * → "Retrato: Alone"). Nome de item conhecido vira name_pt; nomes próprios/
 * conceitos ficam como estão (não há tradução confiável).
 */
function rewardPt(reward, nameLookup) {
  const s = String(reward).trim();
  const nameOr = (base) => nameLookup(base.trim()) || base.trim();
  let m;
  if ((m = s.match(/^(.+) Blueprint$/i))) return `${nameOr(m[1])} (Projeto)`;
  if ((m = s.match(/^(.+) Unlocked$/i))) return `${nameOr(m[1])} desbloqueado`;
  if ((m = s.match(/^(.+) Access$/i))) return `Acesso: ${nameOr(m[1])}`;
  if ((m = s.match(/^(.+) (\w+)$/)) && REWARD_SUFFIX[m[2].toLowerCase()]) {
    return `${REWARD_SUFFIX[m[2].toLowerCase()]}: ${nameOr(m[1])}`;
  }
  return nameLookup(s) || s;
}

const REWARD_SUFFIX_RE = /\s+(Blueprint|Scene|Portrait|Glyph|Sigil|Emblem|Segment|Decoration|Noggle|Mod)$/i;

/**
 * Enriquece as recompensas de quest (string[]) em [{label, image, wiki}]: acha a
 * arte no dataset (itens) E no mapa de cosméticos (assets — retratos/cenas/glifos),
 * casando o nome cru E sem o sufixo de tipo ("Blueprint"/"Portrait"…). label =
 * traduzido em PT, cru em EN; wiki = link da página do nome canônico que casou.
 */
function enrichRewards(rewards, db, lang) {
  const findItem = db.prepare('SELECT image_name, name_pt FROM items WHERE name = ? LIMIT 1');
  const findAsset = db.prepare('SELECT image_name FROM assets WHERE name = ? LIMIT 1');
  const nameLookup = (nm) => { const r = findItem.get(nm); return r && r.name_pt ? r.name_pt : null; };
  return rewards.map((rw) => {
    const raw = String(rw).trim();
    const base = raw.replace(REWARD_SUFFIX_RE, '').trim();
    // "Jade Blueprint" casa o ITEM Jade pelo base; "Alone Portrait" casa o ASSET
    // pelo nome cru (o cosmético guarda o nome completo). canonical → link da wiki.
    const itBase = findItem.get(base);
    const itRaw = base !== raw ? findItem.get(raw) : null;
    const asRaw = findAsset.get(raw);
    const asBase = base !== raw ? findAsset.get(base) : null;
    let image = null; let canonical = raw; let isItem = false;
    if (itBase) { image = itBase.image_name; canonical = base; isItem = true; }
    else if (itRaw) { image = itRaw.image_name; canonical = raw; isItem = true; }
    else if (asRaw) { image = asRaw.image_name; canonical = raw; }
    else if (asBase) { image = asBase.image_name; canonical = base; }
    return {
      label: lang === 'pt' ? rewardPt(rw, nameLookup) : raw,
      image: image ? CDN_IMG + image : null,
      // item real tem página própria (/w/); cosmético (asset) ou desconhecido → busca
      wiki: isItem ? wikiUrlFor(canonical) : wikiSearchFor(canonical),
    };
  });
}

const CDN_IMG = 'https://cdn.warframestat.us/img/';
const WIKI_BASE = 'https://wiki.warframe.com/w/';

/** URL da página da wiki a partir do nome (título canônico EN, espaços → _). */
function wikiUrlFor(name) {
  const slug = String(name || '').trim().replace(/\s+/g, '_');
  if (!slug) return null;
  // encodeURIComponent encoda tudo (incl. "/" → %2F): sem risco de path traversal
  return WIKI_BASE + encodeURIComponent(slug);
}

const WIKI_SEARCH = 'https://wiki.warframe.com/index.php?search=';
/**
 * URL de BUSCA na wiki — usada quando o alvo não tem página própria (peças de
 * prime tipo "Braton Prime Barrel" e cosméticos tipo "Alone Portrait" caem em
 * 404 no /w/, mas vivem dentro da página do set/quest). A busca sempre resolve.
 */
function wikiSearchFor(name) {
  const q = String(name || '').trim();
  return q ? WIKI_SEARCH + encodeURIComponent(q) : null;
}
const RELIC_RE = /^(Lith|Meso|Neo|Axi|Requiem) (\S+) Relic(?: \((Exceptional|Flawless|Radiant)\))?$/;
const RARITY_PT = { Common: 'Comum', Uncommon: 'Incomum', Rare: 'Rara', Legendary: 'Lendária' };

const compAnchor = (name) => 'c-' + String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-');

const rarityLabel = (r, lang = 'pt') => (lang === 'pt' ? (RARITY_PT[r] || r || '') : (r || ''));

function marketSlugFor(name) {
  return String(name).toLowerCase()
    .replace(/['&.]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function fmtBuildTime(sec, lang = 'pt') {
  if (!Number.isFinite(sec) || sec <= 0) return null;
  const h = sec / 3600;
  if (h >= 48) return `${Math.round(h / 24)} ${lang === 'pt' ? 'dias' : 'days'}`;
  if (h >= 1) return `${Math.round(h)} h`;
  return `${Math.round(sec / 60)} min`;
}

const fmtPct = (n, lang = 'pt') => (n == null ? null : (lang === 'pt' ? `${String(n).replace('.', ',')}%` : `${n}%`));

/** Separa drops de um componente em relíquias (agrupadas) e outras fontes. */
function classifyDrops(drops) {
  const relicMap = new Map();
  const other = [];
  for (const d of Array.isArray(drops) ? drops : []) {
    const m = typeof d.location === 'string' ? d.location.match(RELIC_RE) : null;
    if (m) {
      const relic = `${m[1]} ${m[2]}`;
      const refinement = m[3] || 'Intact';
      let entry = relicMap.get(relic);
      if (!entry) {
        entry = { relic, tier: m[1], rarity: d.rarity, chanceIntact: null };
        relicMap.set(relic, entry);
      }
      if (refinement === 'Intact') {
        entry.chanceIntact = d.chance;
        entry.rarity = d.rarity;
      }
    } else if (d.location) {
      other.push(d);
    }
  }
  const dedup = new Map();
  for (const d of other) {
    const prev = dedup.get(d.location);
    if (!prev || (d.chance || 0) > (prev.chance || 0)) dedup.set(d.location, d);
  }
  return {
    relics: [...relicMap.values()],
    other: [...dedup.values()].sort((a, b) => (b.chance || 0) - (a.chance || 0)).slice(0, 10),
  };
}

function decorateRelics(db, relicRefs, fullName, fissuresByTier, relicCache) {
  const getRelic = (name) => {
    if (!relicCache.has(name)) {
      relicCache.set(name, db.prepare('SELECT * FROM relics WHERE name = ?').get(name) || null);
    }
    return relicCache.get(name);
  };
  const out = relicRefs.map((r) => {
    const rr = getRelic(r.relic);
    let chanceIntact = r.chanceIntact;
    let chanceRadiant = null;
    let marketSlug = null;
    let rarity = r.rarity;
    if (rr) {
      let rewards = {};
      try { rewards = JSON.parse(rr.rewards); } catch { rewards = {}; }
      const findIn = (ref) => {
        const arr = rewards[ref] || [];
        return arr.find((x) => x.name === fullName
          || x.name === `${fullName} Blueprint`
          || `${x.name} Blueprint` === fullName) || null;
      };
      const intact = findIn('Intact');
      const radiant = findIn('Radiant');
      if (intact) {
        chanceIntact = intact.chance;
        marketSlug = intact.marketSlug || null;
        // raridade "de verdade" é a do slot na relíquia intact (o rótulo do
        // drop por refinamento é relativo ao bucket de chance, e confunde)
        if (intact.rarity) rarity = intact.rarity;
      }
      if (radiant) chanceRadiant = radiant.chance;
    }
    let relicDrops = [];
    if (rr && !rr.vaulted) {
      try { relicDrops = JSON.parse(rr.drops).slice(0, 3); } catch { relicDrops = []; }
    }
    return {
      relic: r.relic,
      tier: r.tier,
      rarity,
      rarityPt: RARITY_PT[rarity] || rarity,
      vaulted: rr ? !!rr.vaulted : null,
      chanceIntact,
      chanceRadiant,
      relicDrops,
      activeFissures: rr && !rr.vaulted ? (fissuresByTier[r.tier] || []).length : 0,
      marketSlug,
    };
  });
  out.sort((a, b) =>
    ((a.vaulted ? 1 : 0) - (b.vaulted ? 1 : 0))
    || ((b.chanceIntact || 0) - (a.chanceIntact || 0)));
  return out;
}

/** Passo a passo bilíngue (pt/en). `lang==='pt'` → PT; qualquer outro → EN. */
function buildSteps(raw, comps, itemSources, lang) {
  const en = lang !== 'pt';
  const L = (pt, enStr) => (en ? enStr : pt);
  const pct = (n) => fmtPct(n, lang);
  const steps = [];

  if (Number.isFinite(raw.masteryReq) && raw.masteryReq > 0) {
    steps.push(L(`Requisito: Maestria (MR) ${raw.masteryReq}.`, `Requirement: Mastery Rank (MR) ${raw.masteryReq}.`));
  }

  const relicComps = comps.filter((c) => c.relics.length);
  const farmComps = comps.filter((c) => !c.relics.length && c.otherSources.length);
  const orphanComps = comps.filter((c) => !c.relics.length && !c.otherSources.length
    && !/^(Orokin Cell|Neurodes?|Neural Sensors?|Morphics|Gallium|Control Module|Argon Crystal|Tellurium|Plastids|Rubedo|Salvage|Ferrite|Alloy Plate|Circuits|Polymer Bundle|Cryotic|Oxium|Kuva|Forma|Nano Spores)$/i.test(c.name));

  for (const c of relicComps) {
    const best = c.relics.find((r) => r.vaulted === false);
    if (best) {
      const rar = rarityLabel(best.rarity, lang);
      const where = best.relicDrops[0]
        ? L(` A relíquia dropa em: ${best.relicDrops[0].location} (${pct(best.relicDrops[0].chance)}).`,
            ` The relic drops at: ${best.relicDrops[0].location} (${pct(best.relicDrops[0].chance)}).`)
        : '';
      const chances = [
        best.chanceIntact != null ? `${pct(best.chanceIntact)} intact` : null,
        best.chanceRadiant != null ? `${pct(best.chanceRadiant)} ${L('radiante', 'radiant')}` : null,
      ].filter(Boolean).join(' / ');
      steps.push(L(
        `${c.fullName}: farme a relíquia ${best.relic} (${rar}${chances ? `, ${chances}` : ''}).${where}`,
        `${c.fullName}: farm the ${best.relic} relic (${rar}${chances ? `, ${chances}` : ''}).${where}`));
    } else {
      steps.push(L(
        `${c.fullName}: todas as relíquias estão vaulted — compre a peça de outro jogador (warframe.market) ou aguarde ela voltar na Prime Resurgence (Varzia, Bazar da Maroo).`,
        `${c.fullName}: every relic is vaulted — buy the part from another player (warframe.market) or wait for it to return via Prime Resurgence (Varzia, Maroo's Bazaar).`));
    }
  }
  if (relicComps.length) {
    steps.push(L(
      'Abra as relíquias em fissuras do Void do tier correspondente (lista de fissuras ativas nesta página). Dica: refine para Radiante com 100 Void Traces e abra em grupo (radshare) para melhorar a chance das peças raras.',
      'Crack the relics in Void Fissures of the matching tier (active fissures listed on this page). Tip: refine to Radiant with 100 Void Traces and open in a group (radshare) to improve the odds on rare parts.'));
  }
  for (const c of farmComps) {
    const top = c.otherSources[0];
    const rar = top.rarity ? `, ${rarityLabel(top.rarity, lang)}` : '';
    steps.push(L(
      `${c.fullName}: dropa em ${top.location} (${pct(top.chance)}${rar}).`,
      `${c.fullName}: drops at ${top.location} (${pct(top.chance)}${rar}).`));
  }
  for (const c of orphanComps) {
    steps.push(L(
      `${c.fullName}: sem fonte de drop listada — normalmente vem de quest, pesquisa de clã (Dojo) ou loja; confira a wiki.`,
      `${c.fullName}: no listed drop source — usually from a quest, clan research (Dojo) or a shop; check the wiki.`));
  }

  if (comps.length && Number.isFinite(raw.buildPrice)) {
    const time = fmtBuildTime(raw.buildTime, lang);
    const credits = Number(raw.buildPrice).toLocaleString(en ? 'en-US' : 'pt-BR');
    steps.push(L(
      `Na Foundry: construa cada componente e depois o blueprint principal — ${credits} créditos${time ? `, ${time} de forja` : ''}${raw.skipBuildTimePrice ? ` (apressar: ${raw.skipBuildTimePrice} platina)` : ''}.`,
      `In the Foundry: build each component, then the main blueprint — ${credits} credits${time ? `, ${time} to build` : ''}${raw.skipBuildTimePrice ? ` (rush: ${raw.skipBuildTimePrice} platinum)` : ''}.`));
  }

  if (!comps.length) {
    if (itemSources.relics.length || itemSources.other.length) {
      const top = itemSources.other[0] || null;
      if (top) steps.push(L(`Melhor fonte: ${top.location} (${pct(top.chance)}).`, `Best source: ${top.location} (${pct(top.chance)}).`));
    } else {
      steps.push(L(
        'Este item não tem fonte de drop listada nas tabelas oficiais — normalmente vem de quest, pesquisa de clã (Dojo), loja de sindicato ou do Mercado (créditos). Confira a página da wiki para o caminho exato.',
        'This item has no drop source in the official tables — usually from a quest, clan research (Dojo), a syndicate shop or the Market (credits). Check the wiki page for the exact path.'));
    }
  }
  return steps;
}

async function buildItemDetail(uniqueName, lang = 'pt') {
  const db = getDb();
  const row = db.prepare('SELECT * FROM items WHERE unique_name = ?').get(uniqueName);
  if (!row) return null;
  let raw;
  try { raw = JSON.parse(row.raw); } catch { return null; }

  let fissures = [];
  try { fissures = await getFissures(); } catch { fissures = []; }
  const fissuresByTier = {};
  for (const f of fissures) (fissuresByTier[f.tier] ||= []).push(f);

  // dados do WFCD podem repetir componentes (ex.: Akfuris → 2× Furis):
  // mescla por nome somando a quantidade
  const merged = new Map();
  for (const c of Array.isArray(raw.components) ? raw.components : []) {
    const prev = merged.get(c.name);
    if (prev) {
      prev.itemCount = (prev.itemCount || 1) + (c.itemCount || 1);
    } else {
      merged.set(c.name, { ...c, itemCount: c.itemCount || 1 });
    }
  }

  // um componente cujo nome é um item avulso (Morphics, Orokin Cell, plantas…)
  // é ingrediente — mantém o nome dele; peças de fato ganham o prefixo do item
  const isStandalone = db.prepare('SELECT 1 FROM items WHERE name = ? LIMIT 1');
  const standaloneCache = new Map();
  const isIngredient = (name) => {
    if (COMMON_RESOURCES.has(name)) return true;
    if (!standaloneCache.has(name)) standaloneCache.set(name, !!isStandalone.get(name));
    return standaloneCache.get(name);
  };

  const relicCache = new Map();
  const comps = [];
  for (const c of merged.values()) {
    const cls = classifyDrops(c.drops);
    const fullName = c.name.includes(raw.name) || isIngredient(c.name)
      ? c.name
      : `${raw.name} ${c.name}`;
    const relics = decorateRelics(db, cls.relics, fullName, fissuresByTier, relicCache);
    // recurso bruto (Orokin Cell, Morphics…) nunca é "vaulted" — sempre farmável
    const available = isIngredient(c.name) || relics.some((r) => r.vaulted === false) || cls.other.length > 0;
    const marketSlug = (relics.find((r) => r.marketSlug) || {}).marketSlug
      || (c.tradable ? marketSlugFor(fullName) : null);
    comps.push({
      name: c.name,
      fullName,
      itemCount: c.itemCount || 1,
      image: c.imageName ? CDN_IMG + c.imageName : null,
      ducats: c.ducats || null,
      tradable: !!c.tradable,
      available,
      relics,
      otherSources: cls.other,
      resourceDrops: [],
      // link da wiki p/ TODO componente: recurso/ingrediente tem página própria
      // (/w/Orokin_Cell); peça de prime (Braton Prime Barrel) não → cai na busca
      wikiUrl: isIngredient(c.name) ? wikiUrlFor(c.name) : wikiSearchFor(fullName),
      marketSlug,
      anchor: compAnchor(c.name),
    });
  }

  // componentes-recurso sem fonte no nosso dataset (Orokin Cell, Morphics…):
  // busca "onde dropa" na API de drops e gera o link da wiki, em vez de só
  // dizer "sem fonte". Em paralelo (1–2 por item), com cache no módulo de drops.
  const needDrops = comps.filter((c) => !c.relics.length && !c.otherSources.length);
  await Promise.all(needDrops.map(async (c) => {
    try { c.resourceDrops = await getResourceDrops(c.name); } catch { c.resourceDrops = []; }
  }));

  // índice reverso: quais itens usam ESTE como componente (ex.: Furis → Afuris)
  const usedToBuild = db.prepare(
    `SELECT cu.product_unique AS uniqueName, cu.item_count AS itemCount,
            i.name, i.name_pt AS namePt, i.image_name AS imageName, i.vaulted
     FROM crafting_uses cu JOIN items i ON i.unique_name = cu.product_unique
     WHERE cu.component_unique = ?
     ORDER BY i.name`
  ).all(uniqueName).map((u) => ({
    uniqueName: u.uniqueName,
    name: u.name,
    namePt: u.namePt,
    image: u.imageName ? CDN_IMG + u.imageName : null,
    itemCount: u.itemCount,
    vaulted: u.vaulted === 1 ? true : u.vaulted === 0 ? false : null,
    url: `/item.html?u=${encodeURIComponent(u.uniqueName)}`,
  }));

  let itemSources = classifyDrops(raw.drops);
  // Recurso próprio (Plastids, Neurodes, Orokin Cell…): "onde farmar" é o que o
  // usuário quer. Se não há drop no dataset, busca na API de drops — mesmo que o
  // recurso seja CRAFTÁVEL (o Orokin Cell tem receita: Alloy Plate/Nano Spores/
  // Salvage), pois farmar é a forma comum de obtê-lo; por isso NÃO condiciona a
  // `!comps.length`.
  const isResourceItem = row.category === 'Resources' || raw.type === 'Resource';
  if (isResourceItem && !itemSources.other.length && !itemSources.relics.length) {
    try {
      const d = await getResourceDrops(raw.name);
      if (d.length) itemSources = { relics: [], other: d };
    } catch { /* mantém vazio */ }
  } else if (!comps.length && !itemSources.other.length && !itemSources.relics.length) {
    // item comum sem componentes e sem fonte no dataset: tenta a API mesmo assim
    try {
      const d = await getResourceDrops(raw.name);
      if (d.length) itemSources = { relics: [], other: d };
    } catch { /* mantém vazio */ }
  }
  // recurso FARMÁVEL não mostra a receita de craft (raramente usada) — foca no
  // drop; recurso só-craftável (ex.: Fieldron, sem drop) MANTÉM a receita.
  const farmable = itemSources.other.length > 0 || itemSources.relics.length > 0;
  const outComps = (isResourceItem && farmable) ? [] : comps;

  // fissuras só dos tiers que interessam para este item
  const neededTiers = new Set();
  for (const c of comps) {
    for (const r of c.relics) if (r.vaulted === false) neededTiers.add(r.tier);
  }
  const relevantFissures = {};
  for (const tier of neededTiers) relevantFissures[tier] = fissuresByTier[tier] || [];

  const isPrime = / Prime( |$)/.test(raw.name);
  const isQuest = row.category === 'Quests';
  // requisitos/recompensas da quest (wiki, cacheado no banco) — o dataset da DE
  // não traz esses campos de forma estruturada
  let questInfo = null;
  if (isQuest) { try { questInfo = await getQuestInfo(db, row.unique_name, raw.name); } catch { questInfo = null; } }

  // PT: traduz os locais de drop (planeta/tipo/rotação) em tudo que os embute —
  // sources, relíquias, drops de recurso e o passo a passo. Feito ANTES de
  // buildSteps para o passo a passo sair traduzido também. CLONA os objetos
  // (map+spread) em vez de mutar: alguns arrays vêm de cache compartilhado
  // (getResourceDrops) — mutar corromperia o cache e vazaria PT para o EN.
  if (lang === 'pt') {
    const trLoc = (arr) => (Array.isArray(arr)
      ? arr.map((s) => (s && s.location ? { ...s, location: placePt(s.location) } : s))
      : arr);
    itemSources.other = trLoc(itemSources.other);
    for (const c of outComps) {
      c.otherSources = trLoc(c.otherSources);
      c.resourceDrops = trLoc(c.resourceDrops);
      for (const r of c.relics) r.relicDrops = trLoc(r.relicDrops);
    }
  }

  // recompensas de quest: string[] → [{label, image}] (label traduzido em PT)
  if (questInfo && questInfo.reward && questInfo.reward.length) {
    questInfo = { ...questInfo, reward: enrichRewards(questInfo.reward, db, lang) };
  }

  return {
    uniqueName: row.unique_name,
    name: raw.name,
    namePt: row.name_pt,
    category: row.category,
    type: raw.type || row.category,
    isQuest,
    questInfo,
    description: (lang === 'pt' ? (raw.descriptionPt || raw.description) : raw.description) || '',
    vaulted: row.vaulted === 1 ? true : row.vaulted === 0 ? false : null,
    image: raw.imageName ? CDN_IMG + raw.imageName : null,
    // dataset traz wiki só p/ alguns; gera do nome quando falta (quests, etc.)
    wikiUrl: row.wiki_url || wikiUrlFor(raw.name),
    masteryReq: Number.isFinite(raw.masteryReq) ? raw.masteryReq : null,
    tradable: !!row.tradable,
    crafting: outComps.length ? {
      credits: Number.isFinite(raw.buildPrice) ? raw.buildPrice : null,
      time: fmtBuildTime(raw.buildTime, lang),
      rushPlatinum: Number.isFinite(raw.skipBuildTimePrice) ? raw.skipBuildTimePrice : null,
      marketCost: Number.isFinite(raw.marketCost) && raw.marketCost > 0 ? raw.marketCost : null,
    } : null,
    components: outComps,
    usedToBuild,
    sources: itemSources,
    steps: buildSteps(raw, outComps, itemSources, lang),
    setMarketSlug: row.tradable && isPrime ? marketSlugFor(`${raw.name} set`) : null,
    fissures: relevantFissures,
  };
}

function buildRelicDetail(name) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM relics WHERE name = ?').get(name);
  if (!row) return null;
  let rewards = {};
  let drops = [];
  try { rewards = JSON.parse(row.rewards); } catch { rewards = {}; }
  try { drops = JSON.parse(row.drops); } catch { drops = []; }

  // linka cada recompensa ao item pai (para navegar peça → item). O match EXATO
  // vem antes: "X Prime Blueprint" limpa p/ "X Prime" (é o próprio item); sem o
  // exato o prefixo casaria o item BASE "X" (bug).
  const findExact = db.prepare('SELECT unique_name, name FROM items WHERE name = ?');
  const findParent = db.prepare(
    "SELECT unique_name, name FROM items WHERE ? LIKE name || ' %' ORDER BY LENGTH(name) DESC LIMIT 1"
  );
  for (const ref of Object.keys(rewards)) {
    for (const rw of rewards[ref]) {
      const cleanName = String(rw.name).replace(/ Blueprint$/, '');
      const parent = findExact.get(cleanName) || findParent.get(cleanName) || findParent.get(rw.name);
      rw.rarityPt = RARITY_PT[rw.rarity] || rw.rarity;
      if (parent) rw.parentUrl = `/item.html?u=${encodeURIComponent(parent.unique_name)}`;
    }
  }
  return {
    name: row.name,
    tier: row.tier,
    code: row.code,
    vaulted: !!row.vaulted,
    drops,
    rewards,
  };
}

const TIER_ORDER = { Lith: 1, Meso: 2, Neo: 3, Axi: 4 };
const PRIME_TIERS = ['Lith', 'Meso', 'Neo', 'Axi'];

/** Tiers de relíquia com fissura ativa que dropam prime (a partir das fissuras). */
function activePrimeTiers(fissures) {
  const active = new Set();
  let omnia = false; // fissura Omnia (Steel Path especial) aceita qualquer relíquia
  for (const f of Array.isArray(fissures) ? fissures : []) {
    if (f.tier === 'Omnia') omnia = true;
    else if (PRIME_TIERS.includes(f.tier)) active.add(f.tier);
  }
  if (omnia) for (const t of PRIME_TIERS) active.add(t);
  return PRIME_TIERS.filter((t) => active.has(t));
}

// preço do set no warframe.market, em lotes (respeita o rate-limit) — o
// getTopOrders já cacheia por slug no SQLite; aqui só orquestra a busca.
async function addSetPrices(items) {
  const CONC = 6;
  for (let i = 0; i < items.length; i += CONC) {
    await Promise.all(items.slice(i, i + CONC).map(async (it) => {
      it.marketSlug = marketSlugFor(`${it.name} set`);
      it.platinum = null;
      try {
        const d = await getTopOrders(it.marketSlug);
        if (d && !d.error && !d.notFound && Number.isFinite(d.minSell)) it.platinum = d.minSell;
      } catch { /* item sem mercado — fica sem preço */ }
    }));
  }
}

// cache do resultado inteiro (com preços) por tiers ativos — evita re-buscar os
// ~36 preços a cada request da home/página de fissuras
const FARMABLE_TTL_MS = 15 * 60 * 1000;
let farmableCache = null; // { key, data, at }

/**
 * "O que dá pra farmar agora": cruza os tiers com fissura ativa × relíquias
 * disponíveis (não-vaulted) desses tiers → agrupa as recompensas pelo item pai
 * (arma/warframe prime). Com `prices`, anexa o menor preço do set no
 * warframe.market e ordena por valor (mais caro primeiro).
 */
async function buildFarmable(fissuresArg, { prices = true } = {}) {
  const db = getDb();
  let fissures = fissuresArg;
  if (!fissures) { try { fissures = await getFissures(); } catch { fissures = []; } }
  const tiers = activePrimeTiers(fissures);
  if (!tiers.length) return { tiers: [], items: [] };

  const cacheKey = `${prices ? 'p:' : 'n:'}${tiers.join(',')}`;
  if (farmableCache && farmableCache.key === cacheKey && Date.now() - farmableCache.at < FARMABLE_TTL_MS) {
    return farmableCache.data;
  }

  const relics = db.prepare(
    `SELECT tier, rewards FROM relics WHERE vaulted = 0 AND tier IN (${tiers.map(() => '?').join(',')})`
  ).all(...tiers);

  // recompensa → item pai. Um blueprint principal ("Afentis Prime Blueprint")
  // limpa para "Afentis Prime", que É o próprio item (match EXATO) — sem o exato,
  // o prefixo mais longo casaria o item BASE "Afentis" (bug). Uma peça
  // ("Afentis Prime Barrel") não é item exato → cai no prefixo mais longo.
  const cols = 'unique_name, name, name_pt, category, image_name';
  const findExact = db.prepare(`SELECT ${cols} FROM items WHERE name = ?`);
  const findParent = db.prepare(
    `SELECT ${cols} FROM items WHERE ? LIKE name || ' %' ORDER BY LENGTH(name) DESC LIMIT 1`
  );
  const parentCache = new Map();
  const parentOf = (rewardName) => {
    const clean = rewardName.replace(/ Blueprint$/, '');
    if (parentCache.has(clean)) return parentCache.get(clean);
    const p = findExact.get(clean) || findParent.get(clean) || findParent.get(rewardName) || null;
    parentCache.set(clean, p);
    return p;
  };

  const bySet = new Map(); // unique_name -> { …item, tiers:Set }
  for (const r of relics) {
    let rw; try { rw = JSON.parse(r.rewards); } catch { continue; }
    const names = new Set(Object.values(rw).flat().map((x) => x && x.name).filter(Boolean));
    for (const nm of names) {
      if (/\bForma\b/.test(nm)) continue; // Forma não é uma "prime farmável"
      const p = parentOf(nm);
      if (!p) continue;
      let e = bySet.get(p.unique_name);
      if (!e) {
        e = {
          uniqueName: p.unique_name, name: p.name, namePt: p.name_pt, category: p.category,
          image: p.image_name ? CDN_IMG + p.image_name : null,
          url: `/item.html?u=${encodeURIComponent(p.unique_name)}`,
          tiers: new Set(),
        };
        bySet.set(p.unique_name, e);
      }
      e.tiers.add(r.tier);
    }
  }
  const items = [...bySet.values()]
    .map((e) => ({ ...e, tiers: [...e.tiers].sort((a, b) => TIER_ORDER[a] - TIER_ORDER[b]) }));
  if (prices) {
    await addSetPrices(items);
    // mais valioso primeiro; sem preço vai pro fim; empate → alfabético
    items.sort((a, b) => (b.platinum || -1) - (a.platinum || -1) || a.name.localeCompare(b.name));
  } else {
    items.sort((a, b) => a.name.localeCompare(b.name));
  }
  const data = { tiers, items };
  if (prices) farmableCache = { key: cacheKey, data, at: Date.now() };
  return data;
}

module.exports = {
  buildItemDetail, buildRelicDetail, buildFarmable, activePrimeTiers, rewardPt, enrichRewards,
  classifyDrops, marketSlugFor, fmtBuildTime, fmtPct, rarityLabel, buildSteps, wikiUrlFor, wikiSearchFor,
};
