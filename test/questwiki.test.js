'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseQuestInfobox, cleanLines } = require('../server/questwiki');

test('cleanLines: resolve links/templates e quebra por <br>', () => {
  const v = "{{WF|Jade}} Blueprint<br>Stalker's Lair [[Captura|Scene]]<br>Alone Portrait";
  assert.deepEqual(cleanLines(v), ['Jade Blueprint', "Stalker's Lair Scene", 'Alone Portrait']);
  assert.deepEqual(cleanLines('Completed [[The New War]]'), ['Completed The New War']);
  assert.deepEqual(cleanLines("'''bold''' and ''italic''"), ['bold and italic']);
});

test('parseQuestInfobox: extrai requisito, recompensa, prev/next (com param VAZIO no meio)', () => {
  // reproduz o layout real: `internalname =` vazio entre requirement e reward
  const wt = `{{QuestTopNav}}
{{QuestInfobox
|name          = Jade Shadows
|introduced    = {{ver|36}}
|type          = Main Quest
|requirement   = Completed [[The New War]]
|internalname  =
|reward        = {{WF|Jade}} Blueprint<br>Alone Portrait<br>(1st completion only)
|previousquest = [[The New War]]
|nextquest     = [[Jade Shadows: Constellations]]
|replayable    =
}}
Bla bla corpo do artigo.`;
  const qi = parseQuestInfobox(wt);
  assert.equal(qi.type, 'Main Quest');
  assert.deepEqual(qi.requirement, ['Completed The New War']);
  // o param vazio NÃO pode engolir o reward
  assert.deepEqual(qi.reward, ['Jade Blueprint', 'Alone Portrait']); // "(1st completion only)" filtrado
  assert.equal(qi.previousQuest, 'The New War');
  assert.equal(qi.nextQuest, 'Jade Shadows: Constellations');
});

test('parseQuestInfobox: requisito multi-item (<br>) e valor em nova linha', () => {
  const wt = `{{QuestInfobox
|type = Main Quest
|requirement =
Completed [[The Second Dream]]<br>[[Junction|Pluto Junction]]
|reward = {{Weapon|Broken Scepter}}<br>{{Weapon|Orvius}} Blueprint
|previousquest = [[The Second Dream]]
|nextquest = [[Rising Tide]]
}}`;
  const qi = parseQuestInfobox(wt);
  assert.deepEqual(qi.requirement, ['Completed The Second Dream', 'Pluto Junction']);
  assert.deepEqual(qi.reward, ['Broken Scepter', 'Orvius Blueprint']);
});

test('parseQuestInfobox: sem QuestInfobox → null', () => {
  assert.equal(parseQuestInfobox('página sem infobox nenhum'), null);
  assert.equal(parseQuestInfobox(''), null);
});

test('parseQuestInfobox: infobox só com campos vazios → null (cai no fallback)', () => {
  const wt = '{{QuestInfobox\n|name = X\n|requirement = \n|reward = \n}}';
  assert.equal(parseQuestInfobox(wt), null);
});
