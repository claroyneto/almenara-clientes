import { test } from 'node:test';
import assert from 'node:assert/strict';
import { procesar } from '../functions/_lib/procesar.js';

// Fakes mínimos de datos/telegram — mismo criterio que el resto de la
// familia Almenara: registran llamadas y devuelven valores fijos, sin red
// real.
function fakeDatos(overrides = {}) {
  const llamadas = [];
  return {
    llamadas,
    obtenerAutorPorChatId: async (chatId) => {
      llamadas.push(['obtenerAutorPorChatId', chatId]);
      return overrides.autor ?? null;
    },
    leerEstado: async (chatId) => {
      llamadas.push(['leerEstado', chatId]);
      return overrides.estado ?? null;
    },
    buscarClientePorNombreNormalizado: async (nombre) => {
      llamadas.push(['buscarClientePorNombreNormalizado', nombre]);
      return overrides.clienteDuplicado ?? null;
    },
    listarClientesRecientes: async (limite) => {
      llamadas.push(['listarClientesRecientes', limite]);
      return overrides.clientesRecientes ?? [];
    },
    crearCliente: async (datos) => { llamadas.push(['crearCliente', datos]); },
    agregarNota: async (datos) => { llamadas.push(['agregarNota', datos]); },
    guardarEstado: async (chatId, paso, datosParciales) => { llamadas.push(['guardarEstado', chatId, paso, datosParciales]); },
    borrarEstado: async (chatId) => { llamadas.push(['borrarEstado', chatId]); }
  };
}

function fakeTelegram() {
  const mensajes = [];
  const callbacksRespondidos = [];
  return {
    mensajes,
    callbacksRespondidos,
    enviarMensaje: async (chatId, texto, botones) => { mensajes.push({ chatId, texto, botones }); },
    responderCallback: async (callbackId) => { callbacksRespondidos.push(callbackId); }
  };
}

test('un chat_id no autorizado recibe el mensaje de "no autorizado" y no toca el resto de datos', async () => {
  const datos = fakeDatos({ autor: null });
  const telegram = fakeTelegram();
  await procesar({ message: { chat: { id: 42 }, text: '/start' } }, { datos, telegram });

  assert.equal(telegram.mensajes.length, 1);
  assert.match(telegram.mensajes[0].texto, /no est[aá]s autorizado/i);
  assert.ok(!datos.llamadas.some(([nombre]) => nombre === 'leerEstado'));
});

test('/start de un usuario autorizado responde la ayuda', async () => {
  const datos = fakeDatos({ autor: 'Jorge' });
  const telegram = fakeTelegram();
  await procesar({ message: { chat: { id: 42 }, text: '/start' } }, { datos, telegram });

  assert.match(telegram.mensajes[0].texto, /\/nuevo/);
});

test('un callback_query se responde con answerCallbackQuery antes de procesar', async () => {
  const datos = fakeDatos({ autor: 'Jorge', estado: { paso: 'nuevo_etapa', datosParciales: { nombre: 'X', rubro: 'Y' } } });
  const telegram = fakeTelegram();
  await procesar(
    { callback_query: { id: 'cb1', data: 'etapa:prospecto', message: { chat: { id: 42 } } } },
    { datos, telegram }
  );

  assert.deepEqual(telegram.callbacksRespondidos, ['cb1']);
});

test('completar /nuevo llama crearCliente con los datos acumulados y borra el estado', async () => {
  const datos = fakeDatos({ autor: 'Jorge', estado: { paso: 'nuevo_etapa', datosParciales: { nombre: 'Cliente X', rubro: 'Agro' } } });
  const telegram = fakeTelegram();
  await procesar(
    { callback_query: { id: 'cb1', data: 'etapa:prospecto', message: { chat: { id: 42 } } } },
    { datos, telegram }
  );

  const llamadaCrear = datos.llamadas.find(([nombre]) => nombre === 'crearCliente');
  assert.deepEqual(llamadaCrear[1], { nombre: 'Cliente X', rubro: 'Agro', etapa: 'prospecto' });
  assert.ok(datos.llamadas.some(([nombre]) => nombre === 'borrarEstado'));
});

test('un update que interpretarEntrada no reconoce no llama a ningún dato ni manda mensaje', async () => {
  const datos = fakeDatos();
  const telegram = fakeTelegram();
  await procesar({ message: { chat: { id: 42 }, photo: [] } }, { datos, telegram });

  assert.equal(datos.llamadas.length, 0);
  assert.equal(telegram.mensajes.length, 0);
});
