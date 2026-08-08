'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Dois invariantes do worldstate, provados com `fetch` stubado (sem rede real):
//  1) COALESCÊNCIA: uma rajada concorrente no cache frio dispara UM fetch por
//     chave, não N por request - sem isso dava para amplificar tráfego contra a
//     API pública upstream.
//  2) TERRA = CETUS (Update 38.5): a Terra compartilha o MESMO ciclo do Cetus,
//     então NÃO é um relógio separado - o ciclo do Cetus declara `worlds:
//     ['cetus','earth']` e não há chip 'earth'. NUNCA buscar /earthCycle (cálculo
//     legado de 8h, defasado do jogo).
test('getCycles(): coalesce 1 fetch/chave; Cetus representa a Terra (worlds)', async () => {
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

    // 5 mundos reais, 1 fetch cada (coalescência) - e ZERO fetch da Terra
    assert.deepEqual(Object.values(calls).sort(), [1, 1, 1, 1, 1]);
    assert.equal(calls.earthCycle, undefined, 'Terra não pode puxar /earthCycle (legado)');

    // saída: 5 relógios distintos - a Terra NÃO é um chip próprio
    assert.equal(a.length, 5);
    assert.ok(!a.some((x) => x.id === 'earth'), 'não há relógio separado da Terra');
    // o ciclo do Cetus representa também a Terra
    const cetus = a.find((x) => x.id === 'cetus');
    assert.deepEqual(cetus.worlds, ['cetus', 'earth'], 'Cetus cobre Cetus + Terra');
    // os demais representam só a si mesmos
    for (const x of a.filter((y) => y.id !== 'cetus')) {
      assert.deepEqual(x.worlds, [x.id], `${x.id} representa só a si mesmo`);
    }

    // cache quente: nenhuma chamada nova; resultados idênticos
    assert.deepEqual(b, a);
    assert.deepEqual(c, a);
    await getCycles();
    assert.deepEqual(Object.values(calls).sort(), [1, 1, 1, 1, 1]);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('getCycles(): sem Cetus disponível, some com a Terra junto (sem fonte correta)', async () => {
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
    assert.ok(!cycles.some((c) => c.id === 'cetus'), 'sem cetusCycle, o Cetus some');
    assert.ok(!cycles.some((c) => c.id === 'earth'), 'e a Terra junto (era o mesmo relógio)');
    assert.ok(!cycles.some((c) => (c.worlds || []).includes('earth')), 'nenhum relógio reivindica a Terra');
  } finally {
    globalThis.fetch = realFetch;
    delete require.cache[require.resolve('../server/worldstate')];
  }
});

// A flag `active` do /voidTrader upstream falha (flagrado ao vivo 2026-08-08:
// `active: null` com o Baro NA relay, activation no passado e expiry no futuro,
// 37 itens no inventário). normalizeBaro deriva o estado dos TIMESTAMPS - a
// flag só vale quando algum timestamp vem inválido.
test('normalizeBaro: timestamps mandam sobre a flag `active` do upstream', () => {
  const { normalizeBaro } = require('../server/worldstate');
  const now = Date.parse('2026-08-08T12:00:00.000Z');
  const visit = {
    active: null, // upstream mentindo (caso real)
    activation: '2026-08-07T13:00:00.000Z',
    expiry: '2026-08-09T13:00:00.000Z',
    location: 'Kronia Relay (Saturn)',
    inventory: new Array(37).fill({}),
  };
  const b = normalizeBaro(visit, now);
  assert.equal(b.active, true, 'chegou e não saiu ⇒ está na relay, digam o que digam');
  assert.equal(b.items, 37);

  // antes de chegar: activation no futuro ⇒ inactive, mesmo com flag true
  const before = normalizeBaro({ ...visit, active: true, activation: '2026-08-14T13:00:00.000Z', expiry: '2026-08-16T13:00:00.000Z' }, now);
  assert.equal(before.active, false);

  // depois de sair: expiry no passado ⇒ inactive
  const after = normalizeBaro({ ...visit, activation: '2026-08-01T13:00:00.000Z', expiry: '2026-08-03T13:00:00.000Z' }, now);
  assert.equal(after.active, false);

  // timestamp inválido ⇒ cai na flag; payload não-objeto ⇒ null
  assert.equal(normalizeBaro({ active: true, activation: 'nope', expiry: 'nope' }, now).active, true);
  assert.equal(normalizeBaro(null, now), null);
});
