import { crearDatos } from '../_lib/datos.js';
import { crearTelegram } from '../_lib/telegram.js';
import { procesar } from '../_lib/procesar.js';

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
