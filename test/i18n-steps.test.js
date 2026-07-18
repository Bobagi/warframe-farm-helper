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

// es/ru não têm redação própria no servidor: devem cair no INGLÊS (fallback
// internacional), NUNCA no português. Antes, o ternário `=== 'en'` jogava
// qualquer idioma ≠ en no ramo PT — es/ru vazavam português.
test('es/ru caem no inglês, nunca no português (sem vazamento PT)', () => {
  for (const lang of ['es', 'ru', 'de', 'fr']) {
    assert.equal(fmtBuildTime(259200, lang), '3 days', `${lang} deveria usar 'days'`);
    assert.equal(rarityLabel('Uncommon', lang), 'Uncommon', `${lang} deveria manter 'Uncommon'`);
    assert.equal(fmtPct(16.67, lang), '16.67%', `${lang} deveria usar ponto decimal`);
  }
  const raw = { masteryReq: 8, buildPrice: 15000, buildTime: 43200, skipBuildTimePrice: 50 };
  const es = buildSteps(raw, bratonLikeComp(), { relics: [], other: [] }, 'es').join(' ');
  assert.match(es, /Requirement: Mastery Rank \(MR\) 8/);
  assert.match(es, /farm the Lith K1 relic/);
  assert.doesNotMatch(es, /farme a|créditos|radiante|Incomum/); // zero português
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
