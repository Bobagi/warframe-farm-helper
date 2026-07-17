'use strict';

/**
 * "Onde dropa" para recursos que não estão nas tabelas do nosso dataset (ex.:
 * Orokin Cell, Morphics — ingredientes de craft). Busca na API de drops do
 * warframestat.us e resume os melhores locais (dedup por local, maior chance).
 * Cache longo em memória: drop de recurso muda raríssimo (só em grandes updates).
 */

const { fetchJson } = require('./util');

const TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_LOCATIONS = 8;
const cache = new Map(); // nome(lower) -> { data, at }

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Retorna [{ location, chance, rarity }] dos melhores locais que dropam `name`.
 * Casa o item exato ("Orokin Cell") e as variantes de quantidade ("2X Orokin
 * Cell") no MESMO local, ficando com a maior chance por local.
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

/** Resume a resposta crua da API num top-N de locais (testável sem rede). */
function summarize(arr, name) {
  if (!Array.isArray(arr)) return [];
  const rx = new RegExp(`(?:^|\\s)${escapeRegex(name)}$`, 'i');
  const byPlace = new Map();
  for (const d of arr) {
    if (!d || typeof d.item !== 'string' || !rx.test(d.item)) continue;
    const raw = String(d.place || '').trim();
    if (!raw) continue;
    const location = baseLocation(raw);
    const chance = Number.isFinite(d.chance) ? d.chance : 0;
    const prev = byPlace.get(location);
    if (!prev || chance > prev.chance) byPlace.set(location, { location, chance, rarity: d.rarity });
  }
  return [...byPlace.values()]
    .sort((a, b) => (b.chance || 0) - (a.chance || 0))
    .slice(0, MAX_LOCATIONS);
}

module.exports = { getResourceDrops, summarize };
