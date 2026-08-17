import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretarEntrada } from '../functions/_lib/interpretarEntrada.js';

test('un mensaje de texto normal se interpreta como tipo texto', () => {
  const entrada = interpretarEntrada({ message: { chat: { id: 42 }, text: 'Reunión buena, pidió cotización' } });
  assert.deepEqual(entrada, { chatId: '42', tipo: 'texto', valor: 'Reunión buena, pidió cotización' });
});

test('un mensaje que empieza con / se interpreta como comando, en minúsculas', () => {
  const entrada = interpretarEntrada({ message: { chat: { id: 42 }, text: '/Nuevo' } });
  assert.deepEqual(entrada, { chatId: '42', tipo: 'comando', valor: '/nuevo' });
});

test('un comando con texto extra solo toma la palabra del comando', () => {
  const entrada = interpretarEntrada({ message: { chat: { id: 42 }, text: '/nota algo extra' } });
  assert.equal(entrada.valor, '/nota');
});

test('un callback_query se interpreta como tipo boton, con callbackId', () => {
  const entrada = interpretarEntrada({
    callback_query: { id: 'cb1', data: 'etapa:prospecto', message: { chat: { id: 42 } } }
  });
  assert.deepEqual(entrada, { chatId: '42', tipo: 'boton', valor: 'etapa:prospecto', callbackId: 'cb1' });
});

test('un update sin mensaje de texto ni callback devuelve null', () => {
  assert.equal(interpretarEntrada({ message: { chat: { id: 42 }, photo: [] } }), null);
  assert.equal(interpretarEntrada({}), null);
});
