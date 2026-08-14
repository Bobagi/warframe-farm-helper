'use strict';

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wfh-zh-'));
process.env.DB_PATH = path.join(TMP, 'test.db');
process.env.DATA_DIR = TMP;

const test = require('node:test');
const assert = require('node:assert/strict');
const { tokenize } = require('../server/search');
const { migrate } = require('../server/db');

// ---------------------------------------------------------------- tokenizador

test('tokenize: chinês vira o nome inteiro MAIS os bigramas (não tem espaço)', () => {
  // sem bigrama, "突变原聚合物" é um token só e quem digita um pedaço não acha
  const t = tokenize('突变原聚合物');
  assert.ok(t.includes('突变原聚合物'), 'o nome inteiro continua indexado');
  assert.deepEqual(t.filter((x) => x.length === 2), ['突变', '变原', '原聚', '聚合', '合物']);
});

test('tokenize: separa trecho chinês de trecho latino no MESMO token', () => {
  // os nomes do cliente CN misturam os dois: "布莱顿 Prime", "MK1-布莱顿"
  assert.ok(tokenize('布莱顿Prime').includes('Prime'));
  assert.ok(tokenize('布莱顿Prime').includes('布莱顿'));
  assert.ok(tokenize('MK1-布莱顿').includes('MK1'));
  assert.ok(tokenize('MK1-布莱顿').includes('布莱顿'));
});

test('tokenize: alfabeto latino continua EXATAMENTE como era (sem regressão)', () => {
  assert.deepEqual(tokenize('Braton Prime'), ['Braton', 'Prime']);
  assert.deepEqual(tokenize('Argo & Vel'), ['Argo', 'Vel']);
  assert.deepEqual(tokenize("Ruk's Claw"), ['Ruk', 's', 'Claw']);
  assert.deepEqual(tokenize('Lith K12'), ['Lith', 'K12']);
});

test('tokenize: entrada vazia/estranha não estoura', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(null), []);
  assert.deepEqual(tokenize('   '), []);
  assert.deepEqual(tokenize('一'), ['一'], 'um caractere só não gera bigrama');
});

// ------------------------------------------------------- migração da coluna

test('migrate: acrescenta name_zh num banco que já existia sem ela', () => {
  // CREATE TABLE IF NOT EXISTS NÃO altera tabela existente: sem esta migração a
  // app sobe e morre no primeiro SELECT ("no such column: name_zh")
  const Database = require('better-sqlite3');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wfh-old-'));
  const old = new Database(path.join(dir, 'old.db'));
  old.exec('CREATE TABLE items (unique_name TEXT PRIMARY KEY, name TEXT, name_pt TEXT)');
  assert.ok(!old.prepare('PRAGMA table_info(items)').all().some((c) => c.name === 'name_zh'));
  migrate(old);
  assert.ok(old.prepare('PRAGMA table_info(items)').all().some((c) => c.name === 'name_zh'),
    'a coluna tem que existir depois da migração');
  migrate(old); // idempotente: rodar de novo não pode estourar
  assert.equal(old.prepare("SELECT COUNT(*) c FROM pragma_table_info('items') WHERE name='name_zh'").get().c, 1);
});

// --------------------------------------------------- prosa do servidor em zh

test('pickLang: zh é idioma de verdade; es/ru seguem caindo em inglês', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'api.js'), 'utf8');
  const m = src.match(/const pickLang = \(v\) => \{[\s\S]*?\n\};/);
  assert.ok(m, 'não achei o pickLang');
  // eslint-disable-next-line no-new-func
  const pickLang = new Function(`${m[0]} return pickLang;`)();
  assert.equal(pickLang('zh'), 'zh');
  assert.equal(pickLang('ZH'), 'zh');
  assert.equal(pickLang('pt'), 'pt');
  assert.equal(pickLang(''), 'pt');
  assert.equal(pickLang('es'), 'en');
  assert.equal(pickLang('ru'), 'en');
  assert.equal(pickLang('zh-CN'), 'en', 'o cliente manda só o código de 2 letras');
});
