'use strict';

/**
 * Monta o detalhe de um item: componentes com relíquias (disponível vs
 * vaulted, chances intact/radiante), outras fontes de drop, requisitos de
 * forja, fissuras ativas relevantes e o passo a passo em PT-BR.
 */

const { getDb } = require('./db');
const { getFissures } = require('./worldstate');

const CDN_IMG = 'https://cdn.warframestat.us/img/';
const RELIC_RE = /^(Lith|Meso|Neo|Axi|Requiem) (\S+) Relic(?: \((Exceptional|Flawless|Radiant)\))?$/;
const RARITY_PT = { Common: 'Comum', Uncommon: 'Incomum', Rare: 'Rara', Legendary: 'Lendária' };

const compAnchor = (name) => 'c-' + String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-');

function marketSlugFor(name) {
  return String(name).toLowerCase()
    .replace(/['&.]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function fmtBuildTime(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return null;
  const h = sec / 3600;
  if (h >= 48) return `${Math.round(h / 24)} dias`;
  if (h >= 1) return `${Math.round(h)} h`;
  return `${Math.round(sec / 60)} min`;
}

const fmtPct = (n) => (n == null ? null : `${String(n).replace('.', ',')}%`);

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
      rarity: r.rarity,
      rarityPt: RARITY_PT[r.rarity] || r.rarity,
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

function buildSteps(raw, comps, itemSources) {
  const steps = [];
  if (Number.isFinite(raw.masteryReq) && raw.masteryReq > 0) {
    steps.push(`Requisito: Maestria (MR) ${raw.masteryReq}.`);
  }

  const relicComps = comps.filter((c) => c.relics.length);
  const farmComps = comps.filter((c) => !c.relics.length && c.otherSources.length);
  const orphanComps = comps.filter((c) => !c.relics.length && !c.otherSources.length
    && !/^(Orokin Cell|Neurodes?|Neural Sensors?|Morphics|Gallium|Control Module|Argon Crystal|Tellurium|Plastids|Rubedo|Salvage|Ferrite|Alloy Plate|Circuits|Polymer Bundle|Cryotic|Oxium|Kuva|Forma|Nano Spores)$/i.test(c.name));

  for (const c of relicComps) {
    const best = c.relics.find((r) => r.vaulted === false);
    if (best) {
      const where = best.relicDrops[0]
        ? ` A relíquia dropa em: ${best.relicDrops[0].location} (${fmtPct(best.relicDrops[0].chance)}).`
        : '';
      const chances = [
        best.chanceIntact != null ? `${fmtPct(best.chanceIntact)} intact` : null,
        best.chanceRadiant != null ? `${fmtPct(best.chanceRadiant)} radiante` : null,
      ].filter(Boolean).join(' / ');
      steps.push(`${c.fullName}: farme a relíquia ${best.relic} (${best.rarityPt}${chances ? `, ${chances}` : ''}).${where}`);
    } else {
      steps.push(`${c.fullName}: todas as relíquias estão vaulted — compre a peça de outro jogador (warframe.market) ou aguarde ela voltar na Prime Resurgence (Varzia, Bazar da Maroo).`);
    }
  }
  if (relicComps.length) {
    steps.push('Abra as relíquias em fissuras do Void do tier correspondente (lista de fissuras ativas nesta página). Dica: refine para Radiante com 100 Void Traces e abra em grupo (radshare) para melhorar a chance das peças raras.');
  }
  for (const c of farmComps) {
    const top = c.otherSources[0];
    const rarity = top.rarity ? `, ${RARITY_PT[top.rarity] || top.rarity}` : '';
    steps.push(`${c.fullName}: dropa em ${top.location} (${fmtPct(top.chance)}${rarity}).`);
  }
  for (const c of orphanComps) {
    steps.push(`${c.fullName}: sem fonte de drop listada — normalmente vem de quest, pesquisa de clã (Dojo) ou loja; confira a wiki.`);
  }

  if (comps.length && Number.isFinite(raw.buildPrice)) {
    const time = fmtBuildTime(raw.buildTime);
    steps.push(`Na Foundry: construa cada componente e depois o blueprint principal — ${Number(raw.buildPrice).toLocaleString('pt-BR')} créditos${time ? `, ${time} de forja` : ''}${raw.skipBuildTimePrice ? ` (apressar: ${raw.skipBuildTimePrice} platina)` : ''}.`);
  }

  if (!comps.length) {
    if (itemSources.relics.length || itemSources.other.length) {
      const top = itemSources.other[0] || null;
      if (top) steps.push(`Melhor fonte: ${top.location} (${fmtPct(top.chance)}).`);
    } else {
      steps.push('Este item não tem fonte de drop listada nas tabelas oficiais — normalmente vem de quest, pesquisa de clã (Dojo), loja de sindicato ou do Mercado (créditos). Confira a página da wiki para o caminho exato.');
    }
  }
  return steps;
}

async function buildItemDetail(uniqueName) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM items WHERE unique_name = ?').get(uniqueName);
  if (!row) return null;
  let raw;
  try { raw = JSON.parse(row.raw); } catch { return null; }

  let fissures = [];
  try { fissures = await getFissures(); } catch { fissures = []; }
  const fissuresByTier = {};
  for (const f of fissures) (fissuresByTier[f.tier] ||= []).push(f);

  const relicCache = new Map();
  const comps = [];
  for (const c of Array.isArray(raw.components) ? raw.components : []) {
    const fullName = c.name.includes(raw.name) ? c.name : `${raw.name} ${c.name}`;
    const cls = classifyDrops(c.drops);
    const relics = decorateRelics(db, cls.relics, fullName, fissuresByTier, relicCache);
    const available = relics.some((r) => r.vaulted === false) || cls.other.length > 0;
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
      marketSlug,
      anchor: compAnchor(c.name),
    });
  }

  const itemSources = classifyDrops(raw.drops);

  // fissuras só dos tiers que interessam para este item
  const neededTiers = new Set();
  for (const c of comps) {
    for (const r of c.relics) if (r.vaulted === false) neededTiers.add(r.tier);
  }
  const relevantFissures = {};
  for (const tier of neededTiers) relevantFissures[tier] = fissuresByTier[tier] || [];

  const isPrime = / Prime( |$)/.test(raw.name);

  return {
    uniqueName: row.unique_name,
    name: raw.name,
    namePt: row.name_pt,
    category: row.category,
    type: raw.type || row.category,
    description: raw.descriptionPt || raw.description || '',
    vaulted: row.vaulted === 1 ? true : row.vaulted === 0 ? false : null,
    image: raw.imageName ? CDN_IMG + raw.imageName : null,
    wikiUrl: row.wiki_url,
    masteryReq: Number.isFinite(raw.masteryReq) ? raw.masteryReq : null,
    tradable: !!row.tradable,
    crafting: comps.length ? {
      credits: Number.isFinite(raw.buildPrice) ? raw.buildPrice : null,
      time: fmtBuildTime(raw.buildTime),
      rushPlatinum: Number.isFinite(raw.skipBuildTimePrice) ? raw.skipBuildTimePrice : null,
      marketCost: Number.isFinite(raw.marketCost) && raw.marketCost > 0 ? raw.marketCost : null,
    } : null,
    components: comps,
    sources: itemSources,
    steps: buildSteps(raw, comps, itemSources),
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

  // linka cada recompensa ao item pai (para navegar peça → item)
  const findParent = db.prepare(
    "SELECT unique_name, name FROM items WHERE ? LIKE name || ' %' ORDER BY LENGTH(name) DESC LIMIT 1"
  );
  for (const ref of Object.keys(rewards)) {
    for (const rw of rewards[ref]) {
      const cleanName = String(rw.name).replace(/ Blueprint$/, '');
      const parent = findParent.get(cleanName) || findParent.get(rw.name);
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

module.exports = { buildItemDetail, buildRelicDetail, classifyDrops, marketSlugFor, fmtBuildTime };
