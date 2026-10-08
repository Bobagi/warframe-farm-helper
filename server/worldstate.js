'use strict';

/**
 * Worldstate ao vivo com cache em memória (fissuras: DE oficial, resto e
 * reserva: api.warframestat.us):
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
// no tempo, visto em 2026-08-20 com worldstate 4h atrasado, e de novo em
// 2026-08-22..29 com atraso de horas); 'down' = o fetch falhou de vez
// (404/timeout). A UI usa isso para dizer a verdade ("fonte fora do ar/com
// atraso") em vez de "nenhuma fissura ativa". Consumidores que engolem o
// erro (buildFarmable) herdam o estado correto via fissuresSource().
let fissuresSourceState = 'ok';
const fissuresSource = () => fissuresSourceState;

// Quando a fonte está 'stale', a UI precisa dizer DE QUANDO é o dado que
// está mostrando (o operador pediu de volta a data depois que ela sumiu na
// primeira versão desta resiliência, 2026-08-29). Sem outra chamada ao
// upstream: usa a `activation` mais recente entre as fissuras que ele
// devolveu - é a melhor pista de até onde o relógio do espelho avançou.
let fissuresAsOfState = null;
const fissuresAsOf = () => fissuresAsOfState;

// ★ Fonte primária das fissuras = worldstate OFICIAL da DE (2026-10-08). O
// espelho do warframestat seguia ~1h atrasado (issue WFCD/warframe-status#2202
// aberta desde junho) e, no dia da troca, 23 das 31 fissuras do site já
// tinham vencido. O JSON da DE só traz ids crus (SolNode17, MT_DEFENSE,
// VoidT3); os nomes vêm das tabelas do próprio WFCD (warframe-worldstate-data,
// as mesmas que o warframestat usa), então o vocabulário que chega ao front
// é idêntico. Se a DE ou as tabelas falharem, cai no warframestat.
const DE_WORLDSTATE = process.env.WF_DE_WORLDSTATE || 'https://api.warframe.com/cdn/worldState.php';
const WS_DATA = 'https://raw.githubusercontent.com/WFCD/warframe-worldstate-data/master/data';
const NODE_MAPS_TTL_MS = 24 * 3600 * 1000;
const MAX_DE_FISSURES = 200; // dado de terceiro: teto de quantidade
const VOID_TIERS = {
  VoidT1: ['Lith', 1], VoidT2: ['Meso', 2], VoidT3: ['Neo', 3],
  VoidT4: ['Axi', 4], VoidT5: ['Requiem', 5], VoidT6: ['Omnia', 6],
};

let nodeMaps = null; // { nodes, missionTypes, at }
let nodeMapsInflight = null;

async function getNodeMaps() {
  if (nodeMaps && Date.now() - nodeMaps.at < NODE_MAPS_TTL_MS) return nodeMaps;
  if (!nodeMapsInflight) {
    nodeMapsInflight = Promise.all([
      fetchJson(`${WS_DATA}/solNodes.json`, { timeoutMs: 15000, retries: 1 }),
      fetchJson(`${WS_DATA}/missionTypes.json`, { timeoutMs: 15000, retries: 1 }),
    ]).then(([nodes, missionTypes]) => {
      const isMap = (o) => o && typeof o === 'object' && !Array.isArray(o);
      if (!isMap(nodes) || !isMap(missionTypes)) throw new Error('tabelas de nós em formato inesperado');
      nodeMaps = { nodes, missionTypes, at: Date.now() };
      return nodeMaps;
    }).finally(() => { nodeMapsInflight = null; });
  }
  try {
    return await nodeMapsInflight;
  } catch (err) {
    if (nodeMaps) return nodeMaps; // tabela velha serve: nó novo é raro
    throw err;
  }
}

// data no formato Mongo da DE: { $date: { $numberLong: "1791477892387" } }
function deDate(d) {
  const v = d && d.$date !== undefined ? (d.$date.$numberLong ?? d.$date) : d;
  const ms = Number(v);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;
}

const str = (v, max = 80) => (typeof v === 'string' ? v.slice(0, max) : null);

/**
 * Worldstate cru da DE -> lista no MESMO formato do /fissures do warframestat
 * (o resto do getFissures não sabe de onde veio). Fissuras normais + Steel
 * Path (`Hard`) em ActiveMissions; tempestades do Void (Railjack) em
 * VoidStorms. Nó sem nome na tabela fica fora (não mostra "SolNode999").
 */
function parseDeFissures(ws, { nodes, missionTypes }) {
  if (!ws || typeof ws !== 'object') return [];
  const out = [];
  const add = (m, tierKey, isStorm) => {
    const tier = VOID_TIERS[tierKey];
    const node = nodes[m && m.Node];
    if (!tier || !node || typeof node.value !== 'string') return;
    const mt = !isStorm && missionTypes[m.MissionType];
    out.push({
      id: str(m._id && (m._id.$oid || m._id.$id), 40),
      node: str(node.value),
      missionType: str((mt && mt.value) || node.type),
      tier: tier[0],
      tierNum: tier[1],
      enemy: str(node.enemy),
      activation: deDate(m.Activation),
      expiry: deDate(m.Expiry),
      isStorm,
      isHard: !isStorm && m.Hard === true,
    });
  };
  for (const m of (Array.isArray(ws.ActiveMissions) ? ws.ActiveMissions : []).slice(0, MAX_DE_FISSURES)) {
    add(m, m && m.Modifier, false);
  }
  for (const m of (Array.isArray(ws.VoidStorms) ? ws.VoidStorms : []).slice(0, MAX_DE_FISSURES)) {
    add(m, m && m.ActiveMissionTier, true);
  }
  return out;
}

async function fetchFissuresRaw() {
  try {
    const [ws, maps] = await Promise.all([cached('de-worldstate', DE_WORLDSTATE), getNodeMaps()]);
    const arr = parseDeFissures(ws, maps);
    if (arr.some((f) => f.expiry && Date.parse(f.expiry) > Date.now())) return arr;
  } catch { /* cai no espelho */ }
  return cached('fissures', `${BASE}/fissures`);
}

async function getFissures() {
  let arr;
  try {
    arr = await fetchFissuresRaw();
  } catch (err) {
    fissuresSourceState = 'down';
    throw err;
  }
  const now = Date.now();
  // NÃO confia no `f.expired` do upstream (mentiu ao vivo em 2026-08-20/29:
  // veio `false` num item cujo expiry já tinha passado há mais de 2h) -
  // a verdade é comparar o expiry contra o relógio real. Diferente de antes,
  // NÃO descarta as expiradas: elas continuam na resposta (a UI mostra com
  // um aviso visual de "já venceu") em vez de sumir e virar um painel vazio
  // quando o espelho está atrasado (ordem do operador, 2026-08-29).
  const clean = (Array.isArray(arr) ? arr : [])
    .filter((f) => f && f.tier && f.expiry && Number.isFinite(Date.parse(f.expiry)));
  const anyActive = clean.some((f) => Date.parse(f.expiry) > now);
  fissuresSourceState = clean.length ? (anyActive ? 'ok' : 'stale') : 'down';
  const activations = clean.map((f) => Date.parse(f.activation)).filter(Number.isFinite);
  fissuresAsOfState = activations.length ? new Date(Math.max(...activations)).toISOString() : null;
  return clean
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
      expired: Date.parse(f.expiry) <= now,
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
  getFissures, fissuresSource, fissuresAsOf, getNightwaveRaw, getVaultTraderRaw, getBaro, getCycles, MISSION_PT,
  // exportados para testes
  CYCLE_DEFS, advanceCycle, normalizeCycle, normalizeBaro, parseDeFissures,
};
