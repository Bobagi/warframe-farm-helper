'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// public/js/i18n.js roda no browser (localStorage/navigator) — aqui só lemos o
// texto e comparamos os conjuntos de chaves de STRINGS.pt/en/es/ru, para
// garantir que nenhuma string fica sem tradução (some/aparece só num idioma).
const SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'i18n.js'), 'utf8');
const LANGS = ['pt', 'en', 'es', 'ru'];

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

// cada bloco de idioma vai do seu "<lang>: {" até o começo do próximo; o último
// (ru) termina onde começa "const MISSIONS".
const BOUNDS = { pt: 'en: {', en: 'es: {', es: 'ru: {', ru: 'const MISSIONS' };

test('STRINGS.pt/en/es/ru têm exatamente as mesmas chaves', () => {
  const keys = {};
  for (const l of LANGS) keys[l] = keysOf(slice(`${l}: {`, BOUNDS[l]));

  assert.ok(keys.pt.size > 80, `esperava muitas chaves em pt, achei ${keys.pt.size}`);

  for (const l of LANGS) {
    if (l === 'pt') continue;
    const missing = [...keys.pt].filter((k) => !keys[l].has(k));
    const extra = [...keys[l]].filter((k) => !keys.pt.has(k));
    assert.deepEqual(missing, [], `chaves que faltam em ${l}: ${missing.join(', ')}`);
    assert.deepEqual(extra, [], `chaves só em ${l} (faltam em pt): ${extra.join(', ')}`);
  }
});

test('MISSIONS e ENEMIES têm pt, en, es e ru em cada entrada', () => {
  const block = slice('const MISSIONS', 'function t(');
  const counts = {};
  for (const l of LANGS) counts[l] = (block.match(new RegExp(`\\b${l}:\\s*'`, 'g')) || []).length;
  assert.ok(counts.pt > 20, `poucas traduções de missão/inimigo: ${counts.pt}`);
  for (const l of LANGS) {
    assert.equal(counts[l], counts.pt,
      `toda entrada de missão/inimigo precisa de ${l} (achei ${counts[l]} vs ${counts.pt} em pt)`);
  }
});
