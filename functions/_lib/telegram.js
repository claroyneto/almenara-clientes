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
    }
  };
}
