'use strict';

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wfh-varzia-'));
process.env.DB_PATH = path.join(TMP, 'test.db');
process.env.DATA_DIR = TMP;

const test = require('node:test');
const assert = require('node:assert/strict');
const { getDb, setMeta } = require('../server/db');
const seo = require('../server/seo');
const {
  getVarzia, resolvePrimes, resolveTiers, relicsForPrimes, nextRotation, storeToItem,
} = require('../server/varzia');

// ---- banco efêmero: só o que a derivação precisa ----
const db = getDb();
const insItem = db.prepare(
  `INSERT OR REPLACE INTO items (unique_name, name, name_pt, category, tradable, raw)
   VALUES (?, ?, ?, ?, 1, '{}')`
);
insItem.run('/Lotus/Powersuits/Fairy/TitaniaPrime', 'Titania Prime', 'Titania Prime', 'Warframes');
insItem.run('/Lotus/Powersuits/Mag/MagPrime', 'Mag Prime', 'Mag Prime', 'Warframes');
insItem.run('/Lotus/Weapons/Tenno/Pistol/MagnusPrime', 'Magnus Prime', null, 'Secondary');
insItem.run('/Lotus/Weapons/Tenno/Melee/Swords/PrimePangolinSword', 'Pangolin Prime', null, 'Melee');
insItem.run('/Lotus/Powersuits/Fairy/Titania', 'Titania', 'Titania', 'Warframes');
// Dex Pixia Prime é REAL: a arma exaltada da Titania Prime. Termina em " Prime",
// está no catálogo, e NÃO sai de relíquia (vem junto do frame) - só a categoria
// a barra, então é ela que prova que o filtro de categoria é load-bearing.
insItem.run('/Lotus/Weapons/Tenno/Pistol/DexPixiaPrime', 'Dex Pixia Prime', null, 'Misc');
insItem.run('/Lotus/Upgrades/Skins/Scarves/TitaniaPrimeSyandana', 'Titania Prime Syandana', null, 'Skins');

const insRelic = db.prepare(
  'INSERT OR REPLACE INTO relics (name, tier, code, vaulted, drops, rewards) VALUES (?, ?, ?, ?, ?, ?)'
);
const rewards = (names) => JSON.stringify({
  Intact: names.map((n) => ({ name: n, rarity: 'Common', chance: 25.33 })),
});
insRelic.run('Lith T5', 'Lith', 'T5', 1, '[]', rewards(['Titania Prime Blueprint', 'Forma Blueprint']));
insRelic.run('Meso T5', 'Meso', 'T5', 1, '[]', rewards(['Titania Prime']));
insRelic.run('Axi M2', 'Axi', 'M2', 1, '[]', rewards(['Magnus Prime Receiver', 'Titania Prime Systems']));
insRelic.run('Neo M1', 'Neo', 'M1', 1, '[]', rewards(['Magnus Prime Barrel']));
// nome SINTÉTICO: hoje nenhum prime real é prefixo de outro, então este é o
// único jeito de provar que o separador do prefixo faz trabalho. Se a DE lançar
// um "<X> Prime" que seja prefixo de outro, é este teste que segura.
insRelic.run('Neo Z1', 'Neo', 'Z1', 1, '[]', rewards(['Magnus Primed Barrel']));
// Titania NÃO-prime: prefixo do frame base não pode arrastar a relíquia
insRelic.run('Lith Z9', 'Lith', 'Z9', 0, '[]', rewards(['Titania Blueprint']));
setMeta(db, 'last_ingest', '2026-08-01T00:00:00.000Z');
// mesmo passo do boot da app (search.js chama seo.rebuild() antes de gerar URLs):
// sem o mapa de slugs quente, itemUrl() cai na URL legada /item.html?u=
seo.rebuild();

// recorte real de /pc/vaultTrader (rotação Titania/Gara de 2026-07-09)
const INVENTORY = [
  { uniqueName: '/Lotus/Types/Packages/MegaPrimeVault/MPVTitaniaGaraPrimeDualPack', item: 'M P V Titania Gara Prime Dual Pack', ducats: 10 },
  { uniqueName: '/Lotus/StoreItems/Powersuits/Fairy/TitaniaPrime', item: 'Titania Prime', ducats: 3 },
  { uniqueName: '/Lotus/StoreItems/Upgrades/Skins/Scarves/TitaniaPrimeSyandana', item: 'Titania Prime Syandana', ducats: 2 },
  { uniqueName: '/Lotus/StoreItems/Weapons/Tenno/Melee/Swords/PrimePangolinSword', item: 'Prime Pangolin Sword', ducats: 2 },
  { uniqueName: '/Lotus/StoreItems/Types/Items/ShipDecos/TitaniaPrimeBobbleHead', item: 'Titania Prime Bobble Head', ducats: 1 },
  { uniqueName: '/Lotus/StoreItems/Weapons/Tenno/Pistol/DexPixiaPrime', item: 'Dex Pixia Prime', ducats: 2 },
  { uniqueName: '/Lotus/StoreItems/Types/Game/Projections/T1VoidProjectionTitaniaGaraVaultABronze', item: 'T1 Void Projection Titania Gara Vault A Bronze', credits: 1 },
  { uniqueName: '/Lotus/StoreItems/Types/Game/Projections/T4VoidProjectionTitaniaGaraVaultBBronze', item: 'T4 Void Projection Titania Gara Vault B Bronze', credits: 1 },
];

test('storeToItem: /StoreItems é o MESMO item do catálogo (a API só prefixa a loja)', () => {
  assert.equal(
    storeToItem('/Lotus/StoreItems/Powersuits/Fairy/TitaniaPrime'),
    '/Lotus/Powersuits/Fairy/TitaniaPrime'
  );
  assert.equal(storeToItem('/Lotus/Powersuits/Fairy/TitaniaPrime'), '/Lotus/Powersuits/Fairy/TitaniaPrime');
  assert.equal(storeToItem(null), '');
});

test('resolvePrimes: só primes farmáveis por relíquia (cosmético e pacote ficam fora)', () => {
  const primes = resolvePrimes(INVENTORY);
  assert.deepEqual(primes.map((p) => p.name), ['Titania Prime', 'Pangolin Prime'],
    'warframe primeiro; syandana/bobble head/pacote não entram');
  // o nome do inventário ("Prime Pangolin Sword") NÃO é o nome do item: quem
  // manda é o uniqueName resolvido no banco
  assert.equal(primes[1].url, '/item/pangolin-prime');
  assert.equal(primes[0].category, 'Warframes');
  assert.equal(primes[0].ducats, 3);
});

test('resolvePrimes: item " Prime" de categoria não-farmável é barrado (Dex Pixia)', () => {
  // A Dex Pixia Prime passa por TODOS os outros filtros: resolve no banco e o
  // nome termina em " Prime". Só a lista de categorias a impede de virar um
  // "farme esta relíquia" para uma arma que não sai de relíquia nenhuma.
  const dexPixia = INVENTORY.find((i) => i.item === 'Dex Pixia Prime');
  assert.deepEqual(resolvePrimes([dexPixia]), []);
  // e o cosmético cujo nome NÃO termina em Prime cai no outro filtro
  assert.deepEqual(resolvePrimes([INVENTORY[2]]), []);
});

test('resolvePrimes: ignora entrada sem uniqueName e não repete o mesmo item', () => {
  const dup = [INVENTORY[1], INVENTORY[1], { item: 'sem uniqueName' }, null];
  assert.deepEqual(resolvePrimes(dup).map((p) => p.name), ['Titania Prime']);
  assert.deepEqual(resolvePrimes(undefined), []);
});

test('resolveTiers: T1..T4 viram Lith/Meso/Neo/Axi na ordem do jogo', () => {
  assert.deepEqual(resolveTiers(INVENTORY), ['Lith', 'Axi'], 'só os tiers presentes, em ordem de tier');
  const all = ['T1', 'T2', 'T3', 'T4'].map((t) => ({
    uniqueName: `/Lotus/StoreItems/Types/Game/Projections/${t}VoidProjectionXVaultABronze`,
  }));
  // embaralhado na entrada: a ordem da saída é a do jogo, não a de chegada
  assert.deepEqual(resolveTiers([all[3], all[1], all[0], all[2]]), ['Lith', 'Meso', 'Neo', 'Axi']);
  assert.deepEqual(resolveTiers([{ uniqueName: '/Lotus/StoreItems/Powersuits/Fairy/TitaniaPrime' }]), []);
});

test('relicsForPrimes: casa peça do prime, e o prefixo NÃO vaza para outro prime', () => {
  const names = relicsForPrimes(['Titania Prime']).map((r) => r.name);
  assert.deepEqual(names, ['Axi M2', 'Lith T5', 'Meso T5'],
    'blueprint, item cru e systems entram; Titania (base) não');
  assert.ok(!names.includes('Lith Z9'), '"Titania Blueprint" não é peça de prime');

  // o prefixo precisa do separador: "Magnus Prime" casa "Magnus Prime Barrel"
  // (peça) mas NÃO "Magnus Primed Barrel" (outro item que só começa igual)
  assert.deepEqual(relicsForPrimes(['Magnus Prime']).map((r) => r.name), ['Axi M2', 'Neo M1'],
    'Neo Z1 ("Magnus Primed Barrel") não pode entrar');
});

test('relicsForPrimes: devolve tier e vaulted de cada relíquia', () => {
  const [first] = relicsForPrimes(['Magnus Prime']);
  assert.deepEqual(first, { name: 'Axi M2', tier: 'Axi', vaulted: true });
});

test('nextRotation: limpa o nome do pacote e pega a PRÓXIMA depois da atual', () => {
  const schedule = [
    { expiry: '2026-07-09T18:00:00.000Z', item: 'M P V Equinox Wukong Prime Dual Pack' },
    { expiry: '2026-09-03T18:00:00.000Z', item: 'M P V Revenant Baruuk Prime Dual Pack' },
    { expiry: '2026-08-06T18:00:00.000Z', item: 'M P V Titania Gara Prime Dual Pack' },
    { expiry: '2026-10-01T18:00:00.000Z' }, // sem item: o schedule real tem esse buraco
  ];
  const cur = Date.parse('2026-08-06T18:00:00.000Z');
  assert.deepEqual(nextRotation(schedule, cur), {
    item: 'Revenant Baruuk Prime',
    expiry: '2026-09-03T18:00:00.000Z',
  }, 'a mais próxima DEPOIS da atual, mesmo fora de ordem no array');
  assert.equal(nextRotation(schedule, Date.parse('2026-12-01T00:00:00.000Z')), null);
  assert.equal(nextRotation(undefined, cur), null);
  assert.equal(
    nextRotation([{ expiry: '2027-01-01T00:00:00.000Z', item: 'M P V Oberon Prime Single Pack' }], cur).item,
    'Oberon Prime'
  );
});

// ---- getVarzia: contrato com a API externa (fetch stubado, sem rede) ----

function withFetch(payload, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = async () => {
    if (payload instanceof Error) throw payload;
    return { ok: true, json: async () => payload };
  };
  // o worldstate memoiza por chave; cada caso precisa de cache limpo
  delete require.cache[require.resolve('../server/worldstate')];
  delete require.cache[require.resolve('../server/varzia')];
  const mod = require('../server/varzia');
  return Promise.resolve(fn(mod)).finally(() => { globalThis.fetch = real; });
}

const future = () => new Date(Date.now() + 5 * 24 * 3600e3).toISOString();

test('getVarzia: rotação viva devolve primes, tiers e relíquias derivadas', async () => {
  await withFetch(
    { expiry: future(), location: "Maroo's Bazaar (Mars)", inventory: INVENTORY, schedule: [] },
    async ({ getVarzia: get }) => {
      const v = await get();
      assert.deepEqual(v.primes.map((p) => p.name), ['Titania Prime', 'Pangolin Prime']);
      assert.deepEqual(v.tiers, ['Lith', 'Axi']);
      assert.deepEqual(v.relics, ['Axi M2', 'Lith T5', 'Meso T5']);
      assert.equal(v.relicCount, 3);
      assert.equal(v.next, null);
    }
  );
});

test('getVarzia: rotação VENCIDA não vale como disponível agora', async () => {
  // a API pode servir um snapshot atrasado; anunciar "compre com Aya" numa
  // rotação que já virou manda o jogador atrás de algo que não está à venda
  await withFetch(
    { expiry: '2020-01-01T00:00:00.000Z', inventory: INVENTORY },
    async ({ getVarzia: get }) => assert.equal(await get(), null)
  );
});

test('getVarzia: API fora do ar devolve null em vez de estourar', async () => {
  await withFetch(new Error('upstream fora'), async ({ getVarzia: get }) => {
    assert.equal(await get(), null);
  });
});

test('getVarzia: resposta sem inventário não inventa relíquia', async () => {
  await withFetch({ expiry: future() }, async ({ getVarzia: get }) => {
    const v = await get();
    assert.deepEqual(v.primes, []);
    assert.deepEqual(v.relics, []);
    assert.equal(v.relicCount, 0);
  });
});
