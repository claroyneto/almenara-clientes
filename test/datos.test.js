import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearDatos } from '../functions/_lib/datos.js';

function fetchFalso(respuestas) {
  const llamadas = [];
  const impl = async (url, opciones = {}) => {
    llamadas.push({ url, metodo: opciones.method || 'GET', cuerpo: opciones.body ? JSON.parse(opciones.body) : null });
    const siguiente = respuestas.shift() ?? { status: 200, body: [] };
    return {
      ok: siguiente.status < 300,
      status: siguiente.status,
      json: async () => siguiente.body,
      text: async () => JSON.stringify(siguiente.body)
    };
  };
  impl.llamadas = llamadas;
  return impl;
}

test('obtenerAutorPorChatId devuelve el nombre si el chat_id está autorizado', async () => {
  const fetchImpl = fetchFalso([{ status: 200, body: [{ nombre: 'Jorge' }] }]);
  const datos = crearDatos({ supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'k', fetchImpl });
  assert.equal(await datos.obtenerAutorPorChatId('42'), 'Jorge');
});

test('obtenerAutorPorChatId devuelve null si no está autorizado', async () => {
  const fetchImpl = fetchFalso([{ status: 200, body: [] }]);
  const datos = crearDatos({ supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'k', fetchImpl });
  assert.equal(await datos.obtenerAutorPorChatId('999'), null);
});

test('buscarClientePorNombreNormalizado compara normalizado, no literal', async () => {
  const fetchImpl = fetchFalso([{ status: 200, body: [
    { id: '1', nombre: 'Fuégos del Sur', etapa: 'cliente' },
    { id: '2', nombre: 'Otro', etapa: 'prospecto' }
  ] }]);
  const datos = crearDatos({ supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'k', fetchImpl });
  const encontrado = await datos.buscarClientePorNombreNormalizado('fuegos del sur');
  assert.equal(encontrado.id, '1');
});

test('buscarClientePorNombreNormalizado devuelve null si no hay coincidencia exacta', async () => {
  const fetchImpl = fetchFalso([{ status: 200, body: [{ id: '1', nombre: 'Fuegos del Sur', etapa: 'cliente' }] }]);
  const datos = crearDatos({ supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'k', fetchImpl });
  assert.equal(await datos.buscarClientePorNombreNormalizado('fuegos del norte'), null);
});

test('crearCliente manda POST a /clientes con el cuerpo correcto', async () => {
  const fetchImpl = fetchFalso([{ status: 201, body: [{ id: '9', nombre: 'X', rubro: 'Agro', etapa: 'prospecto' }] }]);
  const datos = crearDatos({ supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'k', fetchImpl });
  const fila = await datos.crearCliente({ nombre: 'X', rubro: 'Agro', etapa: 'prospecto' });
  assert.equal(fetchImpl.llamadas[0].metodo, 'POST');
  assert.match(fetchImpl.llamadas[0].url, /\/clientes$/);
  assert.deepEqual(fetchImpl.llamadas[0].cuerpo, { nombre: 'X', rubro: 'Agro', etapa: 'prospecto' });
  assert.equal(fila.id, '9');
});

test('agregarNota inserta la nota y actualiza actualizado_en del cliente', async () => {
  const fetchImpl = fetchFalso([
    { status: 201, body: [{ id: 'n1', cliente_id: 'c1', texto: 'reunión', autor: 'Jorge' }] },
    { status: 204, body: null }
  ]);
  const datos = crearDatos({ supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'k', fetchImpl });
  await datos.agregarNota({ clienteId: 'c1', texto: 'reunión', autor: 'Jorge' });
  assert.match(fetchImpl.llamadas[0].url, /\/notas$/);
  assert.match(fetchImpl.llamadas[1].url, /\/clientes\?id=eq\.c1/);
  assert.equal(fetchImpl.llamadas[1].metodo, 'PATCH');
});

test('leerEstado devuelve null y borra la fila si el estado expiró', async () => {
  const fetchImpl = fetchFalso([
    { status: 200, body: [{ paso: 'nuevo_nombre', datos_parciales: {}, actualizado_en: '2020-01-01T00:00:00Z' }] },
    { status: 204, body: null } // el DELETE de borrarEstado
  ]);
  const datos = crearDatos({ supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'k', fetchImpl });
  const estado = await datos.leerEstado('42');
  assert.equal(estado, null);
  assert.equal(fetchImpl.llamadas[1].metodo, 'DELETE');
});

test('leerEstado devuelve el paso y datosParciales si no expiró', async () => {
  const reciente = new Date().toISOString();
  const fetchImpl = fetchFalso([{ status: 200, body: [{ paso: 'nuevo_rubro', datos_parciales: { nombre: 'X' }, actualizado_en: reciente }] }]);
  const datos = crearDatos({ supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'k', fetchImpl });
  const estado = await datos.leerEstado('42');
  assert.deepEqual(estado, { paso: 'nuevo_rubro', datosParciales: { nombre: 'X' } });
});

test('guardarEstado hace upsert (Prefer merge-duplicates) en bot_estado', async () => {
  const fetchImpl = fetchFalso([{ status: 201, body: [] }]);
  const datos = crearDatos({ supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'k', fetchImpl });
  await datos.guardarEstado('42', 'nuevo_nombre', {});
  assert.match(fetchImpl.llamadas[0].url, /\/bot_estado$/);
});

test('borrarEstado manda DELETE filtrado por chat_id', async () => {
  const fetchImpl = fetchFalso([{ status: 204, body: null }]);
  const datos = crearDatos({ supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'k', fetchImpl });
  await datos.borrarEstado('42');
  assert.equal(fetchImpl.llamadas[0].metodo, 'DELETE');
  assert.match(fetchImpl.llamadas[0].url, /\/bot_estado\?chat_id=eq\.42/);
});
