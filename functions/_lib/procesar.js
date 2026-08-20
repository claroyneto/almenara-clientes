import { interpretarEntrada } from "./interpretarEntrada.js";
import { decidirAccion } from "./comandos.js";
import { normalizarNombre } from "./normalizarNombre.js";

// Orquesta un update de Telegram ya interpretado contra la lógica de
// negocio (comandos.js) y los datos (datos.js/telegram.js) — agnóstico de
// cómo llegó el update (webhook o polling), por eso vive separado de
// functions/api/telegram-webhook.js y de bot.js, y ambos lo reutilizan.
export async function procesar(update, { datos, telegram, transcribirVoz }) {
  let entrada = interpretarEntrada(update);
  if (!entrada) return;

  if (update.callback_query) {
    await telegram.responderCallback(update.callback_query.id);
  }

  const autor = await datos.obtenerAutorPorChatId(entrada.chatId);
  if (!autor) {
    await telegram.enviarMensaje(entrada.chatId, "No estás autorizado para usar este bot.");
    return;
  }

  // Transcribir y listo: de acá para abajo, una nota de voz recorre
  // exactamente la misma máquina de estados que un mensaje escrito -- sirve
  // para crear un cliente, agregar una nota, o cualquier paso, sin lógica
  // de negocio nueva.
  if (entrada.tipo === "voz") {
    let texto;
    try {
      texto = await transcribirVoz(entrada.valor);
    } catch (error) {
      console.error("No se pudo transcribir la nota de voz:", error.message);
      await telegram.enviarMensaje(entrada.chatId, "No pude entender ese audio. ¿Puedes escribirlo?");
      return;
    }
    entrada = { ...entrada, tipo: "texto", valor: texto };
  }

  const estado = await datos.leerEstado(entrada.chatId);

  let clienteDuplicado = null;
  const pasoBuscaCliente = estado?.paso === "nuevo_nombre" || estado?.paso === "nota_buscar_cliente";
  if (entrada.tipo === "texto" && pasoBuscaCliente) {
    clienteDuplicado = await datos.buscarClientePorNombreNormalizado(normalizarNombre(entrada.valor));
  }

  const necesitaListaClientes = entrada.tipo === "comando" && (entrada.valor === "/nota" || entrada.valor === "/clientes");
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
