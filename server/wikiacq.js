'use strict';

/**
 * "Como conseguir" ESTRUTURADO, a partir dos módulos de dados da wiki oficial.
 *
 * O dataset do WFCD (drop tables da DE) só sabe o que CAI de inimigo/missão.
 * Tudo que se COMPRA ou se PESQUISA fica de fora dele - era por isso que a
 * página da Massa Mutagênica não dizia que o projeto dela é pesquisado no
 * Laboratório de Biologia do Dojo, nem por quanto, nem com quais materiais.
 * Estas três tabelas Lua da wiki fecham esse buraco para TODOS os itens:
 *
 *   Module:Research/data   → pesquisa de clã: laboratório, créditos, materiais,
 *                            tempo, afinidade e pré-requisito.
 *   Module:Vendors/data    → 60+ vendedores (sindicatos, Cetus/Fortuna, Acrithis,
 *                            Kahl, Simaris…): moeda, preço, quantidade e rank.
 *   Module:Blueprints/data → preço do item no Mercado (platina) e do projeto
 *                            avulso (créditos).
 *
 * Baixado na INGESTÃO (1x/dia, junto do resto) e gravado já invertido por nome
 * de item na tabela `acquisition` - a página não faz request nenhum para a wiki.
 */

const { fetchJson } = require('./util');
const { parseLuaModule, positional } = require('./lua');

const WIKI_API = process.env.WF_WIKI_API || 'https://wiki.warframe.com/api.php';

/** Baixa o wikitext de um `Module:` e devolve a tabela já parseada. */
async function fetchLuaModule(page, { timeoutMs = 30000 } = {}) {
  const url = `${WIKI_API}?action=parse&page=${encodeURIComponent(page)}`
    + '&prop=wikitext&format=json&formatversion=2';
  const data = await fetchJson(url, { timeoutMs, retries: 1 });
  const wt = data && data.parse && data.parse.wikitext;
  if (typeof wt !== 'string' || !wt) throw new Error(`sem wikitext em ${page}`);
  return parseLuaModule(wt);
}

// ★ Tetos contra vandalismo na wiki. Qualquer pessoa edita esses módulos, e sem
// limite UMA edição transformava a linha de um item em ~2,8 MB (20 mil ofertas
// + um nome de vendedor de 400 KB), que o banco guarda e o navegador renderiza.
// Nome de item/vendedor/laboratório de verdade tem poucas dezenas de caracteres,
// então o que passa do teto é lixo: descartado, não truncado (nome truncado não
// casaria com o item no banco e ainda mentiria na tela).
const MAX_NAME = 80;
const MAX_VENDORS_PER_ITEM = 12;
const MAX_RESOURCES = 16;
const MAX_ENTRIES = 20000;

const num = (v) => (Number.isFinite(v) ? v : null);
const str = (v) => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return (t && t.length <= MAX_NAME) ? t : null;
};

/** `{Name=…, Count=…}` (tabela Lua com chaves numéricas) → [{name, count}]. */
function resourceList(tbl) {
  return positional(tbl)
    .map((r) => ({ name: str(r && r.Name), count: num(r && r.Count) || 1 }))
    .filter((r) => r.name)
    .slice(0, MAX_RESOURCES);
}

/**
 * Module:Research/data → nome do item → pesquisa no Dojo. `Labs` mapeia a
 * chave da facção ("Infested") para o nome do laboratório ("Bio Lab"), que é
 * o que o jogador procura no Dojo.
 */
function indexResearch(mod) {
  const out = new Map();
  if (!mod || typeof mod !== 'object') return out;
  const labs = mod.Labs || {};
  for (const [name, r] of Object.entries(mod.Research || {})) {
    if (!r || typeof r !== 'object' || !str(name)) continue;
    if (out.size >= MAX_ENTRIES) break;
    const labKey = str(r.Lab);
    const resources = resourceList(r.Resources);
    // entrada sem NADA de útil (as comentadas do Dagath's Hollow) fica de fora
    if (!labKey && !resources.length && !num(r.Credits)) continue;
    out.set(name, {
      lab: labKey,
      labName: str(labs[labKey] && labs[labKey].Name) || labKey,
      credits: num(r.Credits),
      affinity: num(r.Affinity),
      timeSec: num(r.Time),
      prereq: str(r.Prereq),
      resources,
    });
  }
  return out;
}

/**
 * Module:Vendors/data → nome do item → [ofertas]. Cada oferta é uma tabela
 * MISTA: posicionais `{nome, tipo, preço, quantidade}` + nomeados (`Prereq` =
 * rank de sindicato exigido). O preço pode ser número (na moeda do vendedor)
 * OU uma tabela `{Credits = 5000}` (caso do Simaris, que cobra créditos).
 */
function indexVendors(mod) {
  const out = new Map();
  const vendors = (mod && mod.Vendors) || {};
  for (const [key, v] of Object.entries(vendors)) {
    if (!v || typeof v !== 'object') continue;
    const vendorName = str(v.Name) || str(key);
    if (!vendorName) continue; // nome fora do teto = vandalismo, não vendedor
    const currency = str(v.Currency);
    for (const off of positional(v.Offerings)) {
      if (!off || typeof off !== 'object') continue;
      const [name, type, cost, qty] = positional(off);
      const itemName = str(name);
      if (!itemName) continue;
      const entry = {
        vendor: vendorName,
        link: str(v.Link) || vendorName,
        type: str(type),
        qty: num(qty) || 1,
        rank: num(off.Prereq),
        cost: null,
        currency: null,
      };
      if (Number.isFinite(cost)) {
        entry.cost = cost;
        entry.currency = currency;
      } else if (cost && typeof cost === 'object') {
        // preço em outra moeda que não a do vendedor (ex.: {Credits = 5000})
        const [curKey, curVal] = Object.entries(cost).find(([, val]) => Number.isFinite(val)) || [];
        if (curKey) { entry.cost = curVal; entry.currency = curKey; }
      }
      if (entry.cost == null) continue; // oferta sem preço não ajuda ninguém
      const list = out.get(itemName) || [];
      // o MESMO vendedor pode repetir a oferta em rotações; guarda a mais barata
      const dup = list.find((e) => e.vendor === entry.vendor && e.currency === entry.currency);
      if (dup) { if (entry.cost < dup.cost) Object.assign(dup, entry); continue; }
      if (list.length >= MAX_VENDORS_PER_ITEM) continue;
      if (!out.has(itemName) && out.size >= MAX_ENTRIES) continue;
      list.push(entry);
      out.set(itemName, list);
    }
  }
  return out;
}

/**
 * Module:Blueprints/data → nome do item PRONTO → preço de compra.
 * `MarketCost` = platina pelo item no Mercado; `BPCost` = créditos pelo projeto
 * avulso. Indexa por `Result` (o que sai da forja) e, como reserva, pela chave.
 */
function indexMarket(mod) {
  const out = new Map();
  const groups = [mod && mod.Blueprints, mod && mod.Suits];
  for (const group of groups) {
    for (const [key, bp] of Object.entries(group || {})) {
      if (!bp || typeof bp !== 'object' || out.size >= MAX_ENTRIES) continue;
      const platinum = num(bp.MarketCost);
      const blueprintCredits = num(bp.BPCost);
      if (platinum == null && blueprintCredits == null) continue;
      const name = str(bp.Result) || str(key);
      if (name && !out.has(name)) out.set(name, { platinum, blueprintCredits });
    }
  }
  return out;
}

/**
 * Junta os três índices num só mapa `nome do item → {research, vendors, market}`.
 * Só entra nome que tem ALGUMA forma de aquisição (o mapa vira uma linha por
 * item na tabela `acquisition`).
 */
function mergeIndexes({ research, vendors, market }) {
  const names = new Set([...research.keys(), ...vendors.keys(), ...market.keys()]);
  const out = new Map();
  for (const name of names) {
    const entry = {
      research: research.get(name) || null,
      vendors: vendors.get(name) || [],
      market: market.get(name) || null,
    };
    if (!entry.research && !entry.vendors.length && !entry.market) continue;
    out.set(name, entry);
  }
  return out;
}

/**
 * Baixa e indexa os três módulos. Falha de UM módulo não derruba os outros
 * (a wiki pode renomear/remover uma página): o que veio é aproveitado, e o
 * chamador loga o que faltou.
 */
async function fetchAcquisitionIndex({ log = () => {} } = {}) {
  const jobs = [
    ['Module:Research/data', indexResearch, 'research'],
    ['Module:Vendors/data', indexVendors, 'vendors'],
    ['Module:Blueprints/data', indexMarket, 'market'],
  ];
  const parts = { research: new Map(), vendors: new Map(), market: new Map() };
  const failed = [];
  await Promise.all(jobs.map(async ([page, indexer, key]) => {
    try {
      parts[key] = indexer(await fetchLuaModule(page));
      log(`[ingest] ${page}: ${parts[key].size} nomes`);
    } catch (err) {
      failed.push(page);
      log(`[ingest] ${page} falhou (seguindo): ${err.message}`);
    }
  }));
  return { index: mergeIndexes(parts), failed };
}

module.exports = {
  fetchAcquisitionIndex, fetchLuaModule,
  indexResearch, indexVendors, indexMarket, mergeIndexes,
};
