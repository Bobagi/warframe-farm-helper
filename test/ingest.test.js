'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { marked } = require('marked');
const { groupRelics, parseFrontmatter } = require('../server/ingest');

test('groupRelics agrupa refinamentos numa relíquia base', () => {
  const entries = [
    { name: 'Lith T1 Intact', vaulted: false, drops: [], rewards: [
      { rarity: 'Rare', chance: 2, item: { name: 'Coisa Prime Systems', uniqueName: '/x', warframeMarket: { urlName: 'coisa_prime_systems' } } },
    ] },
    { name: 'Lith T1 Exceptional', vaulted: false, drops: [], rewards: [] },
    { name: 'Lith T1 Flawless', vaulted: false, drops: [], rewards: [] },
    { name: 'Lith T1 Radiant', vaulted: false, drops: [], rewards: [
      { rarity: 'Rare', chance: 10, item: { name: 'Coisa Prime Systems', uniqueName: '/x' } },
    ] },
    { name: 'Axi Z9 Intact', vaulted: true, drops: [], rewards: [] },
  ];
  const out = groupRelics(entries);
  assert.equal(out.length, 2);
  const t1 = out.find((r) => r.name === 'Lith T1');
  assert.equal(t1.tier, 'Lith');
  assert.equal(t1.code, 'T1');
  assert.equal(t1.vaulted, false);
  assert.equal(t1.rewards.Intact[0].chance, 2);
  assert.equal(t1.rewards.Intact[0].marketSlug, 'coisa_prime_systems');
  assert.equal(t1.rewards.Radiant[0].chance, 10);
  const z9 = out.find((r) => r.name === 'Axi Z9');
  assert.equal(z9.vaulted, true);
});

test('groupRelics: vaulted é OR entre refinamentos (qualquer um vaulted ⇒ relíquia vaulted)', () => {
  const out = groupRelics([
    { name: 'Meso M9 Intact', vaulted: false, drops: [], rewards: [] },
    { name: 'Meso M9 Radiant', vaulted: true, drops: [], rewards: [] },
  ]);
  assert.equal(out[0].vaulted, true);
});

test('groupRelics deduplica drops idênticos e ordena por chance', () => {
  const out = groupRelics([
    { name: 'Neo N1 Intact', vaulted: false, rewards: [], drops: [
      { location: 'Void/Ukko', chance: 10, rarity: 'Common' },
      { location: 'Void/Ukko', chance: 10, rarity: 'Common' }, // duplicado exato
      { location: 'Ceres/Kiste', chance: 25, rarity: 'Common' },
    ] },
  ]);
  assert.equal(out[0].drops.length, 2);
  assert.equal(out[0].drops[0].location, 'Ceres/Kiste'); // maior chance primeiro
});

test('groupRelics ignora entradas sem sufixo de refinamento', () => {
  const out = groupRelics([{ name: 'Requiem I', vaulted: false, drops: [], rewards: [] }]);
  assert.equal(out.length, 0);
});

test('parseFrontmatter extrai atributos e corpo', () => {
  const src = '---\ntitle: Meu título\nkeywords: a, b\nmatch: [["crewship","artillery"]]\norder: 12\n---\n\nCorpo **aqui**.\n';
  const { attrs, body } = parseFrontmatter(src);
  assert.equal(attrs.title, 'Meu título');
  assert.deepEqual(attrs.match, [['crewship', 'artillery']]);
  assert.equal(attrs.order, '12');
  assert.match(body, /Corpo \*\*aqui\*\*/);
});

test('parseFrontmatter sem bloco --- devolve corpo intacto', () => {
  const { attrs, body } = parseFrontmatter('# Sem frontmatter\n');
  assert.deepEqual(attrs, {});
  assert.match(body, /Sem frontmatter/);
});

test('markdown: HTML cru é escapado (anti-XSS na origem)', () => {
  const html = marked.parse('antes\n\n<script>alert(1)</script>\n\ndepois');
  assert.ok(!html.includes('<script>'), 'não pode sobrar <script> executável');
  assert.ok(html.includes('&lt;script&gt;'), 'o HTML cru vira texto escapado');
});

test('markdown: link javascript: é neutralizado; https é mantido', () => {
  const bad = marked.parse('[clique](javascript:alert(1))');
  assert.ok(!/href\s*=/i.test(bad), 'link javascript: não pode virar href');
  assert.match(bad, /clique/);
  const good = marked.parse('[wiki](https://wiki.warframe.com/x)');
  assert.match(good, /<a href="https:\/\/wiki\.warframe\.com\/x">wiki<\/a>/);
});
