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

// ---------------------------------------------------------------------------
// classifyMisc: quem de Misc.json vira item buscável
// ---------------------------------------------------------------------------

const { classifyMisc } = require('../server/ingest');

test('classifyMisc: moeda/token que só DROPA entra como recurso (era invisível no site)', () => {
  // Vainthorn/Espinobre: gasta-se com vendedor, não é ingrediente de receita
  // nenhuma, então `parents` vem vazio e o WFCD o deixa como type "Misc".
  const vainthorn = {
    name: 'Vainthorn', uniqueName: '/Lotus/Types/Items/MiscItems/DagathAbyssItem',
    type: 'Misc', parents: [], drops: [{ location: 'Abyssal Beacon, Rotation C', chance: 33.3 }],
  };
  const c = classifyMisc(vainthorn);
  assert.equal(c.take, true, 'o jogo dropa isso: o site tem que saber responder onde');
  assert.equal(c.category, 'Resources', 'é recurso, tem página de "onde farmar"');
  assert.equal(c.viaDrops, true, 'entrou pelo critério novo → passa pelo guard de nome');
});

test('classifyMisc: os irmãos do mesmo bug também entram', () => {
  for (const name of ['Archon Shard', 'Vosfor', 'Corrupted Holokey', 'Stock']) {
    const c = classifyMisc({ name, uniqueName: `/u/${name}`, type: 'Misc', parents: [], drops: [{ location: 'X', chance: 1 }] });
    assert.equal(c.take, true, `${name} tem que ser buscável`);
    assert.equal(c.category, 'Resources');
  }
});

test('classifyMisc: coisa de Misc SEM drop e sem uso continua fora (não polui a busca)', () => {
  // Nightwave Challenge, adaptador não-dropável, cosmético solto: 210+ entradas
  assert.equal(classifyMisc({ name: 'Desafio X', uniqueName: '/u/x', type: 'Nightwave Challenge', parents: [], drops: [] }).take, false);
  assert.equal(classifyMisc({ name: 'Coisa', uniqueName: '/u/y', type: 'Misc' }).take, false);
  assert.equal(classifyMisc({ name: 'Coisa', uniqueName: '/u/z', type: 'Misc', drops: [] }).take, false);
});

test('classifyMisc: drop de coisa que NÃO é recurso fica em Misc, não em Resources', () => {
  const cena = classifyMisc({ name: 'Fortuna Scene', uniqueName: '/u/cena', type: 'Captura', drops: [{ location: 'X', chance: 1 }] });
  assert.equal(cena.category, 'Misc', 'cena de Captura não é recurso de farm');
  assert.equal(cena.viaDrops, true);
  const med = classifyMisc({ name: 'Datum', uniqueName: '/u/med', type: 'Medallion', drops: [{ location: 'X', chance: 1 }] });
  assert.equal(med.category, 'Misc');
});

test('classifyMisc: os critérios ANTIGOS continuam valendo (sem regressão)', () => {
  assert.deepEqual(classifyMisc({ name: 'Plastids', uniqueName: '/u/p', type: 'Resource' }),
    { take: true, viaDrops: false, category: 'Resources' });
  // Neurodes: type "Misc" mas com 115 usos em receitas
  assert.deepEqual(classifyMisc({ name: 'Neurodes', uniqueName: '/u/n', type: 'Misc', parents: ['Excalibur'] }),
    { take: true, viaDrops: false, category: 'Resources' });
  assert.deepEqual(classifyMisc({ name: 'Raplak Prism', uniqueName: '/u/a', type: 'Amp' }),
    { take: true, viaDrops: false, category: 'Misc' });
  // ingrediente vence o drop: NÃO pode virar viaDrops (senão o guard de nome
  // poderia descartar um recurso de craft de verdade)
  assert.equal(classifyMisc({ name: 'X', uniqueName: '/u/x', type: 'Misc', parents: ['Y'], drops: [{ location: 'Z', chance: 1 }] }).viaDrops, false);
});

test('classifyMisc: entrada malformada não vira linha no banco', () => {
  assert.equal(classifyMisc(null).take, false);
  assert.equal(classifyMisc({ name: 'Sem unique', type: 'Resource' }).take, false);
  assert.equal(classifyMisc({ uniqueName: '/u/sem-nome', type: 'Resource' }).take, false);
});

// ---------------------------------------------------------------------------
// cleanName: token de ícone do jogo dentro do nome
// ---------------------------------------------------------------------------

const { cleanName } = require('../server/util');

test('cleanName tira o token de ícone que vazava para o <h1> e o <title>', () => {
  // estava NO AR: 13 páginas exibiam "<ARCHWING> Itzal" como nome em PT
  assert.equal(cleanName('<ARCHWING> Itzal'), 'Itzal');
  assert.equal(cleanName('<Shard_blue_simple> Tauforged Azure Archon Shard'), 'Tauforged Azure Archon Shard');
  assert.equal(cleanName('File-A-Style<Retro_tm> Binder'), 'File-A-Style Binder', 'token no MEIO da palavra');
  assert.equal(cleanName('Emissary <Reputation_small> Standing'), 'Emissary Standing');
});

test('cleanName não morde nome legítimo', () => {
  for (const n of ['Braton Prime', 'Argo & Vel', "Ruk's Claw", 'Ekwana Ii Jai', 'Sun & Moon']) {
    assert.equal(cleanName(n), n);
  }
  // o padrão exige <letras/dígitos/_> colado: "a < b > c" não é token
  assert.equal(cleanName('a < b > c'), 'a < b > c');
});

test('cleanName é defensivo com entrada estranha', () => {
  assert.equal(cleanName('<>'), '<>', 'não vira string vazia');
  assert.equal(cleanName('<ICON>'), '<ICON>', 'nome que era só token mantém o original');
  assert.equal(cleanName(null), null);
  assert.equal(cleanName(42), 42);
});

test('classifyMisc: peça de arma é reconhecida pelo CAMINHO, não pela etiqueta type', () => {
  // as peças de Kitgun infestado vêm com type "Pistol" (não "Kitgun Component")
  const verm = {
    name: 'Vermisplicer', type: 'Pistol', parents: [], drops: [],
    uniqueName: '/Lotus/Weapons/Infested/Pistols/InfKitGun/Barrels/InfBarrelBeam/InfBarrelBeamPart',
  };
  assert.equal(classifyMisc(verm).take, true, 'mora sob /Lotus/Weapons/: é peça de arma');
  assert.equal(classifyMisc(verm).category, 'Misc');
  // e o caminho NÃO pode abraçar desafio de Nightwave, que também vem type "Pistol"
  const desafio = {
    name: 'Smaller Is Bigger', type: 'Pistol', parents: [], drops: [],
    uniqueName: '/Lotus/Types/Challenges/Seasons/Daily/SeasonDailyKillEnemiesWithPistol',
  };
  assert.equal(classifyMisc(desafio).take, false);
});
