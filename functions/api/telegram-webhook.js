import { interpretarEntrada } from '../_lib/interpretarEntrada.js';
import { decidirAccion } from '../_lib/comandos.js';
import { crearDatos } from '../_lib/datos.js';
import { crearTelegram } from '../_lib/telegram.js';
import { normalizarNombre } from '../_lib/normalizarNombre.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  // Protege el webhook (spec §7): Telegram manda este header con el
  // secret_token configurado al registrar el webhook (ver Task 10). Sin
  // esto, cualquiera que descubra la URL podría mandar datos falsos.
  const secretRecibido = request.headers.get('x-telegram-bot-api-secret-token');
  if (secretRecibido !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('no autorizado', { status: 401 });
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return new Response('ok', { status: 200 }); // update ilegible: se ignora
  }

  const datos = crearDatos({ supabaseUrl: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
  const telegram = crearTelegram({ token: env.TELEGRAM_BOT_TOKEN });

  try {
    await procesar(update, { datos, telegram });
  } catch (error) {
    // Siempre 200 (spec §7): un error interno no debe hacer que Telegram
    // reintregue el mismo update — eso duplicaría el procesamiento, mismo
    // tipo de bug ya corregido en Registro por chat (offset no persistido).
    console.error('Error procesando update de Telegram:', error);
  }

  return new Response('ok', { status: 200 });
}

async function procesar(update, { datos, telegram }) {
  const entrada = interpretarEntrada(update);
  if (!entrada) return;

  if (update.callback_query) {
    await telegram.responderCallback(update.callback_query.id);
  }

  const autor = await datos.obtenerAutorPorChatId(entrada.chatId);
  if (!autor) {
    await telegram.enviarMensaje(entrada.chatId, 'No estás autorizado para usar este bot.');
    return;
  }

  const estado = await datos.leerEstado(entrada.chatId);

  let clienteDuplicado = null;
  const pasoBuscaCliente = estado?.paso === 'nuevo_nombre' || estado?.paso === 'nota_buscar_cliente';
  if (entrada.tipo === 'texto' && pasoBuscaCliente) {
    clienteDuplicado = await datos.buscarClientePorNombreNormalizado(normalizarNombre(entrada.valor));
  }

  const necesitaListaClientes = entrada.tipo === 'comando' && (entrada.valor === '/nota' || entrada.valor === '/clientes');
  const clientesRecientes = necesitaListaClientes ? await datos.listarClientesRecientes(50) : undefined;

  const accion = decidirAccion({ entrada, estado, clienteDuplicado, clientesRecientes });

  if (accion.guardarCliente) await datos.crearCliente(accion.guardarCliente);
  if (accion.guardarNota) await datos.agregarNota({ ...accion.guardarNota, autor });
  if (accion.nuevoEstado) {
    await datos.guardarEstado(entrada.chatId, accion.nuevoEstado.paso, accion.nuevoEstado.datosParciales);
  } else if (accion.cancelarEstado) {
    await datos.borrarEstado(entrada.chatId);
  }

  if (accion.respuesta) {
    await telegram.enviarMensaje(entrada.chatId, accion.respuesta.texto, accion.respuesta.botones);
  }
}
