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
// qualquer idioma ≠ en no ramo PT - es/ru vazavam português.
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

// caso do Plastids: item sem componentes, fonte é um Contrato de mundo aberto.
// Antes desta mudança o passo só citava o local cru da DE ("Venus/Orb Vallis
// (Level 20-40 Orb Vallis Bounty), Rotation B"), sem dizer que era preciso ir
// a Fortuna e falar com Eudico - regressão coberta aqui.
function orbVallisBountySource() {
  return {
    relics: [],
    other: [{
      location: 'Venus/Orb Vallis (Level 20 - 40 Orb Vallis Bounty), Rotation B',
      chance: 25, rarity: 'Uncommon', bounty: { hub: 'Fortuna', npc: 'Eudico' },
    }],
  };
}

test('buildSteps: "Melhor fonte" de Contrato explica hub e NPC (PT)', () => {
  const pt = buildSteps({}, [], orbVallisBountySource(), 'pt').join(' ');
  assert.match(pt, /Melhor fonte: Venus\/Orb Vallis .*\(25%\)\./);
  assert.match(pt, /vá a Fortuna e fale com Eudico/);
  assert.match(pt, /rotação indicada acima/);
});

test('buildSteps: "Melhor fonte" de Contrato explica hub e NPC (EN)', () => {
  const en = buildSteps({}, [], orbVallisBountySource(), 'en').join(' ');
  assert.match(en, /Best source: Venus\/Orb Vallis .*\(25%\)\./);
  assert.match(en, /head to Fortuna and talk to Eudico/);
  assert.doesNotMatch(en, /vá a|fale com/);
});

test('buildSteps: hub sem NPC nomeado (Höllvania) orienta o quiosque, não trava em "null"', () => {
  const src = {
    relics: [],
    other: [{
      location: 'Höllvania (Level 55 - 60 WF1999 Bounty), Rotation C',
      chance: 12, bounty: { hub: 'Höllvania Central Mall', npc: null },
    }],
  };
  const pt = buildSteps({}, [], src, 'pt').join(' ');
  assert.match(pt, /vá a Höllvania Central Mall e pegue um Contrato no quiosque/);
  assert.doesNotMatch(pt, /fale com null|\bnull\b/);
});

// caso real que motivou isto: Plastids tem Contrato de Vênus (25%, único
// sorteio, ~15-20 min de partida) E várias missões de baús (Eris/Naeglar
// entre elas, ~15%, VÁRIOS baús numa partida de poucos minutos) - um jogador
// farmou em Naeglar e reclamou que o site nem citava essa rota mais rápida.
function plastidsLikeSources() {
  return {
    relics: [],
    other: [
      { location: 'Venus/Orb Vallis (Level 20 - 40 Orb Vallis Bounty), Rotation B',
        chance: 25, rarity: 'Uncommon', bounty: { hub: 'Fortuna', npc: 'Eudico' }, cache: false },
      { location: 'Eris/Naeglar (Caches), Rotation B', chance: 15.49, rarity: 'Uncommon', bounty: null, cache: true },
    ],
  };
}

test('buildSteps: "Melhor fonte" Contrato cita a alternativa mais rápida de baús - como ITEM SEPARADO', () => {
  const pt = buildSteps({}, [], plastidsLikeSources(), 'pt');
  // pedido do usuário 2026-08-30: mission e mapa em <li> diferentes, não uma
  // frase só grudada na "Melhor fonte" - por isso checa o array, não o join
  assert.equal(pt.length, 2, 'a fonte principal e a alternativa são DOIS itens do passo a passo');
  // item 1 = tudo sobre a missão/Contrato (fonte + hub/NPC); item 2 = só o mapa/baús
  assert.match(pt[0], /^Melhor fonte: Venus\/Orb Vallis .*\(25%\)\. Para conseguir: vá a Fortuna e fale com Eudico/);
  assert.doesNotMatch(pt[0], /Alternativa/, 'item 1 não carrega a alternativa de mapa junto');
  assert.match(pt[1], /^Alternativa mais rápida: também dropa em Eris\/Naeglar .*\(15,49%\)/, 'item 2 (mapa/baús) começa a frase própria dele');
  assert.match(pt[1], /baús aparecem várias vezes/);

  const en = buildSteps({}, [], plastidsLikeSources(), 'en');
  assert.equal(en.length, 2);
  assert.match(en[1], /^Faster alternative: it also drops at Eris\/Naeglar .*\(15\.49%\)/);
  assert.doesNotMatch(en.join(' '), /Alternativa mais rápida|baús/);
});

test('buildSteps: "Melhor fonte" de baús cita o Contrato como alternativa de % maior - como ITEM SEPARADO', () => {
  const src = {
    relics: [],
    other: [
      { location: 'Eris/Naeglar (Caches), Rotation B', chance: 15.49, rarity: 'Uncommon', bounty: null, cache: true },
      { location: 'Venus/Orb Vallis (Level 20 - 40 Orb Vallis Bounty), Rotation B',
        chance: 25, rarity: 'Uncommon', bounty: { hub: 'Fortuna', npc: 'Eudico' }, cache: false },
    ],
  };
  const pt = buildSteps({}, [], src, 'pt');
  assert.equal(pt.length, 2);
  assert.match(pt[0], /^Melhor fonte: Eris\/Naeglar/);
  assert.match(pt[1], /^Alternativa com % maior: Venus\/Orb Vallis .*\(25%\).*vá a Fortuna e fale com Eudico/);
});

test('buildSteps: NÃO sugere alternativa quando ela é fraca demais (abaixo de 40% do top ou <10%)', () => {
  const fraca = {
    relics: [],
    other: [
      { location: 'Venus/Orb Vallis (Level 20 - 40 Orb Vallis Bounty), Rotation B',
        chance: 25, rarity: 'Uncommon', bounty: { hub: 'Fortuna', npc: 'Eudico' }, cache: false },
      { location: 'Eris/Naeglar (Caches), Rotation B', chance: 8, rarity: 'Uncommon', bounty: null, cache: true },
    ],
  };
  const pt = buildSteps({}, [], fraca, 'pt').join(' ');
  assert.doesNotMatch(pt, /Alternativa/, '8% é menos que 10% E menos que 40% de 25% - não vale a sugestão');
});

test('buildSteps: fonte que NÃO é Contrato não ganha a dica de hub/NPC', () => {
  const src = { relics: [], other: [{ location: 'Corrupted Vor', chance: 5, bounty: null }] };
  const pt = buildSteps({}, [], src, 'pt').join(' ');
  assert.match(pt, /Melhor fonte: Corrupted Vor \(5%\)\.$/);
  assert.doesNotMatch(pt, /Para conseguir|fale com/);
});

test('buildSteps: componente com fonte de Contrato também ganha a dica (dropa em)', () => {
  const comps = [{
    fullName: 'Foo Prime Neuroptics', relics: [],
    otherSources: [{
      location: 'Deimos/Cambion Drift (Level 15 - 25 Cambion Drift Bounty), Rotation A',
      chance: 8, rarity: 'Rare', bounty: { hub: 'Necralisk', npc: 'Mother' },
    }],
  }];
  const pt = buildSteps({}, comps, { relics: [], other: [] }, 'pt').join(' ');
  assert.match(pt, /dropa em Deimos\/Cambion Drift/);
  assert.match(pt, /vá a Necralisk e fale com Mother/);
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
