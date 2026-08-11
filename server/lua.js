'use strict';

/**
 * Parser mínimo de TABELA Lua, para ler os módulos de dados da wiki oficial
 * (`Module:Research/data`, `Module:Vendors/data`, `Module:Blueprints/data`).
 * Esses módulos são tabelas literais puras: sem função, sem concatenação
 * (`..`), sem string longa `[[...]]`. Cobre exatamente esse subconjunto.
 *
 * ★ É recursivo-descendente de propósito: o texto vem de um site EXTERNO e
 * editável por qualquer um, então nunca passa por `eval`/`Function`. Tem teto
 * de tamanho e de profundidade para um payload hostil não derrubar o processo.
 */

const MAX_SRC = 4 * 1024 * 1024; // 4 MB (o maior módulo hoje tem ~510 KB)
const MAX_DEPTH = 60;

class LuaParseError extends Error {}

/** Pula espaços, comentários de linha (`--`) e de bloco (`--[[ ]]`). */
function skipTrivia(s, i) {
  for (;;) {
    while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\n' || s[i] === '\r')) i++;
    if (s[i] !== '-' || s[i + 1] !== '-') return i;
    if (s[i + 2] === '[' && s[i + 3] === '[') {
      const end = s.indexOf(']]', i + 4);
      i = end === -1 ? s.length : end + 2;
    } else {
      const nl = s.indexOf('\n', i);
      i = nl === -1 ? s.length : nl + 1;
    }
  }
}

const ESCAPES = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', f: '\f', v: '\v', '\\': '\\', '"': '"', "'": "'" };

function readString(s, i) {
  const quote = s[i];
  let out = '';
  i++;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      const n = s[i + 1];
      if (n in ESCAPES) { out += ESCAPES[n]; i += 2; continue; }
      if (n >= '0' && n <= '9') { // \ddd decimal
        let d = '';
        i++;
        while (d.length < 3 && s[i] >= '0' && s[i] <= '9') d += s[i++];
        out += String.fromCharCode(Number(d));
        continue;
      }
      out += n; i += 2; continue;
    }
    if (c === quote) return { value: out, pos: i + 1 };
    out += c; i++;
  }
  throw new LuaParseError('string não fechada');
}

const NUM_RE = /^-?(?:0[xX][0-9a-fA-F]+|\d*\.?\d+(?:[eE][-+]?\d+)?)/;
const IDENT_RE = /^[A-Za-z_]\w*/;

/**
 * Lê um valor Lua a partir de `i`. `scope` resolve identificador solto
 * (`Atlas = WFDefault`); desconhecido vira `null` em vez de estourar.
 */
function readValue(s, i, scope, depth) {
  if (depth > MAX_DEPTH) throw new LuaParseError('tabela aninhada demais');
  i = skipTrivia(s, i);
  const c = s[i];
  if (c === '"' || c === "'") return readString(s, i);
  if (c === '{') return readTable(s, i, scope, depth);
  const rest = s.slice(i, i + 40);
  const num = NUM_RE.exec(rest);
  if (num && (c === '-' || (c >= '0' && c <= '9') || c === '.')) {
    return { value: Number(num[0]), pos: i + num[0].length };
  }
  const id = IDENT_RE.exec(rest);
  if (id) {
    const word = id[0];
    const pos = i + word.length;
    if (word === 'true') return { value: true, pos };
    if (word === 'false') return { value: false, pos };
    if (word === 'nil') return { value: null, pos };
    // referência a um `local` já lido (ex.: `Atlas = WFDefault`)
    return { value: Object.prototype.hasOwnProperty.call(scope, word) ? scope[word] : null, pos };
  }
  throw new LuaParseError(`valor inesperado em ${i}: ${JSON.stringify(rest.slice(0, 16))}`);
}

/**
 * Tabela Lua → objeto JS. Mistura de campos nomeados e posicionais é normal
 * nesses módulos (`{ "Kuva", "Resource", 10, 5000, Timer = 604800 }`): os
 * posicionais viram as chaves numéricas 1..n (como em Lua), os nomeados viram
 * chaves de string, no MESMO objeto.
 */
function readTable(s, i, scope, depth) {
  i++; // '{'
  const out = {};
  let arrayIndex = 1;
  for (;;) {
    i = skipTrivia(s, i);
    if (i >= s.length) throw new LuaParseError('tabela não fechada');
    if (s[i] === '}') return { value: out, pos: i + 1 };
    if (s[i] === ',' || s[i] === ';') { i++; continue; }

    let key = null;
    if (s[i] === '[') {
      const k = readValue(s, i + 1, scope, depth + 1);
      let j = skipTrivia(s, k.pos);
      if (s[j] !== ']') throw new LuaParseError(`']' esperado em ${j}`);
      j = skipTrivia(s, j + 1);
      if (s[j] !== '=') throw new LuaParseError(`'=' esperado em ${j}`);
      key = String(k.value);
      i = j + 1;
    } else {
      const id = IDENT_RE.exec(s.slice(i, i + 64));
      if (id) {
        const after = skipTrivia(s, i + id[0].length);
        // só é chave se vier '=' (e não '==', que não existe aqui)
        if (s[after] === '=' && s[after + 1] !== '=') { key = id[0]; i = after + 1; }
      }
    }

    const v = readValue(s, i, scope, depth + 1);
    // `nil` explícito não cria chave (semântica de Lua)
    if (v.value !== null || key === null) {
      out[key === null ? String(arrayIndex++) : key] = v.value;
    } else if (key === null) {
      arrayIndex++;
    }
    i = v.pos;
  }
}

/**
 * Módulo Lua inteiro → o valor do `return`. Resolve os `local X = <valor>`
 * declarados antes (é como `Module:Research/data` monta `local Data = {...}`
 * e depois `return Data`). Ignora statements que não sabe ler (ex.: o
 * `for k,v in pairs(Data) do ... end` no fim do Research).
 */
function parseLuaModule(src) {
  const s = String(src == null ? '' : src);
  if (s.length > MAX_SRC) throw new LuaParseError(`módulo grande demais (${s.length} bytes)`);
  const scope = Object.create(null);
  let i = 0;
  for (;;) {
    i = skipTrivia(s, i);
    if (i >= s.length) break;
    if (s.startsWith('local', i) && /\s/.test(s[i + 5] || '')) {
      const m = /^local\s+([A-Za-z_]\w*)\s*=\s*/.exec(s.slice(i, i + 200));
      if (m) {
        const v = readValue(s, i + m[0].length, scope, 0);
        scope[m[1]] = v.value;
        i = v.pos;
        continue;
      }
    }
    if (s.startsWith('return', i)) {
      return readValue(s, i + 6, scope, 0).value;
    }
    // statement desconhecido: pula a linha
    const nl = s.indexOf('\n', i);
    if (nl === -1) break;
    i = nl + 1;
  }
  throw new LuaParseError('módulo sem `return`');
}

/** Campos posicionais (1..n) de uma tabela mista, na ordem. */
function positional(tbl) {
  const out = [];
  if (!tbl || typeof tbl !== 'object') return out;
  for (let n = 1; Object.prototype.hasOwnProperty.call(tbl, String(n)); n++) out.push(tbl[String(n)]);
  return out;
}

module.exports = { parseLuaModule, positional, LuaParseError };
