// Bot con polling (getUpdates) — pensado para correr como proceso
// persistente en un VPS (igual que Almenara_Registro/motor y
// fuegos-telegram-bot), no como función serverless. Reutiliza toda la
// lógica ya construida y probada en functions/_lib/ — solo cambia cómo
// llegan los updates de Telegram.
import 'dotenv/config';
import { crearDatos } from './functions/_lib/datos.js';
import { crearTelegram } from './functions/_lib/telegram.js';
import { crearTranscriptor } from './functions/_lib/whisper.js';
import { procesar } from './functions/_lib/procesar.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!TOKEN) {
  console.error('Falta la variable de entorno TELEGRAM_BOT_TOKEN.');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.');
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error('Falta la variable de entorno OPENAI_API_KEY (necesaria para transcribir notas de voz).');
  process.exit(1);
}

const datos = crearDatos({ supabaseUrl: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });
const telegram = crearTelegram({ token: TOKEN });
const transcriptor = crearTranscriptor({ apiKey: OPENAI_API_KEY });

async function transcribirVoz(fileId) {
  const archivo = await telegram.descargarArchivo(fileId);
  return transcriptor.transcribir(archivo.buffer, archivo.mimeType);
}

const BASE = `https://api.telegram.org/bot${TOKEN}`;
const ESPERA_TRAS_ERROR_MS = 3000;

async function escuchar() {
  let offset = 0;
  for (;;) {
    let respuesta;
    try {
      const resp = await fetch(`${BASE}/getUpdates?offset=${offset}&timeout=30`, {
        signal: AbortSignal.timeout(35_000)
      });
      respuesta = await resp.json();
    } catch (error) {
      console.error('Error consultando Telegram:', error.message);
      await new Promise((r) => setTimeout(r, ESPERA_TRAS_ERROR_MS));
      continue;
    }

    if (respuesta?.ok === false) {
      console.error('Telegram rechazó getUpdates:', respuesta.description);
      await new Promise((r) => setTimeout(r, ESPERA_TRAS_ERROR_MS));
      continue;
    }

    for (const update of respuesta.result ?? []) {
      offset = update.update_id + 1;
      try {
        await procesar(update, { datos, telegram, transcribirVoz });
      } catch (error) {
        console.error('Error procesando update de Telegram:', error);
      }
    }
  }
}

console.log('Bot de clientes Almenara corriendo (long polling)...');
escuchar();
