// Mismo patrón ya probado en Almenara_Registro/motor y en el bot de
// Gastos_Casa -- se copia acá en vez de compartirlo como paquete porque
// cada bot de la familia Almenara es deliberadamente cero-dependencias
// entre sí, sin un monorepo ni un paquete privado npm de por medio.
const URL_TRANSCRIPCIONES = 'https://api.openai.com/v1/audio/transcriptions';

export function crearTranscriptor({ apiKey, fetchImpl = fetch }) {
  async function transcribir(buffer, mimeType) {
    // Telegram entrega toda nota de voz en OGG/Opus -- un mimeType distinto
    // se rechaza acá con un mensaje claro, en vez de mandarle a Whisper un
    // archivo que igual va a rechazar, pero con un error genérico mucho
    // más difícil de diagnosticar.
    if (mimeType !== 'audio/ogg') {
      throw new Error(`Formato de audio no soportado: ${mimeType}`);
    }
    const formulario = new FormData();
    formulario.append('file', new Blob([buffer], { type: mimeType }), 'audio.ogg');
    formulario.append('model', 'whisper-1');
    formulario.append('language', 'es');

    // Sin timeout, un audio o una red colgada dejaba la llamada esperando
    // para siempre -- y como el bot procesa un mensaje a la vez, eso
    // congelaba el bot para las dos personas, no solo para quien mandó el
    // audio problemático.
    const respuesta = await fetchImpl(URL_TRANSCRIPCIONES, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      body: formulario,
      signal: AbortSignal.timeout(20_000)
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      throw new Error(`Whisper rechazó la transcripción (HTTP ${respuesta.status}): ${detalle}`);
    }

    const datos = await respuesta.json();
    return datos.text ?? '';
  }

  return { transcribir };
}
