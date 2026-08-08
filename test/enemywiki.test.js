'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { enemyWikiUrl } = require('../server/enemywiki');

const SEARCH = 'https://wiki.warframe.com/index.php?search=';

test('enemyWikiUrl: inimigo/boss/NPC puro vira link de busca da wiki', () => {
  assert.equal(enemyWikiUrl('Tyl Regor'), `${SEARCH}Tyl%20Regor`);
  assert.equal(enemyWikiUrl('Kuva Larvling'), `${SEARCH}Kuva%20Larvling`);
  assert.equal(enemyWikiUrl('Corrupted Vor'), `${SEARCH}Corrupted%20Vor`);
  assert.equal(enemyWikiUrl('Cephalon Simaris'), `${SEARCH}Cephalon%20Simaris`);
  assert.equal(enemyWikiUrl('Exploiter Orb'), `${SEARCH}Exploiter%20Orb`);
  // apóstrofo e hífen dentro do nome são legítimos
  assert.equal(enemyWikiUrl("Jack O'Naut"), `${SEARCH}Jack%20O'Naut`);
  assert.equal(enemyWikiUrl('Verd-Ie'), `${SEARCH}Verd-Ie`);
  assert.equal(enemyWikiUrl('002-Er'), `${SEARCH}002-Er`);
});

test('enemyWikiUrl: sufixo parentético (nível/modo/captura) sai do alvo do link', () => {
  assert.equal(enemyWikiUrl('Elite Exo Gokstad Crewship (Level 51 - 100)'),
    `${SEARCH}Elite%20Exo%20Gokstad%20Crewship`);
  assert.equal(enemyWikiUrl('Eidolon Teralyst (Capture)'), `${SEARCH}Eidolon%20Teralyst`);
  assert.equal(enemyWikiUrl('Necramech (Tier 3)'), `${SEARCH}Necramech`);
  assert.equal(enemyWikiUrl('Sister Of Parvos (Ascension Mode Steel Path)'),
    `${SEARCH}Sister%20Of%20Parvos`);
});

test('enemyWikiUrl: nó de missão, rotação e oferta de sindicato NÃO viram link', () => {
  assert.equal(enemyWikiUrl('Ceres/Seimeni (Defense), Rotation B'), null); // nó com rotação
  assert.equal(enemyWikiUrl('Earth/Cetus (Level 5 - 15 Cetus Bounty), Rotation A'), null);
  assert.equal(enemyWikiUrl('Mars/Ara (Capture)'), null); // nó simples
  assert.equal(enemyWikiUrl('Steel Meridian, General'), null); // sindicato, rank
  assert.equal(enemyWikiUrl('Conclave, Mistral'), null);
  assert.equal(enemyWikiUrl('Hot Mess, Rotation B'), null); // corrida de Kaithe
  assert.equal(enemyWikiUrl('Duviri/Endless: Tier 1 (Normal)'), null); // modo com ":"
  assert.equal(enemyWikiUrl('Operation: Orphix Venom, Rotation A'), null);
});

test('enemyWikiUrl: modos/eventos/baldes de recompensa sem separador também ficam de fora', () => {
  assert.equal(enemyWikiUrl('Sorties'), null);
  assert.equal(enemyWikiUrl('Vanguard C1 Relic (Radiant)'), null); // tipo novo de relíquia
  assert.equal(enemyWikiUrl('Deep Archimedea Gold Rewards'), null);
  assert.equal(enemyWikiUrl('Temporal Archimedea Legendary Rewards'), null);
  assert.equal(enemyWikiUrl('Void Storm (Earth)'), null);
  assert.equal(enemyWikiUrl('Void Fissure Corrupted Enemy'), null);
  assert.equal(enemyWikiUrl('Eximus Enemy (Steel Path)'), null);
  assert.equal(enemyWikiUrl('Orb Vallis - Spaceport Enemies'), null);
  assert.equal(enemyWikiUrl('Duviri Circuit'), null);
  assert.equal(enemyWikiUrl('Duviri Full Experience'), null);
  assert.equal(enemyWikiUrl('Fomorian Sabotage'), null);
});

test('enemyWikiUrl: entrada vazia/curta/nula → null (nunca quebra)', () => {
  assert.equal(enemyWikiUrl(''), null);
  assert.equal(enemyWikiUrl(null), null);
  assert.equal(enemyWikiUrl(undefined), null);
  assert.equal(enemyWikiUrl('Ab'), null); // curto demais para ser nome confiável
  assert.equal(enemyWikiUrl('   '), null);
});

test('enemyWikiUrl: o esquema do link é sempre o nosso https fixo (dado externo só no query)', () => {
  // mesmo um "nome" malicioso não muda o esquema/host - vira query encodada
  const evil = enemyWikiUrl('javascript alert(1)');
  assert.ok(evil.startsWith(SEARCH), 'host/esquema fixos');
  assert.ok(!evil.includes('('), 'parêntese final tratado como sufixo ou encodado');
  const weird = enemyWikiUrl('Foo&bar=baz#frag');
  assert.equal(weird, `${SEARCH}Foo%26bar%3Dbaz%23frag`, 'caracteres de URL são encodados');
});
