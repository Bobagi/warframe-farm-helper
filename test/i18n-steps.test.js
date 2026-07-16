'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fmtBuildTime, fmtPct, rarityLabel, buildSteps } = require('../server/itemview');

test('fmtBuildTime respeita o idioma', () => {
  assert.equal(fmtBuildTime(259200, 'pt'), '3 dias');
  assert.equal(fmtBuildTime(259200, 'en'), '3 days');
  assert.equal(fmtBuildTime(43200, 'pt'), '12 h'); // horas iguais nos dois
  assert.equal(fmtBuildTime(43200, 'en'), '12 h');
  assert.equal(fmtBuildTime(0, 'en'), null);
});

test('fmtPct usa vírgula em PT e ponto em EN', () => {
  assert.equal(fmtPct(16.67, 'pt'), '16,67%');
  assert.equal(fmtPct(16.67, 'en'), '16.67%');
  assert.equal(fmtPct(null, 'en'), null);
});

test('rarityLabel traduz só em PT', () => {
  assert.equal(rarityLabel('Uncommon', 'pt'), 'Incomum');
  assert.equal(rarityLabel('Uncommon', 'en'), 'Uncommon');
  assert.equal(rarityLabel('Rare', 'pt'), 'Rara');
});

function bratonLikeComp() {
  return [{
    fullName: 'Foo Prime Stock',
    relics: [{
      relic: 'Lith K1', tier: 'Lith', vaulted: false, rarity: 'Uncommon',
      chanceIntact: 25.33, chanceRadiant: 16.67, relicDrops: [{ location: 'Earth/Cetus', chance: 18.45 }],
    }],
    otherSources: [],
  }];
}

test('buildSteps gera texto em português', () => {
  const raw = { masteryReq: 8, buildPrice: 15000, buildTime: 43200, skipBuildTimePrice: 50 };
  const steps = buildSteps(raw, bratonLikeComp(), { relics: [], other: [] }, 'pt').join(' ');
  assert.match(steps, /Requisito: Maestria \(MR\) 8/);
  assert.match(steps, /farme a relíquia Lith K1/);
  assert.match(steps, /Incomum/);
  assert.match(steps, /16,67% radiante/);
  assert.match(steps, /créditos/);
  assert.doesNotMatch(steps, /farm the|credits|radiant\b/);
});

test('buildSteps gera texto em inglês', () => {
  const raw = { masteryReq: 8, buildPrice: 15000, buildTime: 43200, skipBuildTimePrice: 50 };
  const steps = buildSteps(raw, bratonLikeComp(), { relics: [], other: [] }, 'en').join(' ');
  assert.match(steps, /Requirement: Mastery Rank \(MR\) 8/);
  assert.match(steps, /farm the Lith K1 relic/);
  assert.match(steps, /Uncommon/);
  assert.match(steps, /16\.67% radiant/);
  assert.match(steps, /credits/);
  assert.doesNotMatch(steps, /farme a|créditos|radiante/);
});

test('buildSteps: componente com todas as relíquias vaulted orienta trade/Resurgence', () => {
  const comps = [{ fullName: 'Foo Prime Blade', relics: [{ vaulted: true }], otherSources: [] }];
  const pt = buildSteps({}, comps, { relics: [], other: [] }, 'pt').join(' ');
  const en = buildSteps({}, comps, { relics: [], other: [] }, 'en').join(' ');
  assert.match(pt, /vaulted/);
  assert.match(pt, /Prime Resurgence|Varzia/);
  assert.match(en, /vaulted/);
  assert.match(en, /Prime Resurgence|Varzia/);
});
