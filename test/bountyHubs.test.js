'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { bountyHubFor } = require('../server/bountyHubs');

test('bountyHubFor reconhece cada hub de Contrato de mundo aberto', () => {
  assert.deepEqual(
    bountyHubFor('Venus/Orb Vallis (Level 20 - 40 Orb Vallis Bounty), Rotation B'),
    { hub: 'Fortuna', npc: 'Eudico' });
  assert.deepEqual(
    bountyHubFor('Earth/Cetus (Level 10 - 30 Cetus Bounty), Rotation A'),
    { hub: 'Cetus', npc: 'Konzu' });
  assert.deepEqual(
    bountyHubFor('Earth/Cetus (Level 40 - 50 Ghoul Bounty), Rotation A'),
    { hub: 'Cetus', npc: 'Konzu' }, 'Ghoul Bounty também é oferecido por Konzu em Cetus');
  assert.deepEqual(
    bountyHubFor('Deimos/Cambion Drift (Level 15 - 25 Cambion Drift Bounty), Rotation C'),
    { hub: 'Necralisk', npc: 'Mother' });
  assert.deepEqual(
    bountyHubFor("Deimos/Albrecht's Laboratories (Level  55 - 60 Entrati Lab Bounty), Rotation C"),
    { hub: 'Sanctum Anatomica', npc: 'Fibonacci' });
  assert.deepEqual(
    bountyHubFor('Zariman Ten Zero (Level  50 - 55 Zariman Bounty), Rotation C'),
    { hub: 'Chrysalith', npc: 'Quinn' });
  assert.deepEqual(
    bountyHubFor('Höllvania (Level  55 - 60 WF1999 Bounty), Rotation C'),
    { hub: 'Höllvania Central Mall', npc: null }, 'sem NPC nomeado documentado - sai do quiosque');
  assert.deepEqual(
    bountyHubFor('Höllvania/Antivirus Bounty (Caches)'),
    { hub: 'Höllvania Central Mall', npc: null });
});

test('bountyHubFor devolve null para local que não é Contrato', () => {
  assert.equal(bountyHubFor('Uranus/Titania (Assassination)'), null);
  assert.equal(bountyHubFor('Corrupted Vor'), null);
  assert.equal(bountyHubFor('Steel Meridian, General'), null);
  assert.equal(bountyHubFor(''), null);
  assert.equal(bountyHubFor(null), null);
  assert.equal(bountyHubFor(undefined), null);
});
