// Traduce un update crudo de Telegram a una forma simple, mismo patrón que
// normalizar() en Almenara_Registro/motor/src/canal/telegram.js.
export function interpretarEntrada(update) {
  if (update.callback_query) {
    const cq = update.callback_query;
    return {
      chatId: String(cq.message.chat.id),
      tipo: 'boton',
      valor: cq.data,
      callbackId: cq.id
    };
  }

  const mensaje = update.message;
  if (!mensaje || typeof mensaje.text !== 'string') return null;

  const texto = mensaje.text.trim();
  if (texto.startsWith('/')) {
    return {
      chatId: String(mensaje.chat.id),
      tipo: 'comando',
      valor: texto.split(/\s+/)[0].toLowerCase()
    };
  }

  return { chatId: String(mensaje.chat.id), tipo: 'texto', valor: texto };
}
