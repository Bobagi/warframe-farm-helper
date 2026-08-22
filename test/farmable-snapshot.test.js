'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wfh-snap-'));
process.env.DB_PATH = path.join(TMP, 'test.db');
process.env.DATA_DIR = TMP;

const test = require('node:test');
const assert = require('node:assert/strict');

const { getDb } = require('../server/db');
const { saveFarmableSnapshot, loadFarmableSnapshot } = require('../server/itemview');

// Resiliência contra o warframestat.us (saga 2026-08-19..22): a última resposta
// saudável do farmável vira uma foto na tabela meta, servida com aviso datado
// quando a fonte degrada. Aqui trava-se o ciclo salvar → carregar → throttle.
test('snapshot do farmável: salva, carrega e respeita o throttle de 1h', () => {
  const db = getDb();
  assert.equal(loadFarmableSnapshot(db), null, 'sem foto no banco novo');

  const data = {
    tiers: ['Lith', 'Meso'],
    items: [{ uniqueName: '/u/valkyr-p', name: 'Valkyr Prime', tiers: ['Lith'], platinum: 70 }],
  };
  assert.equal(saveFarmableSnapshot(data, db), true, 'primeira foto grava');

  const snap = loadFarmableSnapshot(db);
  assert.ok(snap && snap.savedAt, 'foto tem data');
  assert.deepEqual(snap.data, data, 'conteúdo íntegro no roundtrip');

  // 2ª gravação logo em seguida: dentro do throttle → não sobrescreve
  const other = { tiers: ['Axi'], items: [{ uniqueName: '/u/x', name: 'X Prime', tiers: ['Axi'] }] };
  assert.equal(saveFarmableSnapshot(other, db), false, 'throttle bloqueia');
  assert.deepEqual(loadFarmableSnapshot(db).data, data, 'foto original preservada');
});

test('snapshot corrompido no meta não derruba a rota: load devolve null', () => {
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES ('farmable_snapshot', 'nao-e-json{')").run();
  assert.equal(loadFarmableSnapshot(db), null);
});
