'use strict';

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wfh-acq-'));
process.env.DB_PATH = path.join(TMP, 'test.db');
process.env.DATA_DIR = TMP;

const test = require('node:test');
const assert = require('node:assert/strict');

// Nada de rede: worldstate (fissuras), Varzia e a API de drops são stubadas via
// globalThis.fetch, do mesmo jeito que test/varzia.test.js faz.
const dropCalls = [];
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('/drops/search/')) {
    const name = decodeURIComponent(u.split('/drops/search/')[1]);
    dropCalls.push(name);
    // "Mutagen Sample" tem onde farmar; qualquer outro nome, não
    const arr = name === 'Mutagen Sample'
      ? [{ item: 'Mutagen Sample', place: 'Eris/Candiru (Caches)', chance: 15.49, rarity: 'Uncommon' }]
      : [];
    return { ok: true, status: 200, json: async () => arr };
  }
  // fissuras / void trader / qualquer outro worldstate: vazio é suficiente
  return { ok: true, status: 200, json: async () => [] };
};

const { getDb } = require('../server/db');
const { buildItemDetail } = require('../server/itemview');
const { getAcquisition } = require('../server/acquisition');

const RESOURCE_U = '/Lotus/Types/Items/Research/BioComponent';

function seed() {
  const db = getDb();
  const ins = db.prepare(`INSERT OR REPLACE INTO items
    (unique_name, name, name_pt, category, type, mastery_req, vaulted, image_name, wiki_url, tradable, raw)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);

  // recurso que TEM drop no dataset E TEM receita de forja - o caso da Massa
  // Mutagênica, que é justamente onde a receita sumia da página
  ins.run(RESOURCE_U, 'Mutagen Mass', 'Massa Mutagênica', 'Resources', 'Resource', null, null,
    'MutagenMass.png', null, 0, JSON.stringify({
      name: 'Mutagen Mass',
      uniqueName: RESOURCE_U,
      type: 'Resource',
      buildPrice: 15000,
      buildTime: 43200,
      skipBuildTimePrice: 5,
      imageName: 'MutagenMass.png',
      drops: [{ location: 'Orb Vallis Bounty', chance: 33.33, rarity: 'Common' }],
      components: [
        { name: 'Blueprint', uniqueName: '/u/bp', itemCount: 1, imageName: 'blueprint.png', drops: [] },
        { name: 'Mutagen Sample', uniqueName: '/u/ms', itemCount: 10, imageName: 'ms.png', drops: [] },
      ],
    }));
  ins.run('/u/ms', 'Mutagen Sample', 'Amostra Mutagênica', 'Resources', 'Resource', null, null,
    'ms.png', null, 0, '{"name":"Mutagen Sample","drops":[]}');
  ins.run('/u/circuits', 'Circuits', 'Circuitos', 'Resources', 'Resource', null, null,
    'circ.png', null, 0, '{"name":"Circuits","drops":[]}');

  db.prepare('INSERT OR REPLACE INTO acquisition(name, data) VALUES (?,?)').run('Mutagen Mass',
    JSON.stringify({
      research: {
        lab: 'Infested', labName: 'Bio Lab', credits: 5000, affinity: 2000,
        timeSec: 259200, prereq: null,
        resources: [{ name: 'Mutagen Sample', count: 5 }, { name: 'Circuits', count: 150 },
          { name: 'Recurso Sem Pagina', count: 1 }],
      },
      vendors: [],
      market: null,
    }));
}
seed();

// --------------------------------------------------------------- regressões

test('recurso FARMÁVEL continua mostrando a receita de forja (era escondida)', async () => {
  const d = await buildItemDetail(RESOURCE_U, 'pt');
  assert.ok(d.sources.other.length > 0, 'pré-condição: o recurso tem drop no dataset');
  assert.equal(d.components.length, 2, 'ter drop NÃO pode zerar os componentes');
  assert.equal(d.crafting.credits, 15000, 'sem componentes o bloco de forja também sumia');
  assert.equal(d.crafting.time, '12 h');
  assert.equal(d.crafting.rushPlatinum, 5);
});

test('componente "Blueprint" não sai procurando drop de recurso', async () => {
  await buildItemDetail(RESOURCE_U, 'pt');
  assert.ok(!dropCalls.includes('Blueprint'),
    `buscar "Blueprint" na API de drops casa o item literal de toda missão de Resgate; chamadas: ${JSON.stringify(dropCalls)}`);
  assert.ok(dropCalls.includes('Mutagen Sample'), 'recurso de verdade continua sendo buscado');
});

test('componente com via de aquisição NÃO é carimbado de vaulted', async () => {
  const d = await buildItemDetail(RESOURCE_U, 'pt');
  const bp = d.components.find((c) => c.name === 'Blueprint');
  assert.equal(bp.isBlueprint, true);
  assert.equal(bp.available, true, 'o projeto vem da pesquisa do Dojo: "vaulted" é o oposto da verdade');
  assert.equal(bp.resourceDrops.length, 0);
  const ms = d.components.find((c) => c.name === 'Mutagen Sample');
  assert.equal(ms.available, true, 'componente com drop achado na API também está disponível');
});

test('passo a passo não diz "sem fonte" de um componente que a página mostra com drop', async () => {
  const d = await buildItemDetail(RESOURCE_U, 'pt');
  const ms = d.components.find((c) => c.name === 'Mutagen Sample');
  assert.ok(ms.resourceDrops.length > 0, 'pré-condição: a página mostra onde farmar');
  const contradiz = d.steps.filter((s) => s.startsWith('Mutagen Sample') && /sem fonte/i.test(s));
  assert.deepEqual(contradiz, [], `a página se contradizia: ${JSON.stringify(d.steps)}`);
  assert.ok(d.steps.some((s) => s.startsWith('Mutagen Sample') && s.includes('Eris/Candiru')),
    'e o passo certo cita o local achado');
});

// --------------------------------------------------------------- aquisição

test('a pesquisa do Dojo entra no payload e é o PRIMEIRO passo', async () => {
  const d = await buildItemDetail(RESOURCE_U, 'pt');
  assert.equal(d.acquisition.research.lab, 'Bio Lab');
  assert.equal(d.acquisition.research.credits, 5000);
  assert.match(d.steps[0], /^Projeto: pesquise no Bio Lab do Dojo do clã/);
  assert.match(d.steps[0], /5\.000 créditos/);
  assert.match(d.steps[0], /5x Mutagen Sample/);
  assert.match(d.steps[0], /150x Circuits/);
  assert.match(d.steps[0], /3 dias/);
});

test('o passo do Dojo sai em inglês quando lang != pt', async () => {
  const d = await buildItemDetail(RESOURCE_U, 'en');
  assert.match(d.steps[0], /^Blueprint: research it in the Bio Lab at your clan Dojo/);
  assert.match(d.steps[0], /5,000 credits/, 'número no formato en-US');
});

test('material da pesquisa vira link quando o item existe; texto puro quando não', async () => {
  const d = await buildItemDetail(RESOURCE_U, 'pt');
  const [ms, circ, orfao] = d.acquisition.research.resources;
  assert.equal(ms.url, '/item/mutagen-sample');
  assert.equal(ms.namePt, 'Amostra Mutagênica');
  assert.ok(ms.image.endsWith('/ms.png'));
  assert.equal(circ.url, '/item/circuits');
  assert.equal(orfao.url, null, 'material sem página no site não pode virar link quebrado');
  assert.equal(orfao.name, 'Recurso Sem Pagina');
});

test('item sem linha na tabela de aquisição fica com acquisition = null', async () => {
  const d = await buildItemDetail('/u/ms', 'pt');
  assert.equal(d.acquisition, null);
});

// ------------------------------------------------- shape / robustez do leitor

test('getAcquisition: preço do vendedor ordena mais barato primeiro dentro da moeda', () => {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO acquisition(name, data) VALUES (?,?)').run('Peca', JSON.stringify({
    research: null,
    vendors: [
      { vendor: 'Caro', currency: 'Standing', cost: 25000, qty: 1, rank: 3, link: 'Caro' },
      { vendor: 'Barato', currency: 'Standing', cost: 5000, qty: 2, rank: null, link: 'Barato' },
    ],
    market: { platinum: null, blueprintCredits: 15000 },
  }));
  const a = getAcquisition(db, ['Peca']).get('Peca');
  assert.deepEqual(a.vendors.map((v) => v.vendor), ['Barato', 'Caro']);
  assert.equal(a.vendors[0].qty, 2);
  assert.equal(a.vendors[0].wiki, 'https://wiki.warframe.com/w/Barato');
  assert.equal(a.market.blueprintCredits, 15000);
  assert.equal(a.market.platinum, null);
});

test('getAcquisition: entrada sem nada útil não vira card vazio', () => {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO acquisition(name, data) VALUES (?,?)')
    .run('Nada', JSON.stringify({ research: null, vendors: [], market: null }));
  db.prepare('INSERT OR REPLACE INTO acquisition(name, data) VALUES (?,?)').run('Quebrado', 'nao é json');
  const m = getAcquisition(db, ['Nada', 'Quebrado', 'Inexistente']);
  assert.equal(m.size, 0);
});

test('getAcquisition: banco SEM a tabela (versão antiga) devolve vazio, não derruba a página', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wfh-old-'));
  const Database = require('better-sqlite3');
  const old = new Database(path.join(tmp, 'old.db'));
  old.exec('CREATE TABLE items (unique_name TEXT PRIMARY KEY, name TEXT, name_pt TEXT, image_name TEXT)');
  assert.equal(getAcquisition(old, ['Qualquer']).size, 0);
});

test('getAcquisition: nome com barra/aspas não escapa da URL da wiki', () => {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO acquisition(name, data) VALUES (?,?)').run('Hostil', JSON.stringify({
    research: null,
    vendors: [{ vendor: 'a/../../etc "x"', currency: 'Standing', cost: 1, qty: 1, link: 'a/../../etc "x"' }],
    market: null,
  }));
  const a = getAcquisition(db, ['Hostil']).get('Hostil');
  assert.equal(a.vendors[0].wiki, 'https://wiki.warframe.com/w/a%2F..%2F..%2Fetc_%22x%22');
  assert.ok(a.vendors[0].wiki.startsWith('https://wiki.warframe.com/w/'), 'prefixo fixo, sem esquema controlável');
});
