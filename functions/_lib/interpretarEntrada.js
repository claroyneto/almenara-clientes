// Traduce un update crudo de Telegram a una forma simple, mismo patrón que
// normalizar() en Almenara_Registro/motor/src/canal/telegram.js.
export function interpretarEntrada(update) {
  if (update.callback_query) {
    const cq = update.callback_query;
    if (!cq.message?.chat?.id) return null;
    return {
      chatId: String(cq.message.chat.id),
      tipo: 'boton',
      valor: cq.data,
      callbackId: cq.id
    };
  }

  const mensaje = update.message;
  if (!mensaje) return null;

  // La transcripción (I/O real, requiere Whisper) vive en procesar.js, no
  // acá: interpretarEntrada() se mantiene puro y sincrónico, como el resto
  // de sus casos. procesar.js transcribe y sustituye esta entrada por una
  // de tipo 'texto' antes de tocar la máquina de estados.
  if (mensaje.voice) {
    return { chatId: String(mensaje.chat.id), tipo: 'voz', valor: mensaje.voice.file_id };
  }

  if (typeof mensaje.text !== 'string') return null;

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
