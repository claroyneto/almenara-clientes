# Bot de clientes (`almenara_clientes_bot`) — Diseño

**Estado:** aprobado en brainstorming, sin plan de implementación todavía.

**Contexto:** Jorge lleva el trabajo comercial de Almenara (prospección, reuniones, seguimiento — ver división de tareas Carolina/Jorge). Hoy esa información vive donde sea que Jorge la anote, sin quedar consolidada en un lugar que Carolina también pueda ver. La idea: un bot de Telegram donde Jorge registra clientes/prospectos y notas de reunión sobre la marcha, con todo consolidado en una página web que ambos pueden ver al mismo tiempo.

Esto es infraestructura **propia de Almenara** (herramienta comercial interna), no una herramienta para un cliente — a diferencia del resto de la familia (Registro por chat, Planificación, Horas), que se construyen para negocios de terceros.

## 1. Alcance decidido

- **Ficha por cliente + historial de notas.** Cada cliente/prospecto es una entidad con datos fijos (nombre, rubro, etapa); cada reunión o avance se agrega como una nota con fecha, enganchada a esa ficha.
- **Vista compartida: página web propia**, no una planilla — mini-CRM simple con login para Carolina y Jorge.
- **Campos de la ficha, deliberadamente mínimos**: nombre, rubro, etapa del embudo (prospecto/diagnóstico/cliente/descartado). Sin contacto ni "cómo llegó" por ahora — se agrega después si hace falta.
- **Las notas son texto libre**: ahí van juntos el apunte de la reunión y el siguiente paso, tal como Jorge ya lo escribe hoy. No se separa "siguiente paso" como campo aparte — agregaría fricción a algo que hoy es una frase rápida en el chat.

### Fuera de alcance (declarado a propósito)

- Recordatorios automáticos de seguimiento.
- Exportar a Excel/PDF.
- Conexión automática con el Diagnóstico Operacional (aunque comparten el concepto de "prospecto", quedan como sistemas separados por ahora).
- Más de dos personas con acceso (si se suma alguien, se agrega a mano en Supabase).

## 2. Por qué no se reutiliza el motor de Registro por chat

`Almenara_Registro/motor` ya es un bot de Telegram configurable, pero su modelo de datos (registros/movimientos/faenas estructurados, catálogos de producto/cuartel/máquina) está pensado para operación de campo con opciones cerradas — no para texto libre de reuniones ni para el concepto de "ficha de cliente" con etapa de embudo. Forzar este caso de uso dentro de ese motor significaría más trabajo de adaptación que construir algo chico y enfocado desde cero. **Decisión: proyecto nuevo, separado.**

## 3. Arquitectura

Tres piezas nuevas, sin infraestructura compartida con ningún cliente:

- **Bot de Telegram** (`almenara_clientes_bot`, se crea con BotFather), configurado con **webhook** — no polling. Telegram le entrega cada mensaje a una URL en vez de que el bot tenga que consultar todo el tiempo.
- **Función serverless en Cloudflare Pages** (`functions/api/telegram-webhook.js`, mismo patrón ya probado en `Almenara_Web/functions/api/enviar-diagnostico.js`: runtime edge, `export async function onRequestPost(context)`, sin build ni dependencias de npm) que recibe el webhook, interpreta el mensaje y escribe a la base de datos. Sin proceso persistente que mantener corriendo — evita a propósito el problema de hosting 24/7 (Railway/Render) que ya complicó el despliegue del bot de Horas.
- **Supabase nuevo y dedicado** (proyecto propio de Almenara, no el de ningún cliente), con RLS restringido a los correos de Carolina y Jorge.
- **Página web** (HTML/JS plano, mismo sitio Cloudflare Pages, sin build step — mismo criterio que ya usa el resto de `Almenara_Web`) que lee de ese Supabase con el cliente JS oficial cargado por CDN: login con magic link, lista de clientes, ficha con historial de notas.

## 4. Modelo de datos

```
clientes
  id, nombre, rubro, etapa ('prospecto'|'diagnostico'|'cliente'|'descartado'),
  creado_en, actualizado_en

notas
  id, cliente_id, texto, autor ('Carolina'|'Jorge'), creado_en

usuarios_bot
  chat_id, nombre               -- solo 2 filas: quién puede hablarle al bot

bot_estado
  chat_id (pk), paso, datos_parciales (jsonb), actualizado_en
  -- memoria de conversación pendiente; ver §5, por qué existe
```

## 5. Flujo de conversación del bot

Como el bot corre por webhook (sin proceso vivo entre mensajes), no puede recordar en memoria qué le preguntó a alguien hace un minuto — a diferencia de Registro por chat, cuyo proceso nunca se apaga. Esa memoria de conversación pendiente se guarda en `bot_estado`.

**Acceso**: el bot solo responde a los `chat_id` de `usuarios_bot`. Cualquier otra persona recibe "no autorizado" y nada se guarda — mismo patrón que ya usa Horas con `telegram_usuarios`.

**Comandos:**

- **`/start`** — saludo y ayuda.
- **`/nuevo`** — pregunta nombre → rubro → etapa (botones). Antes de guardar, compara el nombre escrito contra los clientes existentes normalizando (minúsculas, sin tildes, sin espacios de más — mismo criterio que ya usa `matchVoz.js` en Registro por chat). Si hay coincidencia exacta normalizada:
  > "Ya existe un cliente llamado **X** (etapa: Y). ¿Es el mismo? [Sí, es el mismo] [No, es otro distinto]"
  - Si es el mismo, lo manda directo al flujo de `/nota` con ese cliente ya elegido — no se pierde lo que iba a escribir.
  - Si es otro, se crea la ficha nueva.
  - Si el nombre no calza exacto con nada (aunque "se parezca"), no se pregunta nada — se crea directo. Nunca se adivina un parecido para no bloquear clientes distintos con nombres similares.
- **`/nota`** — muestra botones con los clientes más recientes (o pide escribir el nombre si hay muchos) → pide el texto de la nota → guarda con el autor (resuelto desde `usuarios_bot` por `chat_id`).
- **`/clientes`** — lista compacta ordenada por actividad reciente: nombre, etapa, fecha de la última nota.
- **`/cancelar`** — aborta cualquier flujo pendiente (`/nuevo` o `/nota` a medio completar).
- Un texto suelto sin comando activo y sin `bot_estado` pendiente no se interpreta a adivinas — el bot responde sugiriendo `/nota` o `/nuevo`.
- Un `bot_estado` pendiente que nadie retoma expira solo después de un rato — no queda trabado esperando una respuesta que nunca llega.

## 6. Página web

- **Login**: magic link de Supabase, acceso restringido por RLS solo a los correos de Carolina y Jorge.
- **Vista principal**: lista de clientes con buscador y filtro por etapa, ordenada por actividad reciente (fecha de la última nota).
- **Ficha de cliente**: nombre/rubro/etapa (editables también desde acá, no solo desde el bot) + historial de notas en orden cronológico.

Sin reportes ni gráficos — no se pidió y sería agregar alcance de más.

## 7. Manejo de errores y seguridad

- **El webhook siempre responde 200 OK rápido a Telegram**, incluso si algo falla adentro (se loggea el error y se le manda a la persona un mensaje de "tuve un problema, intenta de nuevo"). Sin esto, Telegram reintenta la entrega y se puede terminar duplicando notas — el mismo tipo de bug que se corrigió recientemente en Registro por chat (offset no persistido); acá se diseña bien desde el principio.
- **La URL del webhook es pública** (así funciona un endpoint de Cloudflare Pages Functions) y se protege con un token secreto que Telegram manda en cada request (`secret_token` de la API de Telegram) — sin esto, cualquiera que descubra la URL podría mandar datos falsos al CRM.
- Ningún dato de clientes de terceros pasa por acá — es información comercial propia de Almenara sobre sus propios prospectos/clientes.

## 8. Próximo paso

Con el diseño aprobado, sigue el plan de implementación (`writing-plans`) — creación del proyecto Supabase, el bot en BotFather, la función serverless y la página web.
