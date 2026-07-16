'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Prova a coalescência do cache do worldstate: uma rajada concorrente no
// cache frio dispara UM fetch por chave (6 mundos), não N por request —
// sem isso, dava para amplificar tráfego contra a API pública upstream.
test('cached(): rajada concorrente coalesce em 1 fetch por chave', async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  const future = new Date(Date.now() + 3600e3).toISOString();
  globalThis.fetch = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 30)); // janela p/ a rajada colidir
    return { ok: true, json: async () => ({ state: 'day', expiry: future }) };
  };
  try {
    const { getCycles } = require('../server/worldstate');
    const [a, b, c] = await Promise.all([getCycles(), getCycles(), getCycles()]);
    assert.equal(calls, 6, `esperava 1 fetch por mundo (6), veio ${calls}`);
    assert.equal(a.length, 6);
    assert.deepEqual(b, a);
    assert.deepEqual(c, a);
    // cache quente: nenhuma chamada nova
    await getCycles();
    assert.equal(calls, 6);
  } finally {
    globalThis.fetch = realFetch;
  }
});
