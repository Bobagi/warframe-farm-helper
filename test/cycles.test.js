'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { CYCLE_DEFS, advanceCycle, normalizeCycle } = require('../server/worldstate');

const def = (id) => CYCLE_DEFS.find((d) => d.id === id);
const MIN = 60e3;

test('CYCLE_DEFS: toda duração cobre todos os estados da ordem', () => {
  for (const d of CYCLE_DEFS) {
    assert.ok(d.order.length >= 2, `${d.id}: ordem curta demais`);
    for (const s of d.order) {
      assert.ok(Number.isFinite(d.dur[s]) && d.dur[s] > 0, `${d.id}: falta duração de "${s}"`);
    }
  }
});

test('normalizeCycle: expiry no futuro passa direto, sem previsão', () => {
  const now = Date.parse('2026-07-16T12:00:00.000Z');
  const c = normalizeCycle(
    { state: 'day', expiry: '2026-07-16T13:00:00.000Z' },
    def('cetus'), now
  );
  assert.equal(c.id, 'cetus');
  assert.equal(c.state, 'day');
  assert.equal(c.expiry, '2026-07-16T13:00:00.000Z');
  assert.equal(c.predicted, false);
});

test('advanceCycle: cetus dia vencido vira noite (+50 min)', () => {
  const expiry = Date.parse('2026-07-16T12:00:00.000Z');
  const now = expiry + 1000; // 1s depois de vencer
  const adv = advanceCycle(def('cetus'), 'day', expiry, now);
  assert.equal(adv.state, 'night');
  assert.equal(adv.expiryMs, expiry + 50 * MIN);
  assert.equal(adv.predicted, true);
});

test('advanceCycle: avança vários passos e mantém a paridade (cetus, ~5h velho)', () => {
  const expiry = Date.parse('2026-07-16T00:00:00.000Z'); // fim de um dia
  // 299 min depois: noite(0–50) → dia(50–150) → noite(150–200) → dia(200–300)
  const now = expiry + 299 * MIN;
  const adv = advanceCycle(def('cetus'), 'day', expiry, now);
  assert.equal(adv.state, 'day');
  assert.equal(adv.expiryMs, expiry + 300 * MIN);
  assert.ok(adv.expiryMs > now);
});

test('advanceCycle: Duviri roda os 5 humores na ordem e dá a volta', () => {
  const d = def('duviri');
  const expiry = 0;
  // fear venceu → volta para joy
  const wrap = advanceCycle(d, 'fear', expiry, 1);
  assert.equal(wrap.state, 'joy');
  // 7h depois do fim de joy: anger(0–2h) → envy(2–4h) → sorrow(4–6h) → fear(6–8h)
  const later = advanceCycle(d, 'joy', expiry, 7 * 60 * MIN);
  assert.equal(later.state, 'fear');
  assert.equal(later.expiryMs, 8 * 60 * MIN);
});

test('advanceCycle: vallis frio vencido vira quente (+6m40s)', () => {
  const adv = advanceCycle(def('vallis'), 'cold', 0, 1);
  assert.equal(adv.state, 'warm');
  assert.equal(adv.expiryMs, 400e3);
});

test('advanceCycle: estado desconhecido não avança (devolve como veio)', () => {
  const adv = advanceCycle(def('cetus'), 'eclipse', 0, 999);
  assert.equal(adv.state, 'eclipse');
  assert.equal(adv.expiryMs, 0);
  assert.equal(adv.predicted, false);
});

test('normalizeCycle: lixo da API vira null (não derruba a rota)', () => {
  const d = def('earth');
  assert.equal(normalizeCycle(null, d, 0), null);
  assert.equal(normalizeCycle('texto', d, 0), null);
  assert.equal(normalizeCycle({ state: 'day' }, d, 0), null); // sem expiry
  assert.equal(normalizeCycle({ state: 'day', expiry: 'não-é-data' }, d, 0), null);
  assert.equal(normalizeCycle({ expiry: '2026-07-16T12:00:00.000Z' }, d, 0), null); // sem estado
});

test('normalizeCycle: estado vem em minúsculas mesmo se a API mudar a caixa', () => {
  const now = Date.parse('2026-07-16T12:00:00.000Z');
  const c = normalizeCycle(
    { state: 'FASS', expiry: '2026-07-16T13:00:00.000Z' },
    def('cambion'), now
  );
  assert.equal(c.state, 'fass');
});

test('normalizeCycle: expiry vencido já sai avançado e no futuro', () => {
  const now = Date.parse('2026-07-16T12:00:30.000Z');
  const c = normalizeCycle(
    { state: 'grineer', expiry: '2026-07-16T12:00:00.000Z' },
    def('zariman'), now
  );
  assert.equal(c.state, 'corpus');
  assert.equal(c.predicted, true);
  assert.ok(Date.parse(c.expiry) > now);
});
