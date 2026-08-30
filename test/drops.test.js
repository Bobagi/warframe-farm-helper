'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { summarize, parseQty, expandRot } = require('../server/drops');
const { wikiUrlFor } = require('../server/itemview');
const { bountyHubFor } = require('../server/bountyHubs');

test('parseQty: extrai a quantidade do prefixo "NX "; sem prefixo é 1', () => {
  assert.equal(parseQty('750X Circuits'), 750);
  assert.equal(parseQty('2X Orokin Cell'), 2);
  assert.equal(parseQty('Orokin Cell'), 1);
  assert.equal(parseQty(''), 1);
  assert.equal(parseQty(null), 1);
});

test('summarize: casa o item exato e a variante "2X" (qty=2), dedup por local (maior VALOR ESPERADO)', () => {
  const arr = [
    { place: 'Corrupted Vor', item: 'Orokin Cell', chance: 50, rarity: 'Common' },
    { place: 'Ceres/Gabii', item: 'Orokin Cell', chance: 10, rarity: 'Uncommon' },
    { place: 'Ceres/Gabii', item: '2X Orokin Cell', chance: 22, rarity: 'Rare' }, // mesmo local, EV maior vence (22%×2 > 10%×1)
    { place: 'Jupiter/Io', item: 'Orokin Cell Blueprint', chance: 99 },           // item DIFERENTE → ignora
    { place: 'Nowhere', item: 'Something Else', chance: 80 },                      // outro item → ignora
  ];
  const out = summarize(arr, 'Orokin Cell');
  assert.deepEqual(out, [
    // boss/inimigo ganha `wiki`; nó de missão (tem "/") fica sem; nenhum dos
    // dois é Bounty nem missão de baús → `bounty`/`cache` ficam null/false;
    // sem prefixo "NX " no nome, qty=1 e ev=chance/100
    { location: 'Corrupted Vor', chance: 50, qty: 1, ev: 0.5, rarity: 'Common', wiki: 'https://wiki.warframe.com/index.php?search=Corrupted%20Vor', bounty: null, cache: false },
    { location: 'Ceres/Gabii', chance: 22, qty: 2, ev: 0.44, rarity: 'Rare', wiki: null, bounty: null, cache: false },
  ]);
});

test('summarize: ordena por VALOR ESPERADO (chance × qty) desc e corta em 30 locais', () => {
  // 40 locais distintos, bem acima do cap - antes disto o cap era 8 e cortava
  // dados reais (Orokin Cell tem 96 locais na API; só 8 chegavam na página)
  const arr = Array.from({ length: 40 }, (_, i) => ({ place: `P${i}`, item: 'Morphics', chance: i }));
  const out = summarize(arr, 'Morphics');
  assert.equal(out.length, 30);
  assert.equal(out[0].location, 'P39'); // maior chance primeiro (qty=1 em todos, ev = chance)
  assert.ok(out[0].ev >= out[29].ev);
});

test('expandRot: normaliza a abreviação "Rot X" da API para "Rotation X" (o que placeIn traduz)', () => {
  assert.equal(expandRot('Venus/Orb Vallis (Level 20 - 40 Orb Vallis Bounty), Rot B'),
    'Venus/Orb Vallis (Level 20 - 40 Orb Vallis Bounty), Rotation B');
  assert.equal(expandRot('Venus/Ishtar (Caches), Rot B'), 'Venus/Ishtar (Caches), Rotation B');
  // já por extenso: não mexe (evita virar "Rotationation B")
  assert.equal(expandRot('Earth/Cetus (Level 5 - 15 Cetus Bounty), Rotation C'),
    'Earth/Cetus (Level 5 - 15 Cetus Bounty), Rotation C');
  // sem rotação no fim: não mexe
  assert.equal(expandRot('Corrupted Vor'), 'Corrupted Vor');
});

test('summarize: local de Contrato mantém a ROTAÇÃO (por extenso) no texto final; baú/nó comum não', () => {
  const arr = [
    { place: 'Venus/Orb Vallis (Level 20 - 40 Orb Vallis Bounty), Rot B', item: '300X Plastids', chance: 25 },
    { place: 'Eris/Naeglar (Caches), Rot B', item: '350X Plastids', chance: 15.49 },
  ];
  const out = summarize(arr, 'Plastids');
  const bounty = out.find((d) => d.bounty);
  const cache = out.find((d) => d.cache);
  assert.equal(bounty.location, 'Venus/Orb Vallis (Level 20 - 40 Orb Vallis Bounty), Rotation B',
    'rotação é acionável numa Bounty - fica, e por extenso');
  assert.equal(cache.location, 'Eris/Naeglar (Caches)',
    'rotação não muda nada numa missão de baús - some, igual antes');
});

test('summarize: local com QUANTIDADE maior vence mesmo com % menor (caso real: Circuits em Ishtar)', () => {
  // caso que motivou isto: um usuário farmou Circuitos em Ishtar/Vênus - a
  // wiki lista esse local PRIMEIRO porque rende 750 por baú (94,875
  // esperado), batendo uma bounty de 25% que rende bem menos por conclusão
  const arr = [
    { place: 'Venus/Orb Vallis (Level 20 - 40 Orb Vallis Bounty), Rotation A', item: '100X Circuits', chance: 25 },
    { place: 'Venus/Ishtar (Caches), Rotation B', item: '750X Circuits', chance: 12.65 },
  ];
  const out = summarize(arr, 'Circuits');
  assert.equal(out[0].location, 'Venus/Ishtar (Caches)', '94,875 esperado (baú) > 25 esperado (bounty)');
  assert.equal(out[0].qty, 750);
  assert.equal(out[0].ev, 94.875);
});

test('summarize: junta as rotações A/B/C do mesmo bounty num só CANDIDATO (a de maior EV vence)', () => {
  const arr = [
    { place: 'Venus/Orb Vallis (Level 40 - 60 Orb Vallis Bounty), Rotation A', item: 'Orokin Cell', chance: 33.33 },
    { place: 'Venus/Orb Vallis (Level 40 - 60 Orb Vallis Bounty), Rotation B', item: 'Orokin Cell', chance: 33.33 },
    { place: 'Venus/Orb Vallis (Level 40 - 60 Orb Vallis Bounty), Rotation C', item: 'Orokin Cell', chance: 20 },
  ];
  const out = summarize(arr, 'Orokin Cell');
  assert.equal(out.length, 1, 'as 3 rotações concorrem por UM slot (dedup por local-base)');
  // Bounty mantém a ROTAÇÃO no texto final (é acionável: "vá até a Rotação X")
  // - só o nó/baú (sem hub de Contrato) tem a rotação removida do texto
  assert.equal(out[0].location, 'Venus/Orb Vallis (Level 40 - 60 Orb Vallis Bounty), Rotation A',
    'rotação A vence o empate de EV com B (33.33% == 33.33%, primeira vista mantém)');
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
    [{ location: 'B', chance: 10, qty: 1, ev: 0.1, rarity: undefined, wiki: null, bounty: null, cache: false }]);
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
