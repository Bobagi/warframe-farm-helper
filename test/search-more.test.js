'use strict';

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wfh-search2-'));
process.env.DB_PATH = path.join(TMP, 'test.db');
process.env.DATA_DIR = TMP;

const test = require('node:test');
const assert = require('node:assert/strict');
const { getDb } = require('../server/db');
const { buildIndex, searchLocal, suggest, trimTail } = require('../server/search');

test('trimTail corta a cauda fraca (< 28% do topo) e mantém o forte', () => {
  const res = [{ score: 100 }, { score: 40 }, { score: 20 }, { score: 5 }];
  const kept = trimTail(res);
  assert.deepEqual(kept.map((r) => r.score), [100, 40], 'corta 20 e 5 (abaixo de 28)');
  assert.deepEqual(trimTail([{ score: 3 }]).length, 1, 'lista de 1 nunca é cortada');
  assert.deepEqual(trimTail([]).length, 0);
});

test('só componente de relíquia vira documento de busca (ingrediente não)', () => {
  const db = getDb();
  // um item com 1 PARTE de relíquia (Stock) e 1 ingrediente avulso (Morphics)
  const raw = JSON.stringify({
    name: 'Foo Prime',
    components: [
      { name: 'Stock', drops: [{ location: 'Lith K1 Relic', chance: 25, rarity: 'Uncommon' }] },
      { name: 'Morphics', drops: [] },
    ],
  });
  db.prepare(`INSERT OR REPLACE INTO items
    (unique_name, name, name_pt, category, type, mastery_req, vaulted, image_name, wiki_url, tradable, raw)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run('/Lotus/Test/FooPrime', 'Foo Prime', null, 'Primary', 'Rifle', 5, 0, null, null, 1, raw);
  // Morphics existe como recurso próprio (é assim no jogo)
  db.prepare(`INSERT OR REPLACE INTO items
    (unique_name, name, name_pt, category, type, mastery_req, vaulted, image_name, wiki_url, tradable, raw)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run('/Lotus/Test/Morphics', 'Morphics', null, 'Resources', 'Resource', null, null, null, null, 0, '{"name":"Morphics"}');

  buildIndex();

  const stock = searchLocal('foo prime stock');
  assert.equal(stock.strong, true);
  assert.equal(stock.results[0].kind, 'component');
  assert.equal(stock.results[0].name, 'Foo Prime Stock');

  // "foo prime morphics" NÃO pode existir como componente indexado
  const fpm = searchLocal('foo prime morphics');
  assert.ok(!fpm.results.some((r) => r.kind === 'component' && /Morphics/.test(r.name)),
    'ingrediente não vira doc de componente do item');

  // "morphics" acha o recurso próprio, não um componente "Foo Prime Morphics"
  const m = suggest('morphics', 8);
  assert.ok(m.some((r) => r.kind === 'resource' && r.name === 'Morphics'));
  assert.ok(!m.some((r) => r.name === 'Foo Prime Morphics'));
});

test('query sem correspondência continua fraca (aciona web) mesmo com trimTail', () => {
  const { results, strong } = searchLocal('zzz qwerty plugh nothing');
  assert.equal(results.length, 0);
  assert.equal(strong, false);
});

// ---------------------------------------------------------------------------
// Invariante: adicionar item nunca pode remover peça da busca
// ---------------------------------------------------------------------------

test('nome que já é NOME DE PEÇA não pode virar item (some com as peças da busca)', () => {
  // O índice pula o componente cujo nome já é item próprio (para não gerar
  // "Braton Prime Orokin Cell"). Então um item novo chamado "Stock" apaga o doc
  // de busca de TODA peça "<Arma> Stock" - foi o que a moeda do Kahl fez com 62
  // armas, entre elas "Braton Prime Stock", que é chip de exemplo da home.
  const { pickDropOnlyRows } = require('../server/ingest');
  const jaNoSite = [
    { name: 'Braton Prime', slim: { components: [{ name: 'Stock' }, { name: 'Barrel' }] } },
    { name: 'Boltor Prime', slim: { components: [{ name: 'Stock' }] } },
    { name: 'Vainthorn', slim: {} },
  ];
  const candidatos = [
    { name: 'Stock', uniqueName: '/Lotus/Types/Items/MiscItems/KahlCreds', type: 'Misc', drops: [{ location: 'X' }] },
    { name: 'Vainthorn', uniqueName: '/Lotus/Types/Items/MiscItems/DagathAbyssItem', type: 'Misc', drops: [{ location: 'Y' }] },
    { name: 'Vosfor', uniqueName: '/Lotus/Types/Items/MiscItems/DistillPoints', type: 'Misc', drops: [{ location: 'Z' }] },
  ];
  const { rows, blocked } = pickDropOnlyRows(candidatos, jaNoSite);
  const nomes = rows.map((r) => r.name);
  assert.ok(!nomes.includes('Stock'), '"Stock" é nome de peça: não pode virar item');
  assert.ok(!nomes.includes('Vainthorn'), 'nome que o site já tem não entra de novo');
  assert.deepEqual(nomes, ['Vosfor'], 'só o que é realmente novo entra');
  assert.equal(blocked, 2);
});

test('a entrada canônica ganha da mirror de loja quando as duas só têm drop', () => {
  const { pickDropOnlyRows } = require('../server/ingest');
  const candidatos = [
    { name: 'Forma', uniqueName: '/Lotus/StoreItems/Types/Items/MiscItems/Forma', type: 'Equipment Adapter', drops: [{ location: 'X' }] },
    { name: 'Forma', uniqueName: '/Lotus/Types/Items/MiscItems/Forma', type: 'Equipment Adapter', drops: [{ location: 'Y' }] },
  ];
  const { rows } = pickDropOnlyRows(candidatos, []);
  assert.equal(rows.length, 1, 'não pode duplicar a página');
  assert.equal(rows[0].unique_name, '/Lotus/Types/Items/MiscItems/Forma', 'a canônica, não a de loja');
});

test('pickDropOnlyRows limpa o token de ícone antes de comparar o nome', () => {
  const { pickDropOnlyRows } = require('../server/ingest');
  const { rows } = pickDropOnlyRows(
    [{ name: '<ICON_x> Vosfor', uniqueName: '/u/v', type: 'Misc', drops: [{ location: 'X' }] }],
    [{ name: 'Vosfor', slim: {} }]
  );
  assert.deepEqual(rows, [], 'sem limpar o token o guard de nome não casaria e duplicaria a página');
});
