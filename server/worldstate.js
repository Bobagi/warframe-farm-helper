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

// 'ok' | 'stale' | 'down' - no jogo SEMPRE há fissuras ativas. 'stale' = o
// upstream responde mas tudo vem expirado (espelho do warframestat.us travado
// no tempo, visto em 2026-08-20 com worldstate 4h atrasado); 'down' = o fetch
// falhou de vez (404/timeout). A UI usa isso para dizer a verdade ("fonte
// fora do ar") em vez de "nenhuma fissura ativa". Consumidores que engolem o
// erro (buildFarmable) herdam o estado correto via fissuresSource().
let fissuresSourceState = 'ok';
const fissuresSource = () => fissuresSourceState;

async function getFissures() {
  let arr;
  try {
    arr = await cached('fissures', `${BASE}/fissures`);
  } catch (err) {
    fissuresSourceState = 'down';
    throw err;
  }
  const now = Date.now();
  const active = (Array.isArray(arr) ? arr : [])
    .filter((f) => f && !f.expired && f.expiry && Date.parse(f.expiry) > now);
  fissuresSourceState = active.length ? 'ok' : 'stale';
  return active
    .map((f) => ({
      id: f.id,
      node: f.node,
      // missionType/enemy ficam no inglês cru (chave) - o cliente traduz por idioma
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

// A rotação da Varzia dura ~28 dias: cache velho segue válido por horas se a
// API cair (ao contrário das fissuras, que viram em minutos).
const VAULT_STALE_MS = 6 * 60 * 60 * 1000;

async function getVaultTraderRaw() {
  return cached('vaultTrader', `${BASE}/vaultTrader`, VAULT_STALE_MS);
}

/**
 * Ciclos dos mundos (dia/noite de Cetus, quente/frio do Vallis, Fass/Vome de
 * Deimos, etc.). Cada ciclo é determinístico: se o cache está velho e o expiry
 * já passou, dá para AVANÇAR o estado localmente pela tabela de durações -
 * assim a API nunca devolve um ciclo "vencido", mesmo com o upstream fora.
 */
// Mundos cujo ciclo a DE emite no worldstate REAL (via timers de bounty/expiry)
// - fonte confiável, todas as fontes concordam. A TERRA **não** está aqui de
// propósito: desde o Update 38.5 ela não tem mais ciclo próprio e passou a
// seguir o Cetus/Plains (dia 100min, noite 50min). A API /earthCycle ainda
// calcula o ciclo LEGADO de 8h (4h dia/4h noite) e fica dessincronizada do jogo
// (mostra "noite" quando o jogo está em "dia"), então derivamos a Terra do
// cetusCycle em getCycles(), não de /earthCycle. Ver wiki Earth (U38.5).
const CYCLE_DEFS = [
  { id: 'cetus', path: 'cetusCycle', order: ['day', 'night'], dur: { day: 100 * 60e3, night: 50 * 60e3 } },
  { id: 'vallis', path: 'vallisCycle', order: ['warm', 'cold'], dur: { warm: 400e3, cold: 1200e3 } },
  { id: 'cambion', path: 'cambionCycle', order: ['fass', 'vome'], dur: { fass: 100 * 60e3, vome: 50 * 60e3 } },
  { id: 'duviri', path: 'duviriCycle', order: ['joy', 'anger', 'envy', 'sorrow', 'fear'], dur: { joy: 120 * 60e3, anger: 120 * 60e3, envy: 120 * 60e3, sorrow: 120 * 60e3, fear: 120 * 60e3 } },
  { id: 'zariman', path: 'zarimanCycle', order: ['grineer', 'corpus'], dur: { grineer: 150 * 60e3, corpus: 150 * 60e3 } },
];

// ciclos são previsíveis - cache velho continua útil por horas (avançado localmente)
const CYCLE_STALE_MS = 6 * 60 * 60 * 1000;
const MAX_ADVANCE_STEPS = 5000; // trava de segurança contra dados corrompidos

/** Avança (estado, expiry) até o presente pela tabela de durações do mundo. */
function advanceCycle(def, state, expiryMs, nowMs) {
  let predicted = false;
  for (let i = 0; expiryMs <= nowMs && i < MAX_ADVANCE_STEPS; i++) {
    const idx = def.order.indexOf(state);
    if (idx < 0) break; // estado desconhecido (mundo novo?) - devolve como veio
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
    if (s.status !== 'fulfilled') return; // mundo indisponível - os outros seguem
    const c = normalizeCycle(s.value, CYCLE_DEFS[i], now);
    if (c) cycles.push(c);
  });
  // Terra = Cetus desde o Update 38.5 (MESMA fase dia/noite, mesma fonte
  // confiável - o cetusCycle real da DE, não o /earthCycle legado e defasado).
  // Como carregam sempre a mesma info, NÃO é um relógio separado: o ciclo do
  // Cetus apenas declara que também representa a Terra (`worlds`), e o front
  // mostra um chip só ("Cetus / Terra"). Cada ciclo representa a si mesmo por
  // padrão; se o Cetus cair, ele some e leva a Terra junto (não há fonte
  // alternativa correta p/ a Terra).
  for (const c of cycles) {
    c.worlds = c.id === 'cetus' ? ['cetus', 'earth'] : [c.id];
  }
  return cycles;
}

/**
 * Normaliza o /voidTrader. A flag `active` do upstream NÃO é confiável (visto
 * ao vivo em 2026-08-08: `active: null` com o Baro na relay e 37 itens no
 * inventário) - os timestamps são a verdade: chegou (activation ≤ agora) e
 * ainda não saiu (agora < expiry) ⇒ está na relay. A flag só decide quando
 * algum timestamp vier inválido. Pura para teste.
 */
function normalizeBaro(b, nowMs) {
  if (!b || typeof b !== 'object') return null;
  const act = Date.parse(b.activation);
  const exp = Date.parse(b.expiry);
  const active = Number.isFinite(act) && Number.isFinite(exp)
    ? act <= nowMs && nowMs < exp
    : !!b.active;
  return {
    active,
    activation: b.activation,
    expiry: b.expiry,
    location: b.location,
    items: Array.isArray(b.inventory) ? b.inventory.length : 0,
  };
}

async function getBaro() {
  return normalizeBaro(await cached('baro', `${BASE}/voidTrader`), Date.now());
}

module.exports = {
  getFissures, fissuresSource, getNightwaveRaw, getVaultTraderRaw, getBaro, getCycles, MISSION_PT,
  // exportados para testes
  CYCLE_DEFS, advanceCycle, normalizeCycle, normalizeBaro,
};
