// Helpers mínimos para hablarle a la API de Telegram — mismo patrón
// fetchImpl inyectable que Almenara_Registro/motor/src/canal/telegram.js.
export function crearTelegram({ token, fetchImpl = fetch }) {
  const base = `https://api.telegram.org/bot${token}`;

  async function llamar(metodo, cuerpo) {
    const resp = await fetchImpl(`${base}/${metodo}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo)
    });
    let datos;
    try {
      datos = await resp.json();
    } catch {
      datos = { ok: false, description: `respuesta no interpretable (HTTP ${resp.status})` };
    }
    if (resp.ok === false || datos?.ok === false) {
      console.error('Telegram rechazó la llamada:', metodo, datos?.description);
    }
    return datos;
  }

  return {
    async enviarMensaje(chatId, texto, botones) {
      const cuerpo = { chat_id: chatId, text: texto };
      if (botones?.length) {
        cuerpo.reply_markup = {
          inline_keyboard: botones.map((b) => [{ text: b.etiqueta, callback_data: b.valor }])
        };
      }
      await llamar('sendMessage', cuerpo);
    },
    async responderCallback(callbackId) {
      await llamar('answerCallbackQuery', { callback_query_id: callbackId });
    },
    // Solo para notas de voz por ahora, de ahí el mimeType fijo: Telegram
    // entrega toda nota de voz en OGG/Opus (mismo hecho ya documentado en
    // Almenara_Registro/motor y en el bot de Gastos_Casa). Devuelve un
    // ArrayBuffer (no un Buffer de Node) para que funcione igual en
    // bot.js (Node) y en functions/api/telegram-webhook.js (Cloudflare
    // Workers, sin Buffer global).
    async descargarArchivo(fileId) {
      const info = await llamar('getFile', { file_id: fileId });
      if (info?.ok === false || !info?.result?.file_path) {
        throw new Error(`No pude obtener el archivo ${fileId} de Telegram`);
      }
      const respuesta = await fetchImpl(`https://api.telegram.org/file/bot${token}/${info.result.file_path}`, {
        signal: AbortSignal.timeout(20_000)
      });
      if (!respuesta.ok) {
        throw new Error(`No pude descargar el archivo ${fileId} de Telegram (HTTP ${respuesta.status})`);
      }
      return { buffer: await respuesta.arrayBuffer(), mimeType: 'audio/ogg' };
    }
  };
}
