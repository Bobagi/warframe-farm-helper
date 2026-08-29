'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// No jogo SEMPRE há fissuras ativas. Se o upstream responde mas tudo vem
// expirado (espelho do warframestat travado, como em 2026-08-20..29), a
// fonte é marcada 'stale' - mas as fissuras continuam vindo na resposta
// (cada uma marcada `expired`), pro operador de 2026-08-29: a UI mostra o
// que o espelho tem, avisando que está atrasado, em vez de esconder tudo.
test('fissuresSource(): down no erro, ok com fissura ativa, stale (com dado) quando tudo expira', async () => {
  const realFetch = globalThis.fetch;
  // 1º: upstream 404 (cache frio, nada é gravado) → fonte 'down'
  globalThis.fetch = async () => ({ ok: false, status: 404 });
  try {
    const { getFissures, fissuresSource } = require('../server/worldstate');
    await assert.rejects(() => getFissures());
    assert.equal(fissuresSource(), 'down');

    // upstream volta com payload de 2 fissuras (1 ainda válida por ~800ms).
    // O expiry é calculado AQUI (a fase 'down' acima gasta ~1s em retries).
    const soon = new Date(Date.now() + 800).toISOString();
    const past = new Date(Date.now() - 3600e3).toISOString();
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => [
        { id: 'a', node: 'Adrastea (Jupiter)', missionType: 'Sabotage', tier: 'Meso', tierNum: 2, expiry: soon },
        { id: 'b', node: 'Tessera (Venus)', missionType: 'Defense', tier: 'Lith', tierNum: 1, expiry: past },
      ],
    });

    // 1ª leitura: uma fissura ainda válida (a outra já expirada, mas
    // presente e marcada) → fonte ok, as 2 continuam na lista
    const ativas = await getFissures();
    assert.equal(ativas.length, 2);
    assert.equal(ativas.find((f) => f.id === 'a').expired, false);
    assert.equal(ativas.find((f) => f.id === 'b').expired, true);
    assert.equal(fissuresSource(), 'ok');

    // quando a última fissura do payload expira: MESMO cache de raw (sem
    // novo fetch), mas nenhuma mais está no prazo → fonte vira 'stale',
    // as 2 continuam vindo (agora ambas `expired`)
    await new Promise((r) => setTimeout(r, 1000));
    const depois = await getFissures();
    assert.equal(depois.length, 2);
    assert.ok(depois.every((f) => f.expired));
    assert.equal(fissuresSource(), 'stale');
  } finally {
    globalThis.fetch = realFetch;
  }
});
