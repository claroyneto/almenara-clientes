// Entry point del Worker: enruta el webhook de Telegram a la lógica ya
// construida (functions/api/telegram-webhook.js, escrita en formato Pages
// Functions) y deja que todo lo demás lo sirva el binding de assets
// estáticos (index.html, cliente.html, css/, js/).
import { onRequestPost } from "./functions/api/telegram-webhook.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/telegram-webhook" && request.method === "POST") {
      return onRequestPost({ request, env });
    }
    return env.ASSETS.fetch(request);
  }
};
