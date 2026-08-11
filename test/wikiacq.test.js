'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { parseLuaModule } = require('../server/lua');
const {
  indexResearch, indexVendors, indexMarket, mergeIndexes,
} = require('../server/wikiacq');

const lua = (src) => parseLuaModule(src);

// ---------------------------------------------------------------- pesquisa

test('indexResearch: traduz a chave do lab no NOME do laboratório do Dojo', () => {
  const idx = indexResearch(lua(`return {
    Labs = { ["Infested"] = { Name = 'Bio Lab' }, ["Grineer"] = { Name = 'Chem Lab' } },
    Research = {
      ["Mutagen Mass"] = { Lab = 'Infested', Time = 259200, Affinity = 2000, Credits = 5000,
        Resources = {{Name = 'Mutagen Sample', Count = 5}, {Name = 'Circuits', Count = 150}} },
      ["Detonite Injector"] = { Lab = 'Grineer', Credits = 5000, Prereq = 'Machete',
        Resources = {{Name = 'Ferrite', Count = 200}} },
    } }`));
  const mm = idx.get('Mutagen Mass');
  assert.equal(mm.labName, 'Bio Lab', 'o jogador procura "Bio Lab" no Dojo, não "Infested"');
  assert.equal(mm.credits, 5000);
  assert.equal(mm.affinity, 2000);
  assert.equal(mm.timeSec, 259200);
  assert.equal(mm.prereq, null);
  assert.deepEqual(mm.resources, [
    { name: 'Mutagen Sample', count: 5 },
    { name: 'Circuits', count: 150 },
  ]);
  assert.equal(idx.get('Detonite Injector').prereq, 'Machete');
});

test('indexResearch: lab desconhecido cai no próprio código, sem virar undefined', () => {
  const idx = indexResearch(lua("return { Labs = {}, Research = { X = { Lab = 'Hollow', Credits = 1 } } }"));
  assert.equal(idx.get('X').labName, 'Hollow');
});

test('indexResearch: entrada sem lab, sem custo e sem material fica de fora', () => {
  const idx = indexResearch(lua("return { Labs = {}, Research = { Vazio = { Image = 'x.png' }, Ok = { Lab = 'Tenno' } } }"));
  assert.ok(!idx.has('Vazio'), 'entrada só com imagem não é via de aquisição');
  assert.ok(idx.has('Ok'));
});

test('indexResearch: módulo ausente/quebrado devolve mapa vazio em vez de estourar', () => {
  assert.equal(indexResearch(null).size, 0);
  assert.equal(indexResearch({}).size, 0);
});

// ---------------------------------------------------------------- vendedores

test('indexVendors: oferta posicional vira {vendedor, moeda, preço, qtd, rank}', () => {
  const idx = indexVendors(lua(`return { Vendors = {
    ["Steel Meridian"] = { Currency = 'Standing', Link = 'Steel Meridian', Name = 'Steel Meridian',
      Offerings = { { "Velocitus Receiver", "Item", 20000, 1, Prereq = 2 } } } } }`));
  const [o] = idx.get('Velocitus Receiver');
  assert.equal(o.vendor, 'Steel Meridian');
  assert.equal(o.currency, 'Standing');
  assert.equal(o.cost, 20000);
  assert.equal(o.qty, 1);
  assert.equal(o.rank, 2);
});

test('indexVendors: preço em TABELA usa a moeda de dentro, não a do vendedor', () => {
  // o Simaris cobra reputação em quase tudo, MAS o scanner é em créditos
  const idx = indexVendors(lua(`return { Vendors = {
    ["Cephalon Simaris"] = { Currency = 'Standing', Name = 'Cephalon Simaris',
      Offerings = { { "Synthesis Scanner", "Gear", { Credits = 5000 }, 25 } } } } }`));
  const [o] = idx.get('Synthesis Scanner');
  assert.equal(o.currency, 'Credits', 'moeda do preço vence a do vendedor');
  assert.equal(o.cost, 5000);
  assert.equal(o.qty, 25);
});

test('indexVendors: oferta SEM preço não entra (linha inútil na página)', () => {
  const idx = indexVendors(lua(`return { Vendors = {
    ["X"] = { Currency = 'Standing', Name = 'X', Offerings = {
      { "Sem Preco", "Item" },
      { "Com Preco", "Item", 100 } } } } }`));
  assert.ok(!idx.has('Sem Preco'));
  assert.equal(idx.get('Com Preco')[0].cost, 100);
});

test('indexVendors: mesmo vendedor e mesma moeda repetidos ficam com o MAIS BARATO', () => {
  const idx = indexVendors(lua(`return { Vendors = {
    ["Acrithis"] = { Currency = 'Pathos Clamp', Name = 'Acrithis', Offerings = {
      { "Forma Blueprint", "Blueprint", 30, 1 },
      { "Forma Blueprint", "Blueprint", 10, 1 } } } } }`));
  const list = idx.get('Forma Blueprint');
  assert.equal(list.length, 1, 'não repete o vendedor na lista');
  assert.equal(list[0].cost, 10);
});

test('indexVendors: vendedores diferentes viram entradas diferentes do mesmo item', () => {
  const idx = indexVendors(lua(`return { Vendors = {
    ["A"] = { Currency = 'Standing', Name = 'A', Offerings = { { "Item", "Item", 5 } } },
    ["B"] = { Currency = 'Credits', Name = 'B', Offerings = { { "Item", "Item", 7 } } } } }`));
  assert.equal(idx.get('Item').length, 2);
});

// ---------------------------------------------------------------- mercado

test('indexMarket: indexa pelo RESULTADO da forja, não pelo nome do projeto', () => {
  const idx = indexMarket(lua(`return { Blueprints = {
    Acceltra = { MarketCost = 240, Name = 'Acceltra Blueprint', Result = 'Acceltra' } } }`));
  assert.ok(!idx.has('Acceltra Blueprint'), 'a página é do item pronto');
  assert.equal(idx.get('Acceltra').platinum, 240);
});

test('indexMarket: sem Result usa a chave; entrada sem preço nenhum fica de fora', () => {
  const idx = indexMarket(lua(`return { Blueprints = {
    ["Ack & Brunt"] = { BPCost = 15000, MarketCost = 150 },
    SemPreco = { Credits = 30000, Result = 'SemPreco' } } }`));
  assert.deepEqual(idx.get('Ack & Brunt'), { platinum: 150, blueprintCredits: 15000 });
  assert.ok(!idx.has('SemPreco'), 'custo de FORJA não é preço de compra');
});

test('indexMarket: também lê o grupo Suits (warframes)', () => {
  const idx = indexMarket(lua("return { Blueprints = {}, Suits = { Excalibur = { MarketCost = 275, Result = 'Excalibur' } } }"));
  assert.equal(idx.get('Excalibur').platinum, 275);
});

// ---------------------------------------------------------------- merge

test('mergeIndexes: junta as três fontes por nome e descarta nome sem nada', () => {
  const merged = mergeIndexes({
    research: new Map([['Hema', { labName: 'Bio Lab', resources: [] }]]),
    vendors: new Map([['Forma', [{ vendor: 'Operational Supply', cost: 5000 }]]]),
    market: new Map([['Hema', { platinum: 225, blueprintCredits: 15000 }]]),
  });
  assert.equal(merged.size, 2);
  assert.equal(merged.get('Hema').research.labName, 'Bio Lab');
  assert.equal(merged.get('Hema').market.platinum, 225);
  assert.deepEqual(merged.get('Hema').vendors, []);
  assert.equal(merged.get('Forma').research, null);
});

// ------------------------------- rede: a wiki caindo não pode zerar o site ---

/** Sobe um servidor local que responde igual à api.php da wiki (ou falha). */
async function withFakeWiki(handler, fn) {
  const srv = http.createServer(handler);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/api.php`;
  const prev = process.env.WF_WIKI_API;
  process.env.WF_WIKI_API = base;
  delete require.cache[require.resolve('../server/wikiacq')];
  const mod = require('../server/wikiacq');
  try { return await fn(mod); } finally {
    if (prev === undefined) delete process.env.WF_WIKI_API; else process.env.WF_WIKI_API = prev;
    delete require.cache[require.resolve('../server/wikiacq')];
    await new Promise((r) => srv.close(r));
  }
}

const wikiOk = (wikitext) => (req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ parse: { wikitext } }));
};

test('fetchAcquisitionIndex: wiki TODA fora do ar devolve índice VAZIO e lista as falhas', async () => {
  await withFakeWiki((req, res) => { res.statusCode = 500; res.end('nope'); }, async ({ fetchAcquisitionIndex }) => {
    const { index, failed } = await fetchAcquisitionIndex({ log: () => {} });
    // o índice vazio é o sinal que a ingestão usa para NÃO apagar a tabela:
    // preferimos dado velho a página sem "como conseguir".
    assert.equal(index.size, 0, 'nada indexado quando a wiki não responde');
    assert.equal(failed.length, 3, 'os 3 módulos entram na lista de falhas');
  });
});

test('fetchAcquisitionIndex: um módulo quebrado não derruba os outros', async () => {
  const handler = (req, res) => {
    if (req.url.includes('Research')) { res.statusCode = 503; res.end('x'); return; }
    if (req.url.includes('Vendors')) {
      return wikiOk("return { Vendors = { X = { Currency = 'Standing', Name = 'X', Offerings = { { \"Peca\", \"Item\", 10 } } } } }")(req, res);
    }
    return wikiOk("return { Blueprints = { Y = { MarketCost = 50, Result = 'Y' } } }")(req, res);
  };
  await withFakeWiki(handler, async ({ fetchAcquisitionIndex }) => {
    const { index, failed } = await fetchAcquisitionIndex({ log: () => {} });
    assert.deepEqual(failed, ['Module:Research/data']);
    assert.equal(index.get('Peca').vendors[0].cost, 10);
    assert.equal(index.get('Y').market.platinum, 50);
  });
});

test('fetchAcquisitionIndex: rodar duas vezes dá exatamente o mesmo índice (idempotente)', async () => {
  const handler = wikiOk("return { Labs = { A = { Name = 'Bio Lab' } }, Research = { Z = { Lab = 'A', Credits = 1 } } }");
  await withFakeWiki(handler, async ({ fetchAcquisitionIndex }) => {
    const a = await fetchAcquisitionIndex({ log: () => {} });
    const b = await fetchAcquisitionIndex({ log: () => {} });
    assert.deepEqual([...a.index.entries()], [...b.index.entries()]);
  });
});

// ------------------------------- vandalismo na wiki (qualquer um edita) ------

test('indexVendors: nome absurdamente longo é DESCARTADO (não truncado)', () => {
  const huge = 'A'.repeat(400);
  const idx = indexVendors(lua(`return { Vendors = {
    ["${huge}"] = { Currency = 'Standing', Name = '${huge}', Offerings = { { "Alvo", "Item", 1 } } },
    ["Real"] = { Currency = 'Standing', Name = 'Real', Offerings = { { "Alvo", "Item", 2 } } } } }`));
  const list = idx.get('Alvo');
  assert.equal(list.length, 1, 'só o vendedor de nome plausível entra');
  assert.equal(list[0].vendor, 'Real');
  // truncar seria pior: o nome cortado mentiria na tela e não casaria com item nenhum
  assert.ok(!list.some((v) => v.vendor.startsWith('AAAA')));
});

test('indexVendors: item com centenas de ofertas é limitado (uma edição não infla a página)', () => {
  const many = Array.from({ length: 300 }, (_, i) =>
    `["V${i}"] = { Currency = 'Standing', Name = 'V${i}', Offerings = { { "Alvo", "Item", ${i + 1} } } }`).join(',');
  const idx = indexVendors(lua(`return { Vendors = { ${many} } }`));
  const list = idx.get('Alvo');
  assert.ok(list.length <= 12, `esperava teto de 12, veio ${list.length}`);
  // o maior item real hoje tem 8 vendedores, então o teto não corta dado bom
  assert.ok(list.length >= 8);
});

test('indexResearch: lista de materiais tem teto e nome fora do teto derruba a entrada', () => {
  const mats = Array.from({ length: 100 }, (_, i) => `{Name = 'M${i}', Count = 1}`).join(',');
  const idx = indexResearch(lua(`return { Labs = {}, Research = {
    ["Ok"] = { Lab = 'Tenno', Resources = { ${mats} } },
    ["${'B'.repeat(300)}"] = { Lab = 'Tenno', Credits = 1 } } }`));
  assert.ok(idx.get('Ok').resources.length <= 16);
  assert.equal(idx.size, 1, 'entrada com nome de 300 chars não é item de jogo nenhum');
});
