'use strict';

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wfh-item-'));
process.env.DB_PATH = path.join(TMP, 'test.db');
process.env.DATA_DIR = TMP;

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyDrops, marketSlugFor, fmtBuildTime } = require('../server/itemview');

test('classifyDrops agrupa refinamentos da mesma relíquia e usa a chance intact', () => {
  const { relics, other } = classifyDrops([
    { location: 'Lith K12 Relic', chance: 25.33, rarity: 'Common' },
    { location: 'Lith K12 Relic (Exceptional)', chance: 23.33, rarity: 'Common' },
    { location: 'Lith K12 Relic (Flawless)', chance: 20, rarity: 'Common' },
    { location: 'Lith K12 Relic (Radiant)', chance: 16.67, rarity: 'Uncommon' },
  ]);
  assert.equal(other.length, 0);
  assert.equal(relics.length, 1, 'os 4 refinamentos são a MESMA relíquia');
  assert.equal(relics[0].relic, 'Lith K12');
  assert.equal(relics[0].tier, 'Lith');
  assert.equal(relics[0].chanceIntact, 25.33, 'chance exibida é a da entrada sem sufixo (intact)');
});

test('classifyDrops separa fontes que não são relíquia e deduplica pela maior chance', () => {
  const { relics, other } = classifyDrops([
    { location: 'Axi A1 Relic', chance: 2, rarity: 'Rare' },
    { location: 'Isolation Vault (Deimos), Rotation B', chance: 10, rarity: 'Uncommon' },
    { location: 'Isolation Vault (Deimos), Rotation B', chance: 4, rarity: 'Uncommon' },
    { location: 'Zealoid Prelate (Boss)', chance: 38, rarity: 'Common' },
  ]);
  assert.equal(relics.length, 1);
  assert.equal(other.length, 2, 'localizações repetidas colapsam numa só');
  assert.equal(other[0].location, 'Zealoid Prelate (Boss)', 'ordena por chance desc');
  const vault = other.find((d) => d.location.startsWith('Isolation'));
  assert.equal(vault.chance, 10, 'no dedupe fica a MAIOR chance');
});

test('classifyDrops reconhece relíquias Requiem', () => {
  const { relics, other } = classifyDrops([
    { location: 'Requiem I Relic (Radiant)', chance: 25, rarity: 'Common' },
  ]);
  assert.equal(other.length, 0);
  assert.equal(relics.length, 1);
  assert.equal(relics[0].relic, 'Requiem I');
});

test('classifyDrops anota `wiki` no inimigo e deixa null no nó de missão', () => {
  const { other } = classifyDrops([
    { location: 'Tusk Thumper Bull', chance: 5.53, rarity: 'Rare' },
    { location: 'Uranus/Titania (Assassination)', chance: 22.56, rarity: 'Uncommon' },
  ]);
  const thumper = other.find((d) => d.location === 'Tusk Thumper Bull');
  const node = other.find((d) => d.location.startsWith('Uranus/'));
  assert.equal(thumper.wiki, 'https://wiki.warframe.com/index.php?search=Tusk%20Thumper%20Bull');
  assert.equal(node.wiki, null, 'nó de missão não é inimigo');
});

test('marketSlugFor gera slugs no formato do warframe.market', () => {
  assert.equal(marketSlugFor('Braton Prime Stock'), 'braton_prime_stock');
  assert.equal(marketSlugFor('Kompressa Prime Barrel'), 'kompressa_prime_barrel');
  assert.equal(marketSlugFor("Vor's Prize & Co."), 'vors_prize_co');
});

test('fmtBuildTime formata segundos em h/dias/min', () => {
  assert.equal(fmtBuildTime(259200), '3 dias');
  assert.equal(fmtBuildTime(43200), '12 h');
  assert.equal(fmtBuildTime(1800), '30 min');
  assert.equal(fmtBuildTime(null), null);
  assert.equal(fmtBuildTime(0), null);
});
