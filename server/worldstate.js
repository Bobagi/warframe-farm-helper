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
const inflight = new Map(); // key -> Promise (coalesce: N requests concorrentes = 1 fetch)

async function cached(key, url, staleMaxMs = STALE_MAX_MS) {
  const entry = cache.get(key);
  const now = Date.now();
  if (entry && now - entry.at < TTL_MS) return entry.data;
  // sem isto, uma rajada na janela de TTL vencido viraria N fetches ao upstream
  // (amplificação que arrisca rate-limit/ban do nosso IP na API pública)
  let p = inflight.get(key);
  if (!p) {
    p = fetchJson(url, { timeoutMs: 12000, retries: 1 })
      .then((data) => { cache.set(key, { data, at: Date.now() }); return data; })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  try {
    return await p;
  } catch (err) {
    if (entry && now - entry.at < staleMaxMs) return entry.data;
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

/**
 * Ciclos dos mundos (dia/noite de Cetus, quente/frio do Vallis, Fass/Vome de
 * Deimos, etc.). Cada ciclo é determinístico: se o cache está velho e o expiry
 * já passou, dá para AVANÇAR o estado localmente pela tabela de durações —
 * assim a API nunca devolve um ciclo "vencido", mesmo com o upstream fora.
 */
const CYCLE_DEFS = [
  { id: 'cetus', path: 'cetusCycle', order: ['day', 'night'], dur: { day: 100 * 60e3, night: 50 * 60e3 } },
  { id: 'vallis', path: 'vallisCycle', order: ['warm', 'cold'], dur: { warm: 400e3, cold: 1200e3 } },
  { id: 'cambion', path: 'cambionCycle', order: ['fass', 'vome'], dur: { fass: 100 * 60e3, vome: 50 * 60e3 } },
  { id: 'duviri', path: 'duviriCycle', order: ['joy', 'anger', 'envy', 'sorrow', 'fear'], dur: { joy: 120 * 60e3, anger: 120 * 60e3, envy: 120 * 60e3, sorrow: 120 * 60e3, fear: 120 * 60e3 } },
  { id: 'zariman', path: 'zarimanCycle', order: ['grineer', 'corpus'], dur: { grineer: 150 * 60e3, corpus: 150 * 60e3 } },
  { id: 'earth', path: 'earthCycle', order: ['day', 'night'], dur: { day: 240 * 60e3, night: 240 * 60e3 } },
];

// ciclos são previsíveis — cache velho continua útil por horas (avançado localmente)
const CYCLE_STALE_MS = 6 * 60 * 60 * 1000;
const MAX_ADVANCE_STEPS = 5000; // trava de segurança contra dados corrompidos

/** Avança (estado, expiry) até o presente pela tabela de durações do mundo. */
function advanceCycle(def, state, expiryMs, nowMs) {
  let predicted = false;
  for (let i = 0; expiryMs <= nowMs && i < MAX_ADVANCE_STEPS; i++) {
    const idx = def.order.indexOf(state);
    if (idx < 0) break; // estado desconhecido (mundo novo?) — devolve como veio
    state = def.order[(idx + 1) % def.order.length];
    expiryMs += def.dur[state];
    predicted = true;
  }
  return { state, expiryMs, predicted };
}

/** Normaliza a resposta crua da API num ciclo compacto, já avançado até agora. */
function normalizeCycle(raw, def, nowMs) {
  if (!raw || typeof raw !== 'object') return null;
  const state = typeof raw.state === 'string' ? raw.state.toLowerCase() : null;
  const expiryMs = Date.parse(raw.expiry);
  if (!state || !Number.isFinite(expiryMs)) return null;
  const adv = advanceCycle(def, state, expiryMs, nowMs);
  return {
    id: def.id,
    state: adv.state,
    expiry: new Date(adv.expiryMs).toISOString(),
    predicted: adv.predicted,
  };
}

async function getCycles() {
  const settled = await Promise.allSettled(
    CYCLE_DEFS.map((d) => cached(`cycle:${d.id}`, `${BASE}/${d.path}`, CYCLE_STALE_MS))
  );
  const now = Date.now();
  const cycles = [];
  settled.forEach((s, i) => {
    if (s.status !== 'fulfilled') return; // mundo indisponível — os outros seguem
    const c = normalizeCycle(s.value, CYCLE_DEFS[i], now);
    if (c) cycles.push(c);
  });
  return cycles;
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

module.exports = {
  getFissures, getNightwaveRaw, getBaro, getCycles, MISSION_PT,
  // exportados para testes
  CYCLE_DEFS, advanceCycle, normalizeCycle,
};
