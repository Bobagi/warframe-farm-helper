'use strict';

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wfh-qr-'));
process.env.DB_PATH = path.join(TMP, 'test.db');
process.env.DATA_DIR = TMP;

const test = require('node:test');
const assert = require('node:assert/strict');
const { getDb } = require('../server/db');
const { enrichRewards } = require('../server/itemview');

function seed() {
  const db = getDb();
  const ins = db.prepare(`INSERT OR REPLACE INTO items
    (unique_name, name, name_pt, category, type, mastery_req, vaulted, image_name, wiki_url, tradable, raw)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  ins.run('/u/jade', 'Jade', 'Jade', 'Warframes', 'Warframe', 0, null, 'Jade.png', null, 0, '{}');
  ins.run('/u/orvius', 'Orvius', 'Orvius PT', 'Melee', 'Glaive', 0, null, 'Orvius.png', null, 1, '{}');
  return db;
}

test('enrichRewards: item conhecido ganha IMAGEM (mesmo com sufixo Blueprint)', () => {
  const db = seed();
  const out = enrichRewards(['Jade Blueprint', 'Orvius Blueprint'], db, 'pt');
  assert.equal(out[0].label, 'Jade (Projeto)');
  assert.match(out[0].image, /Jade\.png$/);
  assert.equal(out[1].label, 'Orvius PT (Projeto)'); // usa name_pt
  assert.match(out[1].image, /Orvius\.png$/);
});

test('enrichRewards: cosmético sem item → sem imagem; label traduzido', () => {
  const db = seed();
  const out = enrichRewards(['Alone Portrait', "Stalker's Lair Scene"], db, 'pt');
  assert.equal(out[0].label, 'Retrato: Alone');
  assert.equal(out[0].image, null);
  assert.equal(out[1].label, "Cena: Stalker's Lair");
  assert.equal(out[1].image, null);
});

test('enrichRewards: EN mantém o label cru, mas ainda acha a imagem', () => {
  const db = seed();
  const out = enrichRewards(['Jade Blueprint'], db, 'en');
  assert.equal(out[0].label, 'Jade Blueprint');
  assert.match(out[0].image, /Jade\.png$/);
});
