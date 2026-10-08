'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Fissuras vêm do worldstate OFICIAL da DE desde 2026-10-08 (o espelho do
// warframestat seguia ~1h atrasado). O JSON da DE só tem ids crus; os nomes
// saem das tabelas do WFCD e precisam chegar ao front no MESMO formato do
// warframestat, senão o i18n do cliente (missionType/enemy) quebra.
const { parseDeFissures } = require('../server/worldstate');

const MAPS = {
  nodes: {
    SolNode17: { value: 'Proteus (Neptune)', enemy: 'Corpus', type: 'Defense' },
    SettlementNode15: { value: 'Sharpless (Phobos)', enemy: 'Corpus', type: 'Mobile Defense' },
    CrewBattleNode529: { value: 'Profit Margin (Pluto)', enemy: 'Corpus', type: 'Volatile' },
  },
  missionTypes: { MT_DEFENSE: { value: 'Defense' }, MT_MOBILE_DEFENSE: { value: 'Mobile Defense' } },
};
const date = (ms) => ({ $date: { $numberLong: String(ms) } });

test('parseDeFissures: missão, Steel Path e tempestade no formato do warframestat', () => {
  const ws = {
    ActiveMissions: [
      { _id: { $oid: 'a1' }, Activation: date(1791471542730), Expiry: date(1791477892387),
        Node: 'SolNode17', MissionType: 'MT_DEFENSE', Modifier: 'VoidT3' },
      { _id: { $oid: 'a2' }, Activation: date(1791471542730), Expiry: date(1791477125281),
        Node: 'SettlementNode15', MissionType: 'MT_MOBILE_DEFENSE', Modifier: 'VoidT6', Hard: true },
    ],
    VoidStorms: [
      { _id: { $oid: 's1' }, Node: 'CrewBattleNode529', Activation: date(1791472803358),
        Expiry: date(1791478203358), ActiveMissionTier: 'VoidT4' },
    ],
  };
  const out = parseDeFissures(ws, MAPS);
  assert.deepEqual(out[0], {
    id: 'a1', node: 'Proteus (Neptune)', missionType: 'Defense', tier: 'Neo', tierNum: 3, enemy: 'Corpus',
    activation: '2026-10-08T14:59:02.730Z', expiry: '2026-10-08T16:44:52.387Z', isStorm: false, isHard: false,
  });
  assert.equal(out[1].tier, 'Omnia');
  assert.equal(out[1].tierNum, 6);
  assert.equal(out[1].isHard, true);
  assert.equal(out[2].isStorm, true);
  assert.equal(out[2].isHard, false);
  assert.equal(out[2].missionType, 'Volatile', 'tempestade pega o tipo pela tabela de nós');
  assert.equal(out[2].tier, 'Axi');
});

test('parseDeFissures: nó desconhecido, tier estranho e lixo ficam de fora', () => {
  const out = parseDeFissures({
    ActiveMissions: [
      { Node: 'SolNode999', Modifier: 'VoidT1', Expiry: date(1) },
      { Node: 'SolNode17', Modifier: 'VoidT9', Expiry: date(1) },
      null,
      'x',
    ],
    VoidStorms: 'nada',
  }, MAPS);
  assert.deepEqual(out, []);
  assert.deepEqual(parseDeFissures(null, MAPS), []);
  assert.deepEqual(parseDeFissures([], MAPS), []);
});

test('parseDeFissures: teto de quantidade no dado de terceiro', () => {
  const many = Array.from({ length: 5000 }, (_, i) => ({
    _id: { $oid: `m${i}` }, Node: 'SolNode17', MissionType: 'MT_DEFENSE', Modifier: 'VoidT1', Expiry: date(1),
  }));
  assert.equal(parseDeFissures({ ActiveMissions: many }, MAPS).length, 200);
});

test('getFissures: usa a DE quando ela responde, e cai no warframestat quando ela falha', async () => {
  const realFetch = globalThis.fetch;
  const future = Date.now() + 3600e3;
  let deUp = true;
  const urls = [];
  const mock = async (url) => {
    urls.push(String(url));
    const json = (body) => ({ ok: true, json: async () => body });
    if (String(url).includes('worldState.php')) {
      return deUp
        ? json({ ActiveMissions: [{ _id: { $oid: 'de' }, Node: 'SolNode17', MissionType: 'MT_DEFENSE',
          Modifier: 'VoidT1', Activation: date(Date.now()), Expiry: date(future) }] })
        : { ok: false, status: 503 };
    }
    if (String(url).endsWith('/solNodes.json')) return json(MAPS.nodes);
    if (String(url).endsWith('/missionTypes.json')) return json(MAPS.missionTypes);
    if (String(url).endsWith('/fissures')) {
      return json([{ id: 'wfs', node: 'Hellas (Mars)', missionType: 'Extermination', tier: 'Lith', tierNum: 1,
        enemy: 'Grineer', expiry: new Date(future).toISOString() }]);
    }
    return { ok: false, status: 404 };
  };
  globalThis.fetch = mock;
  try {
    const { getFissures, fissuresSource } = require('../server/worldstate');
    const viaDe = await getFissures();
    assert.deepEqual(viaDe.map((f) => f.id), ['de']);
    assert.equal(viaDe[0].node, 'Proteus (Neptune)');
    assert.equal(fissuresSource(), 'ok');
    assert.ok(!urls.some((u) => u.endsWith('/fissures')), 'com a DE no ar o espelho nem é consultado');
  } finally {
    globalThis.fetch = realFetch;
  }
  // DE fora com cache frio: módulo novo, espelho assume
  delete require.cache[require.resolve('../server/worldstate')];
  deUp = false;
  globalThis.fetch = mock;
  try {
    const { getFissures } = require('../server/worldstate');
    assert.deepEqual((await getFissures()).map((f) => f.id), ['wfs']);
  } finally {
    globalThis.fetch = realFetch;
  }
});
