'use strict';

/**
 * Guias do Nightwave: o casamento ato -> guia e as imagens citadas nos artigos.
 *
 * O `match` do guia é lido do DISCO (o .md em português é o original), então
 * este teste falha no momento em que alguém mexe no frontmatter e quebra o
 * casamento, sem depender de reingestão nem de banco populado.
 */

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wfh-nwg-'));
process.env.DB_PATH = path.join(TMP, 'test.db');
process.env.DATA_DIR = TMP;

const test = require('node:test');
const assert = require('node:assert/strict');
const { matchGuide } = require('../server/nightwave');
const { loadArticles } = require('../server/ingest');

const ROOT = path.join(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content');
const PUBLIC_DIR = path.join(ROOT, 'public');
const EIDOLON = '26-eidolon-hidrolista';
const INCARNON = '27-evolucao-cerimonial';

/** Mesma lista que `loadGuides` monta do banco, só que direto dos .md. */
function guidesFromDisk() {
  return loadArticles()
    .filter((a) => a.kind === 'nightwave' && a.lang === 'pt')
    .sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title))
    .map((a) => ({
      slug: a.slug,
      title: a.title,
      groups: a.match_json ? JSON.parse(a.match_json) : [],
    }));
}

/** O worldstate só manda inglês, então o casamento é sempre no texto EN. */
const act = (title, desc) => ({ title, desc });

test('ato de elite do Hidrolista cai no guia de Eidolon', () => {
  const g = matchGuide(guidesFromDisk(), act('Hydrolyst Hunter', 'Kill or Capture an Eidolon Hydrolyst'));
  assert.equal(g && g.slug, EIDOLON);
});

test('atos dos outros dois Eidolons caem no mesmo guia', () => {
  const guides = guidesFromDisk();
  for (const [title, desc] of [
    ['Teralyst Hunter', 'Kill or Capture an Eidolon Teralyst'],
    ['Gantulyst Hunter', 'Kill or Capture an Eidolon Gantulyst'],
  ]) {
    assert.equal((matchGuide(guides, act(title, desc)) || {}).slug, EIDOLON, title);
  }
});

test('ato de contrato nas Planícies NÃO cai no guia de Eidolon', () => {
  // "Plains of Eidolon" aparece em pesca, mineração e contratos: um grupo de
  // match com a palavra "eidolon" sozinha roubaria todos esses atos.
  const guides = guidesFromDisk();
  for (const [title, desc] of [
    ['Earth Bounty Hunter', 'Complete 3 different Bounties in the Plains of Eidolon'],
    ['Earth Fisher', 'Catch 6 rare fish in the Plains of Eidolon'],
    ['Earth Miner', 'Mine 6 rare gems or ore in the Plains of Eidolon'],
  ]) {
    const g = matchGuide(guides, act(title, desc));
    assert.notEqual((g || {}).slug, EIDOLON, title);
  }
});

test('ato de elite da Evolução Cerimonial cai no guia de Incarnon', () => {
  const g = matchGuide(guidesFromDisk(),
    act('Ceremonial Evolution', 'Evolve any Incarnon weapon in-mission 5 times'));
  assert.equal(g && g.slug, INCARNON);
});

test('nenhum guia tem grupo de match vazio (casaria com qualquer ato)', () => {
  for (const g of guidesFromDisk()) {
    for (const group of g.groups) {
      assert.ok(Array.isArray(group) && group.length > 0, `grupo vazio em ${g.slug}`);
      for (const w of group) assert.ok(String(w).trim(), `palavra vazia em ${g.slug}`);
    }
  }
});

test('toda imagem citada num artigo existe em public/', () => {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name));
      else if (e.name.endsWith('.md')) files.push(path.join(dir, e.name));
    }
  };
  walk(CONTENT_DIR);
  let found = 0;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/!\[[^\]]*\]\((\/[^)\s]+)\)/g)) {
      found += 1;
      // a URL leva `?v=` de cache-busting (a borda segura imagem por horas):
      // o arquivo em disco é o caminho sem a query
      const rel = m[1].split('?')[0].replace(/^\//, '');
      assert.ok(fs.existsSync(path.join(PUBLIC_DIR, rel)),
        `imagem ausente: ${m[1]} (citada em ${path.relative(ROOT, f)})`);
    }
  }
  assert.ok(found > 0, 'nenhuma imagem encontrada nos artigos: o regex quebrou?');
});
