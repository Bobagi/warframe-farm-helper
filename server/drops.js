'use strict';

/**
 * "Onde dropa" para recursos - tanto os que faltam no dataset local (Orokin
 * Cell, Morphics) quanto, desde 2026-08-30, TODO recurso (mesmo com entradas
 * no dataset), porque só esta API carrega a QUANTIDADE por drop. Busca na API
 * de drops do warframestat.us e resume os melhores locais, dedup por local,
 * ordenado pelo VALOR ESPERADO (chance × quantidade) - não pela % isolada.
 * Cache longo em memória: drop de recurso muda raríssimo (só em grandes updates).
 */

const { fetchJson } = require('./util');
const { enemyWikiUrl } = require('./enemywiki');
const { bountyHubFor } = require('./bountyHubs');
const { isCacheSource } = require('./cacheSource');

const TTL_MS = 24 * 60 * 60 * 1000; // 24h
// mesmo motivo/valor do slice(0, 30) de classifyDrops em itemview.js: 8 era
// baixo demais (Orokin Cell tem 96 locais distintos na API, só 8 chegavam à
// página) - ver o comentário lá para o caso concreto que motivou o aumento.
const MAX_LOCATIONS = 30;
const cache = new Map(); // nome(lower) -> { data, at }

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Retorna [{ location, chance, qty, ev, rarity }] dos melhores locais que
 * dropam `name`, ordenado por `ev` (valor esperado = chance × qty) desc.
 * Casa o item exato ("Orokin Cell") e as variantes de quantidade ("2X Orokin
 * Cell") no MESMO local, ficando com a de maior valor esperado por local.
 */
async function getResourceDrops(name) {
  if (!name || typeof name !== 'string') return [];
  const key = name.toLowerCase();
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.data;

  let arr;
  try {
    arr = await fetchJson(
      `https://api.warframestat.us/drops/search/${encodeURIComponent(name)}`,
      { timeoutMs: 12000, retries: 1 }
    );
  } catch {
    return hit ? hit.data : []; // serve o cache velho se a API cair
  }
  const data = summarize(arr, name);
  cache.set(key, { data, at: now });
  return data;
}

/** Junta as rotações A/B/C do mesmo bounty num local só (ruído p/ recurso). */
const baseLocation = (loc) => loc.replace(/,\s*Rot(?:ation)?\s+[A-Z]$/i, '').trim();

// esta API abrevia "Rotation" pra "Rot" ("...), Rot B") - o dataset local
// (WFCD warframe-items) sempre usa a palavra inteira, e é ela que `placeIn`
// (public/js/places.js) sabe traduzir. Sem normalizar, um Contrato cuja
// rotação sobrevive no texto (ver `summarize`) saía com "Rot B" intocado no
// meio de uma frase em português. Só casa a forma ABREVIADA - "Rotation B"
// não tem espaço logo após "Rot", então não bate de novo.
const expandRot = (loc) => loc.replace(/,\s*Rot\s+([A-Za-z])$/, ', Rotation $1');

// a API devolve a quantidade por drop EMBUTIDA no nome do item ("750X
// Circuits", "2X Orokin Cell") - sem isto a % sozinha engana: 12,65% por um
// baú que rende 750 (94,875 esperado) parece pior que 25% de uma bounty que
// rende bem menos, quando na prática é o oposto. Sem prefixo = 1 por drop.
const QTY_RE = /^(\d+)\s*[Xx]\s+/;

/** Extrai a quantidade do prefixo "NX " do nome do item; sem prefixo = 1. */
function parseQty(itemStr) {
  const m = QTY_RE.exec(String(itemStr || ''));
  return m ? parseInt(m[1], 10) : 1;
}

/** Resume a resposta crua da API num top-N de locais (testável sem rede). */
function summarize(arr, name) {
  if (!Array.isArray(arr)) return [];
  const rx = new RegExp(`(?:^|\\s)${escapeRegex(name)}$`, 'i');
  const byPlace = new Map();
  for (const d of arr) {
    if (!d || typeof d.item !== 'string' || !rx.test(d.item)) continue;
    const raw = expandRot(String(d.place || '').trim());
    if (!raw) continue;
    const key = baseLocation(raw);
    const chance = Number.isFinite(d.chance) ? d.chance : 0;
    const qty = parseQty(d.item);
    // valor esperado por tentativa = chance × quantidade - é isto que a
    // wiki chama "Avg. per roll" e é o número que decide "melhor fonte" de
    // verdade, não a % isolada
    const ev = Math.round((chance / 100) * qty * 1000) / 1000;
    const prev = byPlace.get(key);
    if (!prev || ev > prev.ev) {
      // Bounty mantém a rotação no texto ("...), Rotation B") - é informação
      // acionável (o jogador precisa saber até onde jogar); baú/nó de missão
      // usa a chave sem rotação, porque ali ela não muda o que fazer (não há
      // "ficar até a rotação X" numa Extermínio/Sabotagem de nó único).
      const location = bountyHubFor(key) ? raw : key;
      // wiki no nome cru EN (boss/inimigo que dropa o recurso vira link);
      // bounty = hub/NPC do Contrato quando o local é um (Fortuna/Eudico etc.);
      // cache = missão de Extermínio/Sabotagem com vários baús independentes
      byPlace.set(key, {
        location,
        chance,
        qty,
        ev,
        rarity: d.rarity,
        wiki: enemyWikiUrl(location),
        bounty: bountyHubFor(location),
        cache: isCacheSource(location),
      });
    }
  }
  return [...byPlace.values()]
    .sort((a, b) => (b.ev || 0) - (a.ev || 0))
    .slice(0, MAX_LOCATIONS);
}

module.exports = { getResourceDrops, summarize, parseQty, expandRot };
