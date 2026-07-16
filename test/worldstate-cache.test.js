'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Dois invariantes do worldstate, provados com `fetch` stubado (sem rede real):
//  1) COALESCÊNCIA: uma rajada concorrente no cache frio dispara UM fetch por
//     chave, não N por request — sem isso dava para amplificar tráfego contra a
//     API pública upstream.
//  2) TERRA = CETUS (Update 38.5): a Terra é derivada do cetusCycle (fonte real
//     da DE), NUNCA buscada de /earthCycle (cálculo legado de 8h, defasado do
//     jogo). Ela não deve gerar fetch próprio e deve espelhar estado+expiry.
test('getCycles(): coalesce 1 fetch/chave e deriva a Terra do Cetus', async () => {
  const realFetch = globalThis.fetch;
  const calls = {};
  const future = new Date(Date.now() + 3600e3).toISOString();
  const byPath = {
    cetusCycle: { state: 'day', expiry: future },
    vallisCycle: { state: 'warm', expiry: future },
    cambionCycle: { state: 'fass', expiry: future },
    duviriCycle: { state: 'joy', expiry: future },
    zarimanCycle: { state: 'grineer', expiry: future },
  };
  globalThis.fetch = async (url) => {
    const path = String(url).split('/').pop();
    calls[path] = (calls[path] || 0) + 1;
    await new Promise((r) => setTimeout(r, 30)); // janela p/ a rajada colidir
    return { ok: true, json: async () => byPath[path] };
  };
  try {
    const { getCycles } = require('../server/worldstate');
    const [a, b, c] = await Promise.all([getCycles(), getCycles(), getCycles()]);

    // 5 mundos reais, 1 fetch cada (coalescência) — e ZERO fetch da Terra
    assert.deepEqual(Object.values(calls).sort(), [1, 1, 1, 1, 1]);
    assert.equal(calls.earthCycle, undefined, 'Terra não pode puxar /earthCycle (legado)');

    // saída: 5 reais + Terra derivada = 6
    assert.equal(a.length, 6);
    const cetus = a.find((x) => x.id === 'cetus');
    const earth = a.find((x) => x.id === 'earth');
    assert.ok(cetus && earth, 'Cetus e Terra presentes');
    assert.equal(earth.state, cetus.state, 'Terra segue o ESTADO do Cetus');
    assert.equal(earth.expiry, cetus.expiry, 'Terra segue o EXPIRY do Cetus');

    // cache quente: nenhuma chamada nova; resultados idênticos
    assert.deepEqual(b, a);
    assert.deepEqual(c, a);
    await getCycles();
    assert.deepEqual(Object.values(calls).sort(), [1, 1, 1, 1, 1]);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('getCycles(): sem Cetus disponível, a Terra some (sem fonte correta)', async () => {
  const realFetch = globalThis.fetch;
  const future = new Date(Date.now() + 3600e3).toISOString();
  globalThis.fetch = async (url) => {
    const path = String(url).split('/').pop();
    if (path === 'cetusCycle') throw new Error('cetus indisponível');
    return { ok: true, json: async () => ({ state: 'warm', expiry: future }) };
  };
  // isola do cache do teste anterior: novo registro do módulo
  delete require.cache[require.resolve('../server/worldstate')];
  try {
    const { getCycles } = require('../server/worldstate');
    const cycles = await getCycles();
    assert.ok(!cycles.some((c) => c.id === 'earth'),
      'sem Cetus não há como derivar a Terra — ela não deve aparecer');
    assert.ok(!cycles.some((c) => c.id === 'cetus'));
  } finally {
    globalThis.fetch = realFetch;
    delete require.cache[require.resolve('../server/worldstate')];
  }
});
