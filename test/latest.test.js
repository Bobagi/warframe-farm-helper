'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// public/js/latest.js é UMD → carrega em Node. É o coração do fix do autocomplete:
// garante que apenas a resposta da busca MAIS RECENTE seja usada e que a anterior
// em voo seja abortada — o bug era o dropdown mostrar resultado de um texto antigo.
const { createLatestRunner } = require('../public/js/latest');

const delay = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

test('out-of-order: só a resposta da última chamada vale; a anterior é descartada', async () => {
  const runner = createLatestRunner();
  // "abc" começa 1º mas responde por ÚLTIMO (50ms); "xyz" começa depois e responde antes (10ms)
  const slow = runner.run(() => delay(50, 'abc'));
  const fast = runner.run(() => delay(10, 'xyz'));
  const [a, b] = await Promise.all([slow, fast]);

  assert.equal(b.superseded, false, 'a última busca (xyz) deve valer');
  assert.equal(b.value, 'xyz');
  assert.equal(a.superseded, true, 'a busca anterior (abc) chegou tarde → descartada');
});

test('aborta a chamada anterior em voo quando uma nova começa', async () => {
  const runner = createLatestRunner();
  let firstSignal;
  const first = runner.run((signal) => { firstSignal = signal; return delay(50, 'A'); });
  await delay(5);
  assert.equal(firstSignal.aborted, false, 'ainda não abortada');
  const second = runner.run(() => delay(5, 'B'));
  assert.equal(firstSignal.aborted, true, 'nova busca aborta a anterior imediatamente');
  await Promise.all([first, second]);
});

test('cancel(): invalida a resposta pendente (ex.: input esvaziou)', async () => {
  const runner = createLatestRunner();
  let sig;
  const p = runner.run((signal) => { sig = signal; return delay(30, 'stale'); });
  runner.cancel();
  assert.equal(sig.aborted, true, 'cancel aborta a busca em voo');
  const res = await p;
  assert.equal(res.superseded, true, 'a resposta que ainda voltou é marcada obsoleta');
});

test('sequência longa (digita/apaga/digita): vence sempre a última', async () => {
  const runner = createLatestRunner();
  // tempos embaralhados de propósito — a ordem de chegada NÃO é a de disparo
  const times = { a: 40, ab: 5, abc: 60, x: 20, xy: 8 };
  const order = ['a', 'ab', 'abc', 'x', 'xy'];
  const results = await Promise.all(order.map((q) => runner.run(() => delay(times[q], q))));
  const fresh = results.filter((r) => !r.superseded);
  assert.equal(fresh.length, 1, 'exatamente uma resposta não-obsoleta');
  assert.equal(fresh[0].value, 'xy', 'a última disparada (xy) é a única que vale');
});

test('chamada única resolve normalmente (não marca superseded à toa)', async () => {
  const runner = createLatestRunner();
  const res = await runner.run(() => delay(5, 'ok'));
  assert.deepEqual(res, { superseded: false, value: 'ok' });
});
