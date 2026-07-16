'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCraftingUses } = require('../server/ingest');

const row = (unique_name, name, category, components) =>
  ({ unique_name, name, category, slim: components ? { components } : {} });
const comp = (name, uniqueName, itemCount = 1) => ({ name, uniqueName, itemCount });

test('mapeia componente (item avulso) → produto: Furis → Afuris, somando quantidade', () => {
  const rows = [
    row('u/furis', 'Furis', 'Secondary'),
    row('u/orokincell', 'Orokin Cell', 'Resources'),
    row('u/afuris', 'Afuris', 'Secondary', [
      comp('Blueprint', 'u/afurisBP'),          // peça, não existe como item → ignora
      comp('Furis', 'u/furis'),
      comp('Furis', 'u/furis'),                 // repetido → soma
      comp('Orokin Cell', 'u/orokincell'),      // recurso (Resources + COMMON) → ignora
    ]),
  ];
  const uses = buildCraftingUses(rows);
  assert.equal(uses.length, 1, 'só Furis→Afuris');
  assert.deepEqual(uses[0], {
    component_unique: 'u/furis',
    product_unique: 'u/afuris',
    product_name: 'Afuris',
    item_count: 2, // a Afuris pede 2× Furis
  });
});

test('ignora recurso bruto por categoria mesmo fora da lista COMMON_RESOURCES', () => {
  const rows = [
    row('u/hexenon', 'Hexenon', 'Resources'),
    row('u/weapon', 'Some Weapon', 'Primary', [comp('Hexenon', 'u/hexenon', 5)]),
  ];
  assert.deepEqual(buildCraftingUses(rows), [], 'recurso não vira relação de "usado para construir"');
});

test('ignora componente sem uniqueName e auto-referência', () => {
  const rows = [
    row('u/x', 'X', 'Melee', [
      comp('Barrel', undefined),   // sem id
      comp('X', 'u/x'),            // auto-referência
    ]),
  ];
  assert.deepEqual(buildCraftingUses(rows), []);
});

test('ignora componente que não é um item indexado (peça solta)', () => {
  const rows = [
    row('u/prime', 'Boltor Prime', 'Primary', [
      comp('Barrel', 'u/boltorPrimeBarrel'), // não há item com esse unique → ignora
      comp('Receiver', 'u/boltorPrimeReceiver'),
    ]),
  ];
  assert.deepEqual(buildCraftingUses(rows), []);
});

test('um item usado por VÁRIOS produtos gera uma relação por produto', () => {
  const rows = [
    row('u/bronco', 'Bronco', 'Secondary'),
    row('u/akbronco', 'Akbronco', 'Secondary', [comp('Bronco', 'u/bronco', 2)]),
    row('u/other', 'Other', 'Secondary', [comp('Bronco', 'u/bronco', 1)]),
  ];
  const uses = buildCraftingUses(rows).sort((a, b) => a.product_name.localeCompare(b.product_name));
  assert.equal(uses.length, 2);
  assert.deepEqual(uses.map((u) => [u.product_name, u.item_count]), [['Akbronco', 2], ['Other', 1]]);
});

test('itens sem componentes não quebram e não geram relações', () => {
  assert.deepEqual(buildCraftingUses([row('u/a', 'A', 'Secondary')]), []);
  assert.deepEqual(buildCraftingUses([]), []);
});
