import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearTelegram } from '../functions/_lib/telegram.js';

function fetchFalso() {
  const llamadas = [];
  const impl = async (url, opciones) => {
    llamadas.push({ url, cuerpo: JSON.parse(opciones.body) });
    return { ok: true, json: async () => ({ ok: true }) };
  };
  impl.llamadas = llamadas;
  return impl;
}

test('enviarMensaje sin botones manda solo texto', async () => {
  const fetchImpl = fetchFalso();
  const telegram = crearTelegram({ token: 't', fetchImpl });
  await telegram.enviarMensaje('42', 'hola');
  assert.equal(fetchImpl.llamadas[0].url, 'https://api.telegram.org/bott/sendMessage');
  assert.deepEqual(fetchImpl.llamadas[0].cuerpo, { chat_id: '42', text: 'hola' });
});

test('enviarMensaje con botones arma el teclado inline', async () => {
  const fetchImpl = fetchFalso();
  const telegram = crearTelegram({ token: 't', fetchImpl });
  await telegram.enviarMensaje('42', '¿Cuál?', [{ etiqueta: 'Sí', valor: 'si' }, { etiqueta: 'No', valor: 'no' }]);
  assert.deepEqual(fetchImpl.llamadas[0].cuerpo.reply_markup, {
    inline_keyboard: [[{ text: 'Sí', callback_data: 'si' }], [{ text: 'No', callback_data: 'no' }]]
  });
});

test('responderCallback llama answerCallbackQuery con el id', async () => {
  const fetchImpl = fetchFalso();
  const telegram = crearTelegram({ token: 't', fetchImpl });
  await telegram.responderCallback('cb1');
  assert.equal(fetchImpl.llamadas[0].url, 'https://api.telegram.org/bott/answerCallbackQuery');
  assert.deepEqual(fetchImpl.llamadas[0].cuerpo, { callback_query_id: 'cb1' });
});

test('un rechazo de Telegram se registra en vez de tragarse en silencio', async () => {
  const original = console.error;
  const errores = [];
  console.error = (...args) => errores.push(args.join(' '));
  try {
    const fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({ ok: false, description: 'Bad Request' }) });
    const telegram = crearTelegram({ token: 't', fetchImpl });
    await telegram.enviarMensaje('42', 'hola');
  } finally {
    console.error = original;
  }
  assert.match(errores.join(' | '), /Bad Request/);
});
