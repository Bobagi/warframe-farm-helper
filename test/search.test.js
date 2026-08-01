'use strict';

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

// DB efêmero - precisa ser definido ANTES de carregar os módulos
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wfh-search-'));
process.env.DB_PATH = path.join(TMP, 'test.db');
process.env.DATA_DIR = TMP;

const test = require('node:test');
const assert = require('node:assert/strict');
const { getDb } = require('../server/db');
const { buildIndex, searchLocal, suggest } = require('../server/search');

function seed() {
  const db = getDb();
  const rawBraton = JSON.stringify({
    name: 'Braton Prime',
    components: [
      { name: 'Stock', imageName: 'stock.png', drops: [] },
      { name: 'Barrel', drops: [] },
    ],
  });
  // item com componentes DUPLICADOS (caso real: Akfuris → 2× Furis)
  const rawAk = JSON.stringify({
    name: 'Akfuris',
    components: [{ name: 'Furis', drops: [] }, { name: 'Furis', drops: [] }],
  });
  const ins = db.prepare(`INSERT OR REPLACE INTO items
    (unique_name, name, name_pt, category, type, mastery_req, vaulted, image_name, wiki_url, tradable, raw)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  ins.run('/Lotus/Test/BratonPrime', 'Braton Prime', null, 'Primary', 'Rifle', 8, 0, 'bp.png', null, 1, rawBraton);
  ins.run('/Lotus/Test/Akfuris', 'Akfuris', null, 'Secondary', 'Pistol', 0, null, null, null, 0, rawAk);
  // quest cujo name_pt tem a preposição "da" (não "de") - o usuário digita "de"
  ins.run('/Lotus/Test/JadeShadows', 'Jade Shadows', 'Sombras da Jade', 'Quests', 'Key', null, null, null, null, 0,
    JSON.stringify({ name: 'Jade Shadows' }));
  db.prepare('INSERT OR REPLACE INTO relics(name, tier, code, vaulted, drops, rewards) VALUES (?,?,?,?,?,?)')
    .run('Lith K12', 'Lith', 'K12', 0, '[]', '{}');
  db.prepare(`INSERT OR REPLACE INTO articles(slug, kind, title, keywords, match_json, html, body_md, sort)
    VALUES ('reliquias-teste', 'faq', 'Relíquias do Void - como funcionam?', 'reliquia, refinar', NULL, '<p>x</p>', 'x', 10)`).run();
}

test('buildIndex não explode com componentes duplicados e indexa tudo', () => {
  seed();
  const n = buildIndex();
  // 2 itens + 2 componentes únicos (Stock, Barrel, Furis→1) + 1 relíquia + 1 artigo
  assert.ok(n >= 6, `esperava >=6 documentos, veio ${n}`);
});

test('busca exata de componente é strong e vem no topo', () => {
  const { results, strong } = searchLocal('braton prime stock');
  assert.equal(strong, true);
  assert.equal(results[0].name, 'Braton Prime Stock');
  assert.equal(results[0].kind, 'component');
  assert.match(results[0].url, /#c-stock$/);
});

test('busca sem correspondência é fraca (aciona fallback web)', () => {
  const { results, strong } = searchLocal('xyzzy plugh qwerty');
  assert.equal(results.length, 0);
  assert.equal(strong, false);
});

test('busca ignora acentos: "reliquia" acha "Relíquias…"', () => {
  const { results } = searchLocal('reliquia');
  assert.ok(results.some((r) => r.kind === 'faq' && /Relíquias/.test(r.name)),
    `esperava artigo de relíquias em: ${JSON.stringify(results.map((r) => r.name))}`);
});

test('stopword: "Sombras de" acha "Sombras da Jade" (preposição não filtra)', () => {
  // o bug: AND estrito exigia o termo "de", e a quest tem "da" → sumia
  const so = searchLocal('Sombras de');
  assert.ok(so.results.some((r) => r.namePt === 'Sombras da Jade'),
    `"Sombras de" deveria achar a quest: ${JSON.stringify(so.results.map((r) => r.namePt || r.name))}`);
  // e a frase completa que o usuário digita ("de" onde o nome tem "da") também
  const full = searchLocal('Sombras de Jade');
  assert.ok(full.results.some((r) => r.namePt === 'Sombras da Jade'),
    `"Sombras de Jade" deveria achar a quest: ${JSON.stringify(full.results.map((r) => r.namePt || r.name))}`);
});

test('suggest devolve no máximo 8 e inclui a relíquia', () => {
  const out = suggest('lith k12', 8);
  assert.ok(out.length >= 1 && out.length <= 8);
  assert.ok(out.some((r) => r.kind === 'relic' && r.name === 'Lith K12 Relic'));
});
