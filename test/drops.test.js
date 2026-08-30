'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { summarize } = require('../server/drops');
const { wikiUrlFor } = require('../server/itemview');
const { bountyHubFor } = require('../server/bountyHubs');

test('summarize: casa o item exato e a variante "2X", dedup por local (maior chance)', () => {
  const arr = [
    { place: 'Corrupted Vor', item: 'Orokin Cell', chance: 50, rarity: 'Common' },
    { place: 'Ceres/Gabii', item: 'Orokin Cell', chance: 10, rarity: 'Uncommon' },
    { place: 'Ceres/Gabii', item: '2X Orokin Cell', chance: 22, rarity: 'Rare' }, // mesmo local, chance maior vence
    { place: 'Jupiter/Io', item: 'Orokin Cell Blueprint', chance: 99 },           // item DIFERENTE → ignora
    { place: 'Nowhere', item: 'Something Else', chance: 80 },                      // outro item → ignora
  ];
  const out = summarize(arr, 'Orokin Cell');
  assert.deepEqual(out, [
    // boss/inimigo ganha `wiki`; nó de missão (tem "/") fica sem; nenhum dos
    // dois é Bounty nem missão de baús → `bounty`/`cache` ficam null/false
    { location: 'Corrupted Vor', chance: 50, rarity: 'Common', wiki: 'https://wiki.warframe.com/index.php?search=Corrupted%20Vor', bounty: null, cache: false },
    { location: 'Ceres/Gabii', chance: 22, rarity: 'Rare', wiki: null, bounty: null, cache: false },
  ]);
});

test('summarize: ordena por chance desc e corta em 30 locais', () => {
  // 40 locais distintos, bem acima do cap - antes disto o cap era 8 e cortava
  // dados reais (Orokin Cell tem 96 locais na API; só 8 chegavam na página)
  const arr = Array.from({ length: 40 }, (_, i) => ({ place: `P${i}`, item: 'Morphics', chance: i }));
  const out = summarize(arr, 'Morphics');
  assert.equal(out.length, 30);
  assert.equal(out[0].location, 'P39'); // maior chance primeiro
  assert.ok(out[0].chance >= out[29].chance);
});

test('summarize: junta as rotações A/B/C do mesmo bounty num local só', () => {
  const arr = [
    { place: 'Venus/Orb Vallis (Level 40 - 60 Orb Vallis Bounty), Rotation A', item: 'Orokin Cell', chance: 33.33 },
    { place: 'Venus/Orb Vallis (Level 40 - 60 Orb Vallis Bounty), Rotation B', item: 'Orokin Cell', chance: 33.33 },
    { place: 'Venus/Orb Vallis (Level 40 - 60 Orb Vallis Bounty), Rotation C', item: 'Orokin Cell', chance: 20 },
  ];
  const out = summarize(arr, 'Orokin Cell');
  assert.equal(out.length, 1, 'as 3 rotações viram 1 local');
  assert.equal(out[0].location, 'Venus/Orb Vallis (Level 40 - 60 Orb Vallis Bounty)');
  assert.equal(out[0].chance, 33.33, 'mantém a maior chance entre as rotações');
  assert.deepEqual(out[0].bounty, { hub: 'Fortuna', npc: 'Eudico' },
    'Orb Vallis Bounty aponta pro hub/NPC certo mesmo depois de juntar as rotações');
});

test('summarize: entrada inválida vira lista vazia (não quebra a página)', () => {
  assert.deepEqual(summarize(null, 'X'), []);
  assert.deepEqual(summarize('nope', 'X'), []);
  assert.deepEqual(summarize([{ place: '', item: 'X', chance: 5 }], 'X'), []); // sem local
});

test('summarize: não casa por substring (só o item inteiro, evita falso positivo)', () => {
  // "Orokin Cell" NÃO deve casar "Orokin Cell Fragment" nem "Blue Orokin Cell-ish"
  const arr = [
    { place: 'A', item: 'Orokin Cell Fragment', chance: 30 },
    { place: 'B', item: 'Orokin Cell', chance: 10 },
  ];
  assert.deepEqual(summarize(arr, 'Orokin Cell'),
    [{ location: 'B', chance: 10, rarity: undefined, wiki: null, bounty: null, cache: false }]);
});

test('wikiUrlFor: nome → URL da wiki (espaços viram _)', () => {
  assert.equal(wikiUrlFor('Jade Shadows'), 'https://wiki.warframe.com/w/Jade_Shadows');
  assert.equal(wikiUrlFor('Orokin Cell'), 'https://wiki.warframe.com/w/Orokin_Cell');
});

test('wikiUrlFor: apóstrofo é seguro na URL; vazio/nulo → null', () => {
  // encodeURIComponent não escapa "'" (a wiki aceita apóstrofo literal no título)
  assert.equal(wikiUrlFor("Baro Ki'Teer"), "https://wiki.warframe.com/w/Baro_Ki'Teer");
  assert.equal(wikiUrlFor(''), null);
  assert.equal(wikiUrlFor(null), null);
});
