'use strict';

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

// Monta um banco LEGADO (sem a coluna nova) ANTES de o módulo db.js carregar, e
// aponta a app para ele. É o cenário real do deploy: o volume ./data já existia.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wfh-legacy-'));
const DB = path.join(TMP, 'legacy.db');
{
  const old = new Database(DB);
  old.exec(`CREATE TABLE items (
    unique_name TEXT PRIMARY KEY, name TEXT NOT NULL, name_pt TEXT,
    category TEXT NOT NULL, type TEXT, mastery_req INTEGER, vaulted INTEGER,
    image_name TEXT, wiki_url TEXT, tradable INTEGER NOT NULL DEFAULT 0, raw TEXT NOT NULL)`);
  old.prepare('INSERT INTO items (unique_name,name,category,raw) VALUES (?,?,?,?)')
    .run('/u/x', 'Coisa', 'Resources', '{}');
  old.close();
}
process.env.DB_PATH = DB;
process.env.DATA_DIR = TMP;

const test = require('node:test');
const assert = require('node:assert/strict');
const { getDb } = require('../server/db');

test('getDb() migra o banco legado no boot (o site caiu por causa disto)', () => {
  // `CREATE TABLE IF NOT EXISTS` não altera tabela existente: sem a migração
  // LIGADA no getDb(), a app sobe e morre no primeiro SELECT de name_zh, e o
  // site inteiro fica em 502. Este teste falha se alguém desligar a chamada.
  const db = getDb();
  const cols = db.prepare('PRAGMA table_info(items)').all().map((c) => c.name);
  assert.ok(cols.includes('name_zh'), `coluna nova ausente depois do boot: ${cols.join(', ')}`);
  // e a consulta que a busca faz de verdade tem que rodar
  const row = db.prepare('SELECT unique_name, name, name_pt, name_zh FROM items LIMIT 1').get();
  assert.equal(row.name, 'Coisa');
  assert.equal(row.name_zh, null, 'linha antiga fica com a coluna nula, não perde dado');
});
