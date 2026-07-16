'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// public/js/i18n.js roda no browser (localStorage/navigator) — aqui só lemos o
// texto e comparamos os conjuntos de chaves de STRINGS.pt vs STRINGS.en, para
// garantir que nenhuma string fica sem tradução (some/aparece só num idioma).
const SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'i18n.js'), 'utf8');

function keysOf(block) {
  const set = new Set();
  const re = /(?:^|[,{])\s*'([\w.]+)'\s*:/gm;
  let m;
  while ((m = re.exec(block)) !== null) set.add(m[1]);
  return set;
}

function slice(from, to) {
  const a = SRC.indexOf(from);
  const b = SRC.indexOf(to, a + from.length);
  assert.ok(a >= 0 && b > a, `não achei o bloco entre "${from}" e "${to}"`);
  return SRC.slice(a + from.length, b);
}

test('STRINGS.pt e STRINGS.en têm exatamente as mesmas chaves', () => {
  const ptBlock = slice('pt: {', 'en: {');
  const enBlock = slice('en: {', 'const MISSIONS');
  const pt = keysOf(ptBlock);
  const en = keysOf(enBlock);

  assert.ok(pt.size > 80, `esperava muitas chaves em pt, achei ${pt.size}`);

  const soPt = [...pt].filter((k) => !en.has(k));
  const soEn = [...en].filter((k) => !pt.has(k));
  assert.deepEqual(soPt, [], `chaves só em PT (faltam em EN): ${soPt.join(', ')}`);
  assert.deepEqual(soEn, [], `chaves só em EN (faltam em PT): ${soEn.join(', ')}`);
});

test('MISSIONS e ENEMIES têm pt e en em cada entrada', () => {
  const block = slice('const MISSIONS', 'function t(');
  // cada entrada tem { pt: '...', en: '...' } — conta os pt e en
  const pt = (block.match(/\bpt:\s*'/g) || []).length;
  const en = (block.match(/\ben:\s*'/g) || []).length;
  assert.ok(pt > 20, `poucas traduções de missão/inimigo: ${pt}`);
  assert.equal(pt, en, 'toda entrada de missão/inimigo precisa de pt E en');
});
