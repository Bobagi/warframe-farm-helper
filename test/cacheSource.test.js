'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isCacheSource } = require('../server/cacheSource');

test('isCacheSource reconhece missão de baús (Caches) no local cru em inglês', () => {
  assert.equal(isCacheSource('Eris/Naeglar (Caches), Rotation B'), true);
  assert.equal(isCacheSource('Lua/Plato (Caches), Rotation A'), true);
  assert.equal(isCacheSource('Hallowed Flame Mission Caches, Rotation B'), true);
});

test('isCacheSource devolve false para local que não é missão de baús', () => {
  assert.equal(isCacheSource('Venus/Orb Vallis (Level 20 - 40 Orb Vallis Bounty), Rotation B'), false);
  assert.equal(isCacheSource('Corrupted Vor'), false);
  assert.equal(isCacheSource('Uranus/Titania (Assassination)'), false);
  assert.equal(isCacheSource(''), false);
  assert.equal(isCacheSource(null), false);
});

test('isCacheSource roda ANTES da tradução - "Baús" (pt) não casa', () => {
  // placeIn troca "Caches" por "Baús"; se isCacheSource rodasse depois da
  // tradução, a tag sumiria pra pt/zh - por isso ela é calculada em
  // classifyDrops/summarize, sobre o local cru, e sobrevive ao spread
  assert.equal(isCacheSource('Eris/Naeglar (Baús), Rotação B'), false);
});
