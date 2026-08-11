'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLuaModule, positional, LuaParseError } = require('../server/lua');

// O parser lê MÓDULOS DE DADOS DA WIKI - texto que qualquer pessoa na internet
// pode editar. Por isso os testes cobrem tanto o formato real quanto entrada
// hostil (fundo sem retorno, aninhamento infinito, tentativa de execução).

test('parseLuaModule: tabela aninhada, chaves com colchete e ambos os tipos de aspas', () => {
  const v = parseLuaModule(`return {
    Labs = { ["Infested"] = { Name = 'Bio Lab' } },
    Research = { ['Mutagen Mass'] = { Lab = 'Infested', Credits = 5000 } },
  }`);
  assert.equal(v.Labs.Infested.Name, 'Bio Lab');
  assert.equal(v.Research['Mutagen Mass'].Lab, 'Infested');
  assert.equal(v.Research['Mutagen Mass'].Credits, 5000);
});

test('parseLuaModule: tabela MISTA guarda posicionais em 1..n e nomeados por chave', () => {
  // é a forma real de uma oferta de vendedor: { nome, tipo, preço, qtd, Prereq = 2 }
  const v = parseLuaModule('return { Off = { "Kuva", "Resource", 10, 5000, Prereq = 2 } }');
  assert.deepEqual(positional(v.Off), ['Kuva', 'Resource', 10, 5000]);
  assert.equal(v.Off.Prereq, 2);
});

test('parseLuaModule: resolve `local` referenciado depois (Atlas = WFDefault)', () => {
  const v = parseLuaModule(`
    local WFDefault = { Part = 'Chassis' }
    local Data = { Atlas = WFDefault, Ash = { Part = 'Systems' } }
    return Data`);
  assert.deepEqual(v.Atlas, { Part: 'Chassis' });
  assert.equal(v.Ash.Part, 'Systems');
});

test('parseLuaModule: identificador desconhecido vira null, sem estourar', () => {
  const v = parseLuaModule('return { A = NaoDeclarado, B = 1 }');
  assert.equal(v.B, 1);
  assert.ok(!('A' in v), 'valor nulo não cria chave (semântica de Lua)');
});

test('parseLuaModule: números negativos, decimais e booleanos', () => {
  const v = parseLuaModule('return { N = -3.5, E = 1.5e3, T = true, F = false, Z = 0 }');
  assert.equal(v.N, -3.5);
  assert.equal(v.E, 1500);
  assert.equal(v.T, true);
  assert.equal(v.F, false);
  assert.equal(v.Z, 0);
});

test('parseLuaModule: `nil` NÃO cria a chave', () => {
  const v = parseLuaModule('return { A = nil, B = 2 }');
  assert.ok(!('A' in v), 'nil explícito equivale a ausência');
  assert.equal(v.B, 2);
});

test('parseLuaModule: comentário de linha e de bloco são ignorados', () => {
  // no módulo real as entradas descontinuadas ficam COMENTADAS (Dagath's Hollow)
  const v = parseLuaModule(`
    -- comentário solto
    --[[ bloco
         de várias linhas ]]
    return {
      Vivo = { Lab = 'Tenno' },
      -- ['Morto'] = { Lab = 'Hollow' },
    }`);
  assert.deepEqual(Object.keys(v), ['Vivo']);
});

test('parseLuaModule: "--" DENTRO de string não vira comentário', () => {
  const v = parseLuaModule(`return { Name = "Mk I -- Turret", Other = 'a--b' }`);
  assert.equal(v.Name, 'Mk I -- Turret');
  assert.equal(v.Other, 'a--b');
});

test('parseLuaModule: escapes de string', () => {
  const v = parseLuaModule('return { A = "linha1\\nlinha2", B = "aspa\\"dentro", C = "barra\\\\fim" }');
  assert.equal(v.A, 'linha1\nlinha2');
  assert.equal(v.B, 'aspa"dentro');
  assert.equal(v.C, 'barra\\fim');
});

test('parseLuaModule: ignora statement que não sabe ler e ainda acha o return', () => {
  // o Module:Research/data termina com um `for ... pairs(Data) ... end` antes do return
  const v = parseLuaModule(`
    local Data = { X = 1 }
    for k,v in pairs(Data) do v.Name = k end
    return Data`);
  assert.equal(v.X, 1);
});

// ---- entrada hostil: o parser não pode executar nada nem derrubar o processo ----

test('parseLuaModule NÃO executa código: payload com require/process só falha ao parsear', () => {
  const before = globalThis.__luaPwned;
  assert.throws(
    () => parseLuaModule('return { A = require("fs").writeFileSync("/tmp/pwned", "x") }'),
    LuaParseError
  );
  assert.equal(globalThis.__luaPwned, before, 'nada foi executado');
});

test('parseLuaModule: aninhamento profundo demais falha com erro tratado (sem stack overflow)', () => {
  const deep = `return ${'{ A = '.repeat(200)}1${' }'.repeat(200)}`;
  assert.throws(() => parseLuaModule(deep), LuaParseError);
});

test('parseLuaModule: módulo gigante é recusado antes de parsear', () => {
  assert.throws(() => parseLuaModule('x'.repeat(5 * 1024 * 1024)), /grande demais/);
});

test('parseLuaModule: string sem fechar e tabela sem fechar falham', () => {
  assert.throws(() => parseLuaModule('return { A = "sem fim }'), LuaParseError);
  assert.throws(() => parseLuaModule('return { A = 1 '), LuaParseError);
});

test('parseLuaModule: módulo sem `return` falha (não devolve objeto vazio silencioso)', () => {
  assert.throws(() => parseLuaModule('local X = { A = 1 }'), /sem `return`/);
});

test('positional: para em buraco e ignora chaves nomeadas', () => {
  assert.deepEqual(positional({ 1: 'a', 2: 'b', Nome: 'x' }), ['a', 'b']);
  assert.deepEqual(positional({ 2: 'b' }), [], 'sem o índice 1 não há sequência');
  assert.deepEqual(positional(null), []);
});
