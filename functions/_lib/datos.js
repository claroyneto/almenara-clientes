import { normalizarNombre } from './normalizarNombre.js';

const EXPIRACION_ESTADO_MS = 2 * 60 * 60 * 1000; // 2 horas — spec §5, evita que un flujo a medias quede trabado para siempre

// Acceso a Supabase vía REST (PostgREST) directo con fetch, sin SDK — mismo
// criterio de cero-dependencias que Almenara_Web/functions/api/enviar-diagnostico.js
// y mismo patrón fetchImpl inyectable que el resto de la familia Almenara.
export function crearDatos({ supabaseUrl, serviceRoleKey, fetchImpl = fetch }) {
  const base = `${supabaseUrl}/rest/v1`;
  const headersBase = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json'
  };

  async function pedir(ruta, opciones = {}) {
    const resp = await fetchImpl(`${base}${ruta}`, {
      ...opciones,
      headers: { ...headersBase, ...(opciones.headers || {}) }
    });
    if (!resp.ok) {
      const detalle = await resp.text().catch(() => '');
      throw new Error(`Supabase respondió ${resp.status} en ${ruta}: ${detalle}`);
    }
    // Decidir por contenido, no por status code: PostgREST responde 201 con
    // body vacío en POST con Prefer: resolution=merge-duplicates (sin
    // return=representation), no 204 — mirar solo el status hacía que
    // resp.json() reventara con SyntaxError sobre un body vacío.
    const texto = await resp.text();
    return texto ? JSON.parse(texto) : null;
  }

  async function borrarEstado(chatId) {
    await pedir(`/bot_estado?chat_id=eq.${encodeURIComponent(chatId)}`, { method: 'DELETE' });
  }

  return {
    async obtenerAutorPorChatId(chatId) {
      const filas = await pedir(`/usuarios_bot?chat_id=eq.${encodeURIComponent(chatId)}&select=nombre`);
      return filas[0]?.nombre ?? null;
    },

    async buscarClientePorNombreNormalizado(nombreNormalizado) {
      // Comparación en JS, no en la query: normalizar (sin tildes,
      // minúsculas, espacios colapsados) no tiene equivalente directo en
      // PostgREST, y con el volumen esperado (decenas de clientes, no
      // miles) traer id+nombre y comparar acá es simple y suficiente.
      const filas = await pedir('/clientes?select=id,nombre,etapa');
      return filas.find((c) => normalizarNombre(c.nombre) === nombreNormalizado) ?? null;
    },

    async listarClientesRecientes(limite = 8) {
      return pedir(`/clientes?select=id,nombre,etapa,actualizado_en&order=actualizado_en.desc&limit=${limite}`);
    },

    async crearCliente({ nombre, rubro, etapa }) {
      const filas = await pedir('/clientes', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ nombre, rubro, etapa })
      });
      return filas[0];
    },

    async agregarNota({ clienteId, texto, autor }) {
      const filas = await pedir('/notas', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ cliente_id: clienteId, texto, autor })
      });
      await pedir(`/clientes?id=eq.${encodeURIComponent(clienteId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ actualizado_en: new Date().toISOString() })
      });
      return filas[0];
    },

    async leerEstado(chatId) {
      const filas = await pedir(`/bot_estado?chat_id=eq.${encodeURIComponent(chatId)}&select=paso,datos_parciales,actualizado_en`);
      const fila = filas[0];
      if (!fila) return null;
      const edadMs = Date.now() - new Date(fila.actualizado_en).getTime();
      if (edadMs > EXPIRACION_ESTADO_MS) {
        await borrarEstado(chatId);
        return null;
      }
      return { paso: fila.paso, datosParciales: fila.datos_parciales ?? {} };
    },

    async guardarEstado(chatId, paso, datosParciales) {
      await pedir('/bot_estado', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ chat_id: chatId, paso, datos_parciales: datosParciales, actualizado_en: new Date().toISOString() })
      });
    },

    borrarEstado
  };
}
