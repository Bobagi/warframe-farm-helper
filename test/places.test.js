'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { placePt } = require('../public/js/places');
const { rewardPt } = require('../server/itemview');

test('placePt: traduz planeta, tipo e rotação, mantendo o nome do nó', () => {
  assert.equal(placePt('Eris/Zabala (Survival), Rotation C'), 'Eris/Zabala (Sobrevivência), Rotação C');
  assert.equal(placePt('Mars/Olympus (Disruption), Rotation C'), 'Marte/Olympus (Disrupção), Rotação C');
  assert.equal(placePt('Pluto/Fenton\'s Field (Caches), Rotation B'), 'Plutão/Fenton\'s Field (Baús), Rotação B');
});

test('placePt: regiões abertas compostas e "Level ... Bounty"', () => {
  assert.equal(
    placePt('Venus/Orb Vallis (Level 40 - 60 Orb Vallis Bounty), Rotation A'),
    'Vênus/Vale dos Orbes (Nível 40 - 60 Vale dos Orbes Contrato), Rotação A'
  );
  assert.equal(placePt('Earth/Cetus (Level 15 - 25 Ghoul Bounty)'), 'Terra/Cetus (Nível 15 - 25 Contrato Ghoul)');
});

test('placePt: "Mobile Defense" antes de "Defense" (ordem multi-palavra)', () => {
  assert.equal(placePt('Ceres/Gabii (Mobile Defense)'), 'Ceres/Gabii (Defesa Móvel)');
  assert.equal(placePt('Sedna/Berehynia (Interception)'), 'Sedna/Berehynia (Interceptação)');
});

test('placePt: fissura formato "Nó (Planeta)"', () => {
  assert.equal(placePt('Eurasia (Earth)'), 'Eurasia (Terra)');
  assert.equal(placePt('Tharsis (Mars)'), 'Tharsis (Marte)');
});

test('placePt: nome próprio sem termo traduzível fica intacto', () => {
  assert.equal(placePt('Corrupted Vor'), 'Corrupted Vor');
  assert.equal(placePt(''), '');
  assert.equal(placePt(null), '');
});

test('rewardPt: sufixo vira prefixo na ordem certa; item conhecido → name_pt', () => {
  const lookup = (nm) => (nm === 'Orvius' ? 'Orvius PT' : null);
  assert.equal(rewardPt('Orvius Blueprint', lookup), 'Orvius PT (Projeto)');
  assert.equal(rewardPt('Orvius', lookup), 'Orvius PT');
});

test('rewardPt: padrões de cosmético/acesso/desbloqueio (ordem PT)', () => {
  const none = () => null;
  assert.equal(rewardPt('Transference Unlocked', none), 'Transference desbloqueado');
  assert.equal(rewardPt('The Quills Access', none), 'Acesso: The Quills');
  assert.equal(rewardPt('Alone Portrait', none), 'Retrato: Alone');
  assert.equal(rewardPt("Stalker's Lair Scene", none), "Cena: Stalker's Lair");
  assert.equal(rewardPt('Broken Scepter', none), 'Broken Scepter'); // nome próprio, sem sufixo
});
