import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarNombre } from '../functions/_lib/normalizarNombre.js';

test('minúsculas, sin tildes, espacios colapsados', () => {
  assert.equal(normalizarNombre('  Fuégos   Del  Sur '), 'fuegos del sur');
});

test('nombres distintos no normalizan igual', () => {
  assert.notEqual(normalizarNombre('Fuegos del Sur'), normalizarNombre('Fuegos del Norte'));
});

test('nombres iguales salvo formato normalizan igual', () => {
  assert.equal(normalizarNombre('FUEGOS DEL SUR'), normalizarNombre('fuegos del sur'));
});

test('tolera null/undefined en vez de reventar', () => {
  assert.equal(normalizarNombre(null), '');
  assert.equal(normalizarNombre(undefined), '');
});
