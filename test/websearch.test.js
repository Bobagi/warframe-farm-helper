'use strict';

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

// env ANTES do require (módulos leem no load)
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wfh-web-'));
process.env.DB_PATH = path.join(TMP, 'test.db');
process.env.DATA_DIR = TMP;
process.env.CSE_DAILY_LIMIT = '2';
process.env.GOOGLE_API_KEY = 'k-fake';
process.env.GOOGLE_CSE_ID = 'cx-fake';

const test = require('node:test');
const assert = require('node:assert/strict');
const { webSearch } = require('../server/websearch');

let fetchCalls = 0;
global.fetch = async (url) => {
  fetchCalls++;
  assert.match(String(url), /^https:\/\/www\.googleapis\.com\/customsearch\/v1\?/);
  return {
    ok: true,
    json: async () => ({
      items: [{ title: 'Resultado', snippet: 'trecho', link: 'https://wiki.warframe.com/x', displayLink: 'wiki.warframe.com' }],
    }),
  };
};

test('com chaves: consulta o CSE, cacheia e não repete a chamada', async () => {
  const first = await webSearch('build saryn endgame');
  assert.equal(first.mode, 'cse');
  assert.equal(first.cached, false);
  assert.equal(first.results.length, 1);
  assert.equal(fetchCalls, 1);

  const second = await webSearch('BUILD   Saryn   endgame'); // normalização deve casar
  assert.equal(second.mode, 'cse');
  assert.equal(second.cached, true);
  assert.equal(fetchCalls, 1, 'cache hit não pode gastar cota nem rede');
});

test('cota diária esgotada ⇒ degrada para links sem chamar a rede', async () => {
  const q2 = await webSearch('outra consulta'); // consome a 2ª (e última) cota
  assert.equal(q2.mode, 'cse');
  assert.equal(fetchCalls, 2);

  const q3 = await webSearch('terceira consulta diferente');
  assert.equal(q3.mode, 'links', 'estourou a cota ⇒ modo links');
  assert.equal(fetchCalls, 2, 'sem cota não pode haver chamada de rede');
  assert.ok(q3.links.length >= 4);
  assert.match(q3.links[0].url, /wiki\.warframe\.com/);
  assert.match(q3.links[0].url, /terceira%20consulta%20diferente/);
});

test('erro do upstream ⇒ degrada para links (não quebra a busca)', async () => {
  global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  const out = await webSearch('quarta consulta'); // cota já estourada nem chega na rede…
  assert.equal(out.mode, 'links');
});
