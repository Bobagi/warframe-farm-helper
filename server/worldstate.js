'use strict';

/**
 * Worldstate ao vivo (api.warframestat.us) com cache em memória:
 * TTL 90s + serve versão velha (até 15 min) se a API estiver fora.
 */

const { fetchJson } = require('./util');

const PLATFORM = (process.env.WF_PLATFORM || 'pc').replace(/[^a-z0-9]/g, '') || 'pc';
const BASE = `https://api.warframestat.us/${PLATFORM}`;
const TTL_MS = 90 * 1000;
const STALE_MAX_MS = 15 * 60 * 1000;

const cache = new Map(); // key -> { data, at }

async function cached(key, url) {
  const entry = cache.get(key);
  const now = Date.now();
  if (entry && now - entry.at < TTL_MS) return entry.data;
  try {
    const data = await fetchJson(url, { timeoutMs: 12000, retries: 1 });
    cache.set(key, { data, at: now });
    return data;
  } catch (err) {
    if (entry && now - entry.at < STALE_MAX_MS) return entry.data;
    throw err;
  }
}

const MISSION_PT = {
  Extermination: 'Extermínio', Capture: 'Captura', Survival: 'Sobrevivência',
  Defense: 'Defesa', 'Mobile Defense': 'Defesa Móvel', Rescue: 'Resgate',
  Sabotage: 'Sabotagem', Spy: 'Espionagem', Interception: 'Interceptação',
  Excavation: 'Escavação', Disruption: 'Disrupção', Hijack: 'Sequestro de Carga',
  Assault: 'Assalto', 'Free Roam': 'Mundo Aberto', Skirmish: 'Escaramuça',
  Volatile: 'Volátil', Orphix: 'Orphix', 'Void Cascade': 'Cascata do Void',
  'Void Flood': 'Inundação do Void', 'Void Armageddon': 'Armagedom do Void',
  Alchemy: 'Alquimia', Hive: 'Colmeia', Corruption: 'Corrupção',
  Assassination: 'Assassinato', 'Infested Salvage': 'Recuperação Infestada',
  Arena: 'Arena', Defection: 'Deserção', Rush: 'Corrida',
};

async function getFissures() {
  const arr = await cached('fissures', `${BASE}/fissures`);
  const now = Date.now();
  return (Array.isArray(arr) ? arr : [])
    .filter((f) => f && !f.expired && f.expiry && Date.parse(f.expiry) > now)
    .map((f) => ({
      id: f.id,
      node: f.node,
      // missionType/enemy ficam no inglês cru (chave) — o cliente traduz por idioma
      missionType: f.missionType,
      tier: f.tier,
      tierNum: f.tierNum,
      enemy: f.enemy,
      expiry: f.expiry,
      isStorm: !!f.isStorm,
      isHard: !!f.isHard,
    }))
    .sort((a, b) =>
      (a.tierNum || 0) - (b.tierNum || 0) || Date.parse(a.expiry) - Date.parse(b.expiry));
}

async function getNightwaveRaw() {
  return cached('nightwave', `${BASE}/nightwave`);
}

async function getBaro() {
  const b = await cached('baro', `${BASE}/voidTrader`);
  if (!b || typeof b !== 'object') return null;
  return {
    active: !!b.active,
    activation: b.activation,
    expiry: b.expiry,
    location: b.location,
    items: Array.isArray(b.inventory) ? b.inventory.length : 0,
  };
}

module.exports = { getFissures, getNightwaveRaw, getBaro, MISSION_PT };
