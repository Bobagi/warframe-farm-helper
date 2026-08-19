'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSteps } = require('../server/itemview');
const { loadArticles } = require('../server/ingest');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ---- nomes de componente em PT (peça traduzida, "Bronco Prime Cano") ----

function comp(extra = {}) {
  return [{
    fullName: 'Foo Prime Stock',
    fullNamePt: 'Foo Prime Coronha',
    relics: [{
      relic: 'Lith K1', tier: 'Lith', vaulted: false, rarity: 'Uncommon',
      chanceIntact: 25.33, chanceRadiant: 16.67, relicDrops: [{ location: 'Earth/Cetus', chance: 18.45 }],
    }],
    otherSources: [],
    ...extra,
  }];
}

test('buildSteps em PT usa o nome traduzido da peça', () => {
  const raw = { masteryReq: 8, buildPrice: 15000, buildTime: 43200 };
  const steps = buildSteps(raw, comp(), { relics: [], other: [] }, 'pt').join(' ');
  assert.match(steps, /Foo Prime Coronha/);
  assert.doesNotMatch(steps, /Foo Prime Stock/);
});

test('buildSteps em EN mantém o nome canônico da peça', () => {
  const raw = { masteryReq: 8, buildPrice: 15000, buildTime: 43200 };
  const steps = buildSteps(raw, comp(), { relics: [], other: [] }, 'en').join(' ');
  assert.match(steps, /Foo Prime Stock/);
  assert.doesNotMatch(steps, /Coronha/);
});

test('buildSteps em PT sem tradução cai no nome canônico', () => {
  const raw = { masteryReq: 8 };
  const steps = buildSteps(raw, comp({ fullNamePt: null }), { relics: [], other: [] }, 'pt').join(' ');
  assert.match(steps, /Foo Prime Stock/);
});

// ---- política de privacidade materializável nos 5 idiomas ----

test('loadArticles traz a política de privacidade em pt/en/es/ru/zh', () => {
  const arts = loadArticles().filter((a) => a.kind === 'legal' && a.slug === 'politica-de-privacidade');
  const langs = arts.map((a) => a.lang).sort();
  assert.deepEqual(langs, ['en', 'es', 'pt', 'ru', 'zh']);
  for (const a of arts) {
    assert.ok(a.title.length > 3, `título vazio em ${a.lang}`);
    assert.match(a.html, /gustavoperin067@gmail\.com/);
    assert.match(a.html, /AdSense/);
  }
});

// ---- AdSense entra só sob consentimento; A-ads saiu por completo ----

test('ads.txt declara o publisher do AdSense', () => {
  assert.match(read('public/ads.txt'), /^google\.com, pub-5349785075769585, DIRECT, f08c47fec0942fa0$/m);
});

test('nenhum HTML carrega o adsbygoogle estaticamente (gate de consentimento)', () => {
  for (const f of fs.readdirSync(path.join(ROOT, 'public')).filter((f) => f.endsWith('.html'))) {
    assert.doesNotMatch(read(`public/${f}`), /adsbygoogle|googlesyndication/, f);
  }
});

test('A-ads foi removida de todo o código', () => {
  for (const dir of ['public/js', 'server']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.js'))) {
      assert.doesNotMatch(read(`${dir}/${f}`), /a-ads\.com|acceptable\.a-ads/i, `${dir}/${f}`);
    }
  }
});

test('CSP libera os hosts do AdSense', () => {
  const src = read('server/index.js');
  assert.match(src, /script-src 'self' https:\/\/pagead2\.googlesyndication\.com/);
  assert.match(src, /frame-src https:\/\/googleads\.g\.doubleclick\.net/);
});
