'use strict';

/**
 * Prime Resurgence (Varzia, Bazar da Maroo): a rotação de ~28 dias que
 * DESVAULTA um conjunto de primes.
 *
 * Por que existe este módulo: uma relíquia de prime em rotação continua
 * `vaulted` na drop table (ela não volta a cair em missão), mas dá para
 * COMPRÁ-LA com Aya enquanto a rotação durar. Sem este cruzamento o site
 * mandava "aguarde ela voltar na Prime Resurgence" para uma peça que já voltou.
 *
 * Derivação das relíquias: a API não diz quais relíquias a Varzia vende. O
 * inventário traz os primes em si e pacotes GENÉRICOS por tier
 * (`T1..T4 Void Projection <Vault> Bronze`), que sorteiam uma relíquia daquele
 * cofre. Então a lista é derivada: entra a relíquia que contém peça de um dos
 * primes da rotação, que é exatamente o critério do pacote no jogo.
 */

const { getDb, getMeta } = require('./db');
const { getVaultTraderRaw } = require('./worldstate');
const { itemUrl } = require('./seo');

// Categorias cujas peças saem de relíquia. Serve de filtro: o inventário mistura
// cosméticos (syandana, efêmera, bobble head) e pacotes de loja, que não
// resolvem para um item nosso ou não são farmáveis por relíquia.
const RELIC_CATEGORIES = new Set([
  'Warframes', 'Primary', 'Secondary', 'Melee', 'Archwing',
  'Arch-Gun', 'Arch-Melee', 'Sentinels', 'SentinelWeapons', 'Pets',
]);

// Nomes de tier que a Varzia vende, lidos dos pacotes `T1..T4 ...`.
const TIER_BY_CODE = { T1: 'Lith', T2: 'Meso', T3: 'Neo', T4: 'Axi' };

/**
 * `/Lotus/StoreItems/Powersuits/Fairy/TitaniaPrime` (o que a API devolve) é o
 * mesmo item que `/Lotus/Powersuits/Fairy/TitaniaPrime` (o que o banco guarda).
 * Resolver pelo uniqueName evita adivinhar nome: o inventário chama a Pangolin
 * Prime de "Prime Pangolin Sword" e a Astilla Prime de "Astilla Prime Weapon".
 */
const storeToItem = (u) => String(u || '').replace('/StoreItems', '');

/** Primes de verdade (sem cosmético/pacote) do inventário, resolvidos no banco. */
function resolvePrimes(inventory) {
  const db = getDb();
  const find = db.prepare('SELECT unique_name, name, name_pt, category FROM items WHERE unique_name = ?');
  const out = [];
  const seen = new Set();
  for (const entry of Array.isArray(inventory) ? inventory : []) {
    if (!entry || !entry.uniqueName) continue;
    const row = find.get(storeToItem(entry.uniqueName));
    if (!row || !RELIC_CATEGORIES.has(row.category)) continue;
    if (!/ Prime$/.test(row.name) || seen.has(row.unique_name)) continue;
    seen.add(row.unique_name);
    out.push({
      name: row.name,
      namePt: row.name_pt || null,
      category: row.category,
      url: itemUrl(row.unique_name),
      // Regal Aya compra o item pronto; Aya compra a relíquia. Só o primeiro tem preço aqui.
      ducats: Number.isFinite(entry.ducats) ? entry.ducats : null,
    });
  }
  // warframe primeiro (é o que o jogador procura), depois alfabético
  return out.sort((a, b) =>
    Number(b.category === 'Warframes') - Number(a.category === 'Warframes')
    || a.name.localeCompare(b.name));
}

/** Tiers com pacote de relíquia à venda (derivado dos `T1..T4` do inventário). */
function resolveTiers(inventory) {
  const tiers = new Set();
  for (const entry of Array.isArray(inventory) ? inventory : []) {
    const m = /^(T[1-4])VoidProjection/.exec(
      storeToItem(entry && entry.uniqueName).split('/').pop() || ''
    );
    if (m && TIER_BY_CODE[m[1]]) tiers.add(TIER_BY_CODE[m[1]]);
  }
  return ['Lith', 'Meso', 'Neo', 'Axi'].filter((t) => tiers.has(t));
}

/**
 * Relíquias que contêm peça de algum prime da rotação.
 * `Titania Prime` casa com "Titania Prime Blueprint"/"Titania Prime Systems" mas
 * NÃO com "Titania Prime Syandana" (cosmético nunca é recompensa de relíquia) -
 * o prefixo aqui é seguro porque a lista de primes já veio filtrada por categoria.
 */
function relicsForPrimes(primeNames) {
  const db = getDb();
  const wanted = primeNames.map((n) => `${n} `);
  const out = [];
  for (const row of db.prepare('SELECT name, tier, vaulted, rewards FROM relics').all()) {
    let rewards;
    try { rewards = JSON.parse(row.rewards); } catch { continue; }
    const list = rewards.Intact || [];
    const hit = list.some((r) => {
      const n = String(r && r.name);
      return primeNames.includes(n) || wanted.some((p) => n.startsWith(p));
    });
    if (hit) out.push({ name: row.name, tier: row.tier, vaulted: !!row.vaulted });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// A tabela de relíquias só muda na ingestão diária; o cruzamento é O(771 relíquias)
// e roda em toda página de relíquia, então memoriza por (ingestão + rotação).
let derived = { key: null, value: null };

function deriveRelics(primeNames) {
  const key = `${getMeta(getDb(), 'last_ingest') || ''}|${primeNames.join(',')}`;
  if (derived.key !== key) derived = { key, value: relicsForPrimes(primeNames) };
  return derived.value;
}

/** Próxima rotação anunciada no `schedule` (a entrada seguinte à atual). */
function nextRotation(schedule, currentExpiryMs) {
  if (!Array.isArray(schedule)) return null;
  const upcoming = schedule
    .filter((s) => s && s.item && Date.parse(s.expiry) > currentExpiryMs)
    .sort((a, b) => Date.parse(a.expiry) - Date.parse(b.expiry))[0];
  if (!upcoming) return null;
  return {
    // "M P V Revenant Baruuk Prime Dual Pack" -> "Revenant Baruuk Prime"
    item: String(upcoming.item)
      .replace(/^M P V /, '')
      .replace(/ (Dual|Single|Triple) Pack$/, '')
      .trim(),
    expiry: upcoming.expiry,
  };
}

/**
 * Rotação atual, pronta para a UI. Nunca lança: a Varzia é informação extra e
 * uma API fora do ar não pode derrubar a página da relíquia.
 */
async function getVarzia() {
  let raw = null;
  try { raw = await getVaultTraderRaw(); } catch { raw = null; }
  if (!raw || typeof raw !== 'object') return null;

  const expiryMs = Date.parse(raw.expiry);
  // rotação vencida (API atrasada) não vale como "disponível agora"
  if (!Number.isFinite(expiryMs) || expiryMs <= Date.now()) return null;

  const primes = resolvePrimes(raw.inventory);
  const relics = primes.length ? deriveRelics(primes.map((p) => p.name)) : [];
  return {
    location: raw.location || "Maroo's Bazaar (Mars)",
    activation: raw.activation || null,
    expiry: raw.expiry,
    primes,
    tiers: resolveTiers(raw.inventory),
    relics: relics.map((r) => r.name),
    relicCount: relics.length,
    next: nextRotation(raw.schedule, expiryMs),
  };
}

/** `true` se a relíquia dá para comprar com Aya na rotação de agora. */
async function isRelicInVarzia(name) {
  const v = await getVarzia();
  return !!(v && v.relics.includes(name));
}

module.exports = {
  getVarzia,
  isRelicInVarzia,
  // exportados para teste
  resolvePrimes, resolveTiers, relicsForPrimes, nextRotation, storeToItem,
};
