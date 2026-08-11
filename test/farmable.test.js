'use strict';

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wfh-farm-'));
process.env.DB_PATH = path.join(TMP, 'test.db');
process.env.DATA_DIR = TMP;

const test = require('node:test');
const assert = require('node:assert/strict');
const { getDb } = require('../server/db');
const { buildFarmable, activePrimeTiers } = require('../server/itemview');

function seed() {
  const db = getDb();
  const item = db.prepare(`INSERT OR REPLACE INTO items
    (unique_name, name, name_pt, category, type, mastery_req, vaulted, image_name, wiki_url, tradable, raw)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  // itens: o BASE e o PRIME (o blueprint principal do prime deve casar o PRIME, não o base)
  item.run('/u/braton', 'Braton', null, 'Primary', 'Rifle', 0, null, null, null, 0, '{}');
  item.run('/u/bratonPrime', 'Braton Prime', 'Braton Prime', 'Primary', 'Rifle', 8, 0, 'bp.png', null, 1, '{}');
  item.run('/u/mesaPrime', 'Mesa Prime', 'Mesa Prime', 'Warframes', 'Warframe', 0, 0, 'mesa.png', null, 1, '{}');

  const relic = db.prepare('INSERT OR REPLACE INTO relics(name, tier, code, vaulted, drops, rewards) VALUES (?,?,?,?,?,?)');
  const rw = (names) => JSON.stringify({ Intact: names.map((n) => ({ name: n, rarity: 'Common', chance: 25 })) });
  // Lith (disponível): Braton Prime Barrel (peça) + Braton Prime Blueprint (o set)
  relic.run('Lith B1', 'Lith', 'B1', 0, '[]', rw(['Braton Prime Barrel', 'Braton Prime Blueprint', 'Forma Blueprint']));
  // Neo (disponível): Mesa Prime Blueprint
  relic.run('Neo M1', 'Neo', 'M1', 0, '[]', rw(['Mesa Prime Blueprint', 'Mesa Prime Chassis']));
  // Axi (VAULTED): não deve entrar
  relic.run('Axi V1', 'Axi', 'V1', 1, '[]', rw(['Braton Prime Receiver']));
}

test('activePrimeTiers: extrai tiers de prime; Omnia vira curinga; ignora Requiem', () => {
  assert.deepEqual(activePrimeTiers([{ tier: 'Lith' }, { tier: 'Neo' }, { tier: 'Requiem' }]), ['Lith', 'Neo']);
  assert.deepEqual(activePrimeTiers([{ tier: 'Omnia' }]), ['Lith', 'Meso', 'Neo', 'Axi']);
  assert.deepEqual(activePrimeTiers([]), []);
  assert.deepEqual(activePrimeTiers([{ tier: 'Requiem' }]), []);
});

test('buildFarmable: agrupa por SET prime, do TIER ativo, sem vaulted nem Forma', async () => {
  seed();
  // fissuras ativas: Lith e Neo (Axi NÃO tem fissura → mesmo se tivesse relíquia, não conta)
  const { tiers, items } = await buildFarmable([{ tier: 'Lith' }, { tier: 'Neo' }], { prices: false });
  assert.deepEqual(tiers, ['Lith', 'Neo']);

  const names = items.map((i) => i.name).sort();
  assert.deepEqual(names, ['Braton Prime', 'Mesa Prime'], `esperava os 2 sets, veio ${JSON.stringify(names)}`);

  // o blueprint principal casou o PRIME (não o base "Braton")
  assert.ok(!items.some((i) => i.name === 'Braton'), 'não pode aparecer o item BASE "Braton"');
  // Braton Prime vem do Lith; Mesa Prime do Neo
  const braton = items.find((i) => i.name === 'Braton Prime');
  assert.deepEqual(braton.tiers, ['Lith']);
  assert.equal(braton.category, 'Primary');
  // URL bonita: o `itemUrl` monta o índice de slug sozinho, então nem o
  // primeiro acesso do processo cai na forma legada `/item.html?u=`
  assert.equal(braton.url, '/item/braton-prime');
});

test('buildFarmable: sem tier de prime ativo → lista vazia', async () => {
  const out = await buildFarmable([{ tier: 'Requiem' }], { prices: false });
  assert.deepEqual(out, { tiers: [], items: [] });
});

test('buildFarmable: Omnia ativa habilita todos os tiers disponíveis', async () => {
  const { tiers, items } = await buildFarmable([{ tier: 'Omnia' }], { prices: false });
  assert.deepEqual(tiers, ['Lith', 'Meso', 'Neo', 'Axi']);
  // Axi V1 é vaulted → o Braton Prime Receiver dela NÃO adiciona o tier Axi
  const braton = items.find((i) => i.name === 'Braton Prime');
  assert.ok(braton && !braton.tiers.includes('Axi'), 'relíquia Axi vaulted não deve contar');
});
