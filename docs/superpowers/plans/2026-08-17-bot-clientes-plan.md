# Bot de clientes (`almenara_clientes_bot`) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bot de Telegram (webhook) + Supabase + página web para que Jorge registre clientes/prospectos y notas de reunión, consolidado en una vista que Jorge y Carolina ven al mismo tiempo.

**Architecture:** Cloudflare Pages Functions (edge, sin proceso 24/7) recibe el webhook de Telegram, decide qué hacer con lógica pura y testeable, y lee/escribe un Supabase dedicado vía REST (`fetch` directo a PostgREST, sin SDK — mismo patrón `fetchImpl` inyectable ya usado en `Almenara_Registro/motor`). La página web (HTML/JS plano, sin build) usa el cliente oficial `@supabase/supabase-js` por CDN para login con magic link y lectura/edición protegida por RLS.

**Tech Stack:** JavaScript (ES modules), Cloudflare Pages Functions, Supabase (Postgres + Auth + RLS), `node:test` para pruebas locales, sin dependencias de npm.

**Spec:** `Almenara_Clientes/docs/superpowers/specs/2026-08-17-bot-clientes-design.md`

## Global Constraints

- Sin proceso 24/7 (webhook, no polling) — decisión explícita del spec §3 para evitar el problema de hosting que complicó el bot de Horas.
- Cloudflare Pages Functions (no Vercel) — la plataforma real que ya usa `Almenara_Web`.
- Cero dependencias de npm en `functions/` — mismo criterio que `Almenara_Web/functions/api/enviar-diagnostico.js` (solo `fetch` nativo, compatible con el runtime edge).
- El webhook siempre responde `200 OK`, incluso ante error interno — spec §7, evita que Telegram reintente y duplique procesamiento.
- La URL del webhook se protege con un token secreto (`secret_token` de Telegram) — spec §7.
- Nombres de cliente se comparan por coincidencia exacta normalizada (sin tildes, minúsculas, espacios colapsados) — nunca por parecido — spec §5.
- Supabase nuevo y dedicado, separado de cualquier proyecto de cliente — spec §3.
- Acceso a la página web restringido por RLS solo a los correos de Carolina y Jorge — spec §6.

---

## Task 1: Infraestructura — Supabase, BotFather, esqueleto del repo

Sin este paso nada más funciona: crea el proyecto Supabase, aplica el schema, crea el bot de Telegram y deja el repo listo para el resto de las tareas. No es código de aplicación — son pasos manuales con contenido exacto para copiar/pegar.

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `docs/schema.sql`
- Create: `docs/DEPLOY.md` (checklist de este task, para volver a consultarlo)

**Interfaces:**
- Produce: las 4 tablas (`clientes`, `notas`, `usuarios_bot`, `bot_estado`) y la tabla `usuarios_autorizados` que las Tasks 5-10 asumen que existen.

- [ ] **Paso 1: Crear el proyecto Supabase**

En [supabase.com](https://supabase.com) → "New project". Nombre sugerido: `almenara-clientes`. Guardar en un lugar seguro (nunca en el repo):
- `SUPABASE_URL` (Project Settings → API → Project URL)
- `SUPABASE_ANON_KEY` (Project Settings → API → `anon` `public`)
- `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API → `service_role` `secret` — acceso total a la base, tratarla como una contraseña de administrador)

- [ ] **Paso 2: Escribir el schema SQL**

Crear `docs/schema.sql`:

```sql
-- ============================================================================
-- Schema — Bot de clientes Almenara
-- CÓMO EJECUTARLO: Supabase Studio → SQL Editor → pegar completo → Run.
-- Idempotente.
-- ============================================================================

create table if not exists public.usuarios_autorizados (
  email text primary key
);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  rubro text,
  etapa text not null default 'prospecto'
    check (etapa in ('prospecto','diagnostico','cliente','descartado')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.notas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  texto text not null,
  autor text not null,
  creado_en timestamptz not null default now()
);

-- Solo 2 filas esperadas: quién puede hablarle al bot (ver spec §5).
create table if not exists public.usuarios_bot (
  chat_id text primary key,
  nombre text not null
);

-- Memoria de conversación pendiente del bot (ver spec §5 — necesaria
-- porque el webhook no tiene proceso vivo entre mensajes).
create table if not exists public.bot_estado (
  chat_id text primary key,
  paso text not null,
  datos_parciales jsonb not null default '{}'::jsonb,
  actualizado_en timestamptz not null default now()
);

alter table public.clientes enable row level security;
alter table public.notas enable row level security;
-- usuarios_bot y bot_estado: solo los toca la función del bot con la
-- service_role key (bypasea RLS). RLS habilitado sin políticas para
-- 'authenticated' deniega todo desde la página web, que es lo correcto.
alter table public.usuarios_bot enable row level security;
alter table public.bot_estado enable row level security;

drop policy if exists clientes_select on public.clientes;
create policy clientes_select on public.clientes for select to authenticated
  using (exists (select 1 from public.usuarios_autorizados u where u.email = auth.jwt()->>'email'));

drop policy if exists clientes_insert on public.clientes;
create policy clientes_insert on public.clientes for insert to authenticated
  with check (exists (select 1 from public.usuarios_autorizados u where u.email = auth.jwt()->>'email'));

drop policy if exists clientes_update on public.clientes;
create policy clientes_update on public.clientes for update to authenticated
  using (exists (select 1 from public.usuarios_autorizados u where u.email = auth.jwt()->>'email'))
  with check (exists (select 1 from public.usuarios_autorizados u where u.email = auth.jwt()->>'email'));

drop policy if exists notas_select on public.notas;
create policy notas_select on public.notas for select to authenticated
  using (exists (select 1 from public.usuarios_autorizados u where u.email = auth.jwt()->>'email'));

drop policy if exists notas_insert on public.notas;
create policy notas_insert on public.notas for insert to authenticated
  with check (exists (select 1 from public.usuarios_autorizados u where u.email = auth.jwt()->>'email'));

comment on table public.clientes is 'Clientes/prospectos comerciales de Almenara — no de un cliente de terceros.';
```

- [ ] **Paso 3: Ejecutar el schema**

Supabase Studio → SQL Editor → pegar el contenido completo de `docs/schema.sql` → Run. Verificar en Table Editor que las 5 tablas existan.

- [ ] **Paso 4: Cargar los usuarios autorizados**

Table Editor → `usuarios_autorizados` → Insert row, dos veces: el correo de Carolina y el de Jorge (los que usarán para el magic link de la página web).

- [ ] **Paso 5: Crear el bot en Telegram**

En Telegram, abrir `@BotFather` → `/newbot` → nombre visible (ej. "Almenara Clientes") → username terminado en `bot` (ej. `almenara_clientes_bot`). Guardar el `TELEGRAM_BOT_TOKEN` que entrega (nunca commitear).

- [ ] **Paso 6: Vincular a Carolina y Jorge en `usuarios_bot`**

Cada uno le escribe `/start` al bot (todavía no va a responder nada útil — recién se conecta en Task 7 — pero Telegram igual entrega el chat en algún punto de la app oficial, o se puede usar [@userinfobot](https://t.me/userinfobot) para obtener el `chat_id` sin depender de este bot). Con esos números, Table Editor → `usuarios_bot` → Insert row: `chat_id` (el número), `nombre` (`Carolina` o `Jorge`).

- [ ] **Paso 7: Esqueleto del repo**

`package.json`:

```json
{
  "name": "almenara-clientes",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test --test-force-exit"
  }
}
```

`.gitignore`:

```
node_modules/
.env
```

- [ ] **Paso 8: Commit**

```bash
git add package.json .gitignore docs/schema.sql
git commit -m "infra: schema de Supabase y esqueleto del repo"
```

---

## Task 2: `normalizarNombre` — comparación determinística de nombres

**Files:**
- Create: `functions/_lib/normalizarNombre.js`
- Test: `test/normalizarNombre.test.js`

**Interfaces:**
- Produce: `normalizarNombre(texto: string) => string` — usado por Task 5 (`datos.js`) y por el flujo de `/nuevo` (Task 6/7).

- [ ] **Paso 1: Escribir el test que falla**

`test/normalizarNombre.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarNombre } from '../functions/_lib/normalizarNombre.js';

test('minúsculas, sin tildes, espacios colapsados', () => {
  assert.equal(normalizarNombre('  Fuégos   Del  Sur '), 'fuegos del sur');
});

test('nombres distintos no normalizan igual', () => {
  assert.notEqual(normalizarNombre('Fuegos del Sur'), normalizarNombre('Fuegos del Norte'));
});

test('nombres iguales salvo formato normalizan igual', () => {
  assert.equal(normalizarNombre('FUEGOS DEL SUR'), normalizarNombre('fuegos del sur'));
});

test('tolera null/undefined en vez de reventar', () => {
  assert.equal(normalizarNombre(null), '');
  assert.equal(normalizarNombre(undefined), '');
});
```

- [ ] **Paso 2: Correr el test y verificar que falla**

Run: `node --test test/normalizarNombre.test.js`
Expected: FAIL — `Cannot find module '../functions/_lib/normalizarNombre.js'`

- [ ] **Paso 3: Implementar**

`functions/_lib/normalizarNombre.js`:

```js
// Normaliza un nombre de cliente para compararlo de forma determinística:
// minúsculas, sin tildes, sin espacios de más. Mismo criterio que ya usa
// normalizar() en Almenara_Registro/motor/src/dominio/matchVoz.js — nunca
// se compara por "parecido" (fuzzy): solo coincidencia exacta normalizada,
// para no bloquear clientes distintos con nombres similares (spec §5).
export function normalizarNombre(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
```

- [ ] **Paso 4: Correr el test y verificar que pasa**

Run: `node --test test/normalizarNombre.test.js`
Expected: PASS (4 tests)

- [ ] **Paso 5: Commit**

```bash
git add functions/_lib/normalizarNombre.js test/normalizarNombre.test.js
git commit -m "feat: normalizarNombre para comparación determinística de clientes"
```

---

## Task 3: `interpretarEntrada` — traducir el update crudo de Telegram

**Files:**
- Create: `functions/_lib/interpretarEntrada.js`
- Test: `test/interpretarEntrada.test.js`

**Interfaces:**
- Produce: `interpretarEntrada(update: object) => { chatId: string, tipo: 'comando'|'texto'|'boton', valor: string, callbackId?: string } | null`. Usado por Task 7 (`telegram-webhook.js`) y por los tests de Task 6 (`comandos.js`) como forma de referencia de `entrada`.

- [ ] **Paso 1: Escribir el test que falla**

`test/interpretarEntrada.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretarEntrada } from '../functions/_lib/interpretarEntrada.js';

test('un mensaje de texto normal se interpreta como tipo texto', () => {
  const entrada = interpretarEntrada({ message: { chat: { id: 42 }, text: 'Reunión buena, pidió cotización' } });
  assert.deepEqual(entrada, { chatId: '42', tipo: 'texto', valor: 'Reunión buena, pidió cotización' });
});

test('un mensaje que empieza con / se interpreta como comando, en minúsculas', () => {
  const entrada = interpretarEntrada({ message: { chat: { id: 42 }, text: '/Nuevo' } });
  assert.deepEqual(entrada, { chatId: '42', tipo: 'comando', valor: '/nuevo' });
});

test('un comando con texto extra solo toma la palabra del comando', () => {
  const entrada = interpretarEntrada({ message: { chat: { id: 42 }, text: '/nota algo extra' } });
  assert.equal(entrada.valor, '/nota');
});

test('un callback_query se interpreta como tipo boton, con callbackId', () => {
  const entrada = interpretarEntrada({
    callback_query: { id: 'cb1', data: 'etapa:prospecto', message: { chat: { id: 42 } } }
  });
  assert.deepEqual(entrada, { chatId: '42', tipo: 'boton', valor: 'etapa:prospecto', callbackId: 'cb1' });
});

test('un update sin mensaje de texto ni callback devuelve null', () => {
  assert.equal(interpretarEntrada({ message: { chat: { id: 42 }, photo: [] } }), null);
  assert.equal(interpretarEntrada({}), null);
});
```

- [ ] **Paso 2: Correr el test y verificar que falla**

Run: `node --test test/interpretarEntrada.test.js`
Expected: FAIL — módulo no existe

- [ ] **Paso 3: Implementar**

`functions/_lib/interpretarEntrada.js`:

```js
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
```

- [ ] **Paso 4: Correr el test y verificar que pasa**

Run: `node --test test/interpretarEntrada.test.js`
Expected: PASS (5 tests)

- [ ] **Paso 5: Commit**

```bash
git add functions/_lib/interpretarEntrada.js test/interpretarEntrada.test.js
git commit -m "feat: interpretarEntrada para traducir updates de Telegram"
```

---

## Task 4: `telegram.js` — helpers para hablarle a la API de Telegram

**Files:**
- Create: `functions/_lib/telegram.js`
- Test: `test/telegram.test.js`

**Interfaces:**
- Produce: `crearTelegram({ token, fetchImpl? }) => { enviarMensaje(chatId, texto, botones?), responderCallback(callbackId) }`. Usado por Task 7.

- [ ] **Paso 1: Escribir el test que falla**

`test/telegram.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearTelegram } from '../functions/_lib/telegram.js';

function fetchFalso() {
  const llamadas = [];
  const impl = async (url, opciones) => {
    llamadas.push({ url, cuerpo: JSON.parse(opciones.body) });
    return { ok: true, json: async () => ({ ok: true }) };
  };
  impl.llamadas = llamadas;
  return impl;
}

test('enviarMensaje sin botones manda solo texto', async () => {
  const fetchImpl = fetchFalso();
  const telegram = crearTelegram({ token: 't', fetchImpl });
  await telegram.enviarMensaje('42', 'hola');
  assert.equal(fetchImpl.llamadas[0].url, 'https://api.telegram.org/bott/sendMessage');
  assert.deepEqual(fetchImpl.llamadas[0].cuerpo, { chat_id: '42', text: 'hola' });
});

test('enviarMensaje con botones arma el teclado inline', async () => {
  const fetchImpl = fetchFalso();
  const telegram = crearTelegram({ token: 't', fetchImpl });
  await telegram.enviarMensaje('42', '¿Cuál?', [{ etiqueta: 'Sí', valor: 'si' }, { etiqueta: 'No', valor: 'no' }]);
  assert.deepEqual(fetchImpl.llamadas[0].cuerpo.reply_markup, {
    inline_keyboard: [[{ text: 'Sí', callback_data: 'si' }], [{ text: 'No', callback_data: 'no' }]]
  });
});

test('responderCallback llama answerCallbackQuery con el id', async () => {
  const fetchImpl = fetchFalso();
  const telegram = crearTelegram({ token: 't', fetchImpl });
  await telegram.responderCallback('cb1');
  assert.equal(fetchImpl.llamadas[0].url, 'https://api.telegram.org/bott/answerCallbackQuery');
  assert.deepEqual(fetchImpl.llamadas[0].cuerpo, { callback_query_id: 'cb1' });
});

test('un rechazo de Telegram se registra en vez de tragarse en silencio', async () => {
  const original = console.error;
  const errores = [];
  console.error = (...args) => errores.push(args.join(' '));
  try {
    const fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({ ok: false, description: 'Bad Request' }) });
    const telegram = crearTelegram({ token: 't', fetchImpl });
    await telegram.enviarMensaje('42', 'hola');
  } finally {
    console.error = original;
  }
  assert.match(errores.join(' | '), /Bad Request/);
});
```

- [ ] **Paso 2: Correr el test y verificar que falla**

Run: `node --test test/telegram.test.js`
Expected: FAIL — módulo no existe

- [ ] **Paso 3: Implementar**

`functions/_lib/telegram.js`:

```js
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
```

- [ ] **Paso 4: Correr el test y verificar que pasa**

Run: `node --test test/telegram.test.js`
Expected: PASS (4 tests)

- [ ] **Paso 5: Commit**

```bash
git add functions/_lib/telegram.js test/telegram.test.js
git commit -m "feat: helpers de Telegram (enviarMensaje, responderCallback)"
```

---

## Task 5: `datos.js` — acceso a Supabase vía REST (PostgREST)

**Files:**
- Create: `functions/_lib/datos.js`
- Test: `test/datos.test.js`

**Interfaces:**
- Consume: `normalizarNombre` de Task 2.
- Produce: `crearDatos({ supabaseUrl, serviceRoleKey, fetchImpl? }) => { obtenerAutorPorChatId, buscarClientePorNombreNormalizado, listarClientesRecientes, crearCliente, agregarNota, leerEstado, guardarEstado, borrarEstado }`. Usado por Task 7.

- [ ] **Paso 1: Escribir el test que falla**

`test/datos.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearDatos } from '../functions/_lib/datos.js';

function fetchFalso(respuestas) {
  const llamadas = [];
  const impl = async (url, opciones = {}) => {
    llamadas.push({ url, metodo: opciones.method || 'GET', cuerpo: opciones.body ? JSON.parse(opciones.body) : null });
    const siguiente = respuestas.shift() ?? { status: 200, body: [] };
    return {
      ok: siguiente.status < 300,
      status: siguiente.status,
      json: async () => siguiente.body,
      text: async () => JSON.stringify(siguiente.body)
    };
  };
  impl.llamadas = llamadas;
  return impl;
}

test('obtenerAutorPorChatId devuelve el nombre si el chat_id está autorizado', async () => {
  const fetchImpl = fetchFalso([{ status: 200, body: [{ nombre: 'Jorge' }] }]);
  const datos = crearDatos({ supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'k', fetchImpl });
  assert.equal(await datos.obtenerAutorPorChatId('42'), 'Jorge');
});

test('obtenerAutorPorChatId devuelve null si no está autorizado', async () => {
  const fetchImpl = fetchFalso([{ status: 200, body: [] }]);
  const datos = crearDatos({ supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'k', fetchImpl });
  assert.equal(await datos.obtenerAutorPorChatId('999'), null);
});

test('buscarClientePorNombreNormalizado compara normalizado, no literal', async () => {
  const fetchImpl = fetchFalso([{ status: 200, body: [
    { id: '1', nombre: 'Fuégos del Sur', etapa: 'cliente' },
    { id: '2', nombre: 'Otro', etapa: 'prospecto' }
  ] }]);
  const datos = crearDatos({ supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'k', fetchImpl });
  const encontrado = await datos.buscarClientePorNombreNormalizado('fuegos del sur');
  assert.equal(encontrado.id, '1');
});

test('buscarClientePorNombreNormalizado devuelve null si no hay coincidencia exacta', async () => {
  const fetchImpl = fetchFalso([{ status: 200, body: [{ id: '1', nombre: 'Fuegos del Sur', etapa: 'cliente' }] }]);
  const datos = crearDatos({ supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'k', fetchImpl });
  assert.equal(await datos.buscarClientePorNombreNormalizado('fuegos del norte'), null);
});

test('crearCliente manda POST a /clientes con el cuerpo correcto', async () => {
  const fetchImpl = fetchFalso([{ status: 201, body: [{ id: '9', nombre: 'X', rubro: 'Agro', etapa: 'prospecto' }] }]);
  const datos = crearDatos({ supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'k', fetchImpl });
  const fila = await datos.crearCliente({ nombre: 'X', rubro: 'Agro', etapa: 'prospecto' });
  assert.equal(fetchImpl.llamadas[0].metodo, 'POST');
  assert.match(fetchImpl.llamadas[0].url, /\/clientes$/);
  assert.deepEqual(fetchImpl.llamadas[0].cuerpo, { nombre: 'X', rubro: 'Agro', etapa: 'prospecto' });
  assert.equal(fila.id, '9');
});

test('agregarNota inserta la nota y actualiza actualizado_en del cliente', async () => {
  const fetchImpl = fetchFalso([
    { status: 201, body: [{ id: 'n1', cliente_id: 'c1', texto: 'reunión', autor: 'Jorge' }] },
    { status: 204, body: null }
  ]);
  const datos = crearDatos({ supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'k', fetchImpl });
  await datos.agregarNota({ clienteId: 'c1', texto: 'reunión', autor: 'Jorge' });
  assert.match(fetchImpl.llamadas[0].url, /\/notas$/);
  assert.match(fetchImpl.llamadas[1].url, /\/clientes\?id=eq\.c1/);
  assert.equal(fetchImpl.llamadas[1].metodo, 'PATCH');
});

test('leerEstado devuelve null y borra la fila si el estado expiró', async () => {
  const fetchImpl = fetchFalso([
    { status: 200, body: [{ paso: 'nuevo_nombre', datos_parciales: {}, actualizado_en: '2020-01-01T00:00:00Z' }] },
    { status: 204, body: null } // el DELETE de borrarEstado
  ]);
  const datos = crearDatos({ supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'k', fetchImpl });
  const estado = await datos.leerEstado('42');
  assert.equal(estado, null);
  assert.equal(fetchImpl.llamadas[1].metodo, 'DELETE');
});

test('leerEstado devuelve el paso y datosParciales si no expiró', async () => {
  const reciente = new Date().toISOString();
  const fetchImpl = fetchFalso([{ status: 200, body: [{ paso: 'nuevo_rubro', datos_parciales: { nombre: 'X' }, actualizado_en: reciente }] }]);
  const datos = crearDatos({ supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'k', fetchImpl });
  const estado = await datos.leerEstado('42');
  assert.deepEqual(estado, { paso: 'nuevo_rubro', datosParciales: { nombre: 'X' } });
});

test('guardarEstado hace upsert (Prefer merge-duplicates) en bot_estado', async () => {
  const fetchImpl = fetchFalso([{ status: 201, body: [] }]);
  const datos = crearDatos({ supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'k', fetchImpl });
  await datos.guardarEstado('42', 'nuevo_nombre', {});
  assert.match(fetchImpl.llamadas[0].url, /\/bot_estado$/);
});

test('borrarEstado manda DELETE filtrado por chat_id', async () => {
  const fetchImpl = fetchFalso([{ status: 204, body: null }]);
  const datos = crearDatos({ supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'k', fetchImpl });
  await datos.borrarEstado('42');
  assert.equal(fetchImpl.llamadas[0].metodo, 'DELETE');
  assert.match(fetchImpl.llamadas[0].url, /\/bot_estado\?chat_id=eq\.42/);
});
```

- [ ] **Paso 2: Correr el test y verificar que falla**

Run: `node --test test/datos.test.js`
Expected: FAIL — módulo no existe

- [ ] **Paso 3: Implementar**

`functions/_lib/datos.js`:

```js
import { normalizarNombre } from './normalizarNombre.js';

const EXPIRACION_ESTADO_MS = 2 * 60 * 60 * 1000; // 2 horas — spec §5, evita que un flujo a medias quede trabado para siempre

// Acceso a Supabase vía REST (PostgREST) directo con fetch, sin SDK — mismo
// criterio de cero-dependencias que Almenara_Web/functions/api/enviar-diagnostico.js
// y mismo patrón fetchImpl inyectable que el resto de la familia Almenara.
export function crearDatos({ supabaseUrl, serviceRoleKey, fetchImpl = fetch }) {
  const base = `${supabaseUrl}/rest/v1`;
  const headersBase = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json'
  };

  async function pedir(ruta, opciones = {}) {
    const resp = await fetchImpl(`${base}${ruta}`, {
      ...opciones,
      headers: { ...headersBase, ...(opciones.headers || {}) }
    });
    if (!resp.ok) {
      const detalle = await resp.text().catch(() => '');
      throw new Error(`Supabase respondió ${resp.status} en ${ruta}: ${detalle}`);
    }
    if (resp.status === 204) return null;
    return resp.json();
  }

  async function borrarEstado(chatId) {
    await pedir(`/bot_estado?chat_id=eq.${encodeURIComponent(chatId)}`, { method: 'DELETE' });
  }

  return {
    async obtenerAutorPorChatId(chatId) {
      const filas = await pedir(`/usuarios_bot?chat_id=eq.${encodeURIComponent(chatId)}&select=nombre`);
      return filas[0]?.nombre ?? null;
    },

    async buscarClientePorNombreNormalizado(nombreNormalizado) {
      // Comparación en JS, no en la query: normalizar (sin tildes,
      // minúsculas, espacios colapsados) no tiene equivalente directo en
      // PostgREST, y con el volumen esperado (decenas de clientes, no
      // miles) traer id+nombre y comparar acá es simple y suficiente.
      const filas = await pedir('/clientes?select=id,nombre,etapa');
      return filas.find((c) => normalizarNombre(c.nombre) === nombreNormalizado) ?? null;
    },

    async listarClientesRecientes(limite = 8) {
      return pedir(`/clientes?select=id,nombre,etapa,actualizado_en&order=actualizado_en.desc&limit=${limite}`);
    },

    async crearCliente({ nombre, rubro, etapa }) {
      const filas = await pedir('/clientes', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ nombre, rubro, etapa })
      });
      return filas[0];
    },

    async agregarNota({ clienteId, texto, autor }) {
      const filas = await pedir('/notas', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ cliente_id: clienteId, texto, autor })
      });
      await pedir(`/clientes?id=eq.${encodeURIComponent(clienteId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ actualizado_en: new Date().toISOString() })
      });
      return filas[0];
    },

    async leerEstado(chatId) {
      const filas = await pedir(`/bot_estado?chat_id=eq.${encodeURIComponent(chatId)}&select=paso,datos_parciales,actualizado_en`);
      const fila = filas[0];
      if (!fila) return null;
      const edadMs = Date.now() - new Date(fila.actualizado_en).getTime();
      if (edadMs > EXPIRACION_ESTADO_MS) {
        await borrarEstado(chatId);
        return null;
      }
      return { paso: fila.paso, datosParciales: fila.datos_parciales ?? {} };
    },

    async guardarEstado(chatId, paso, datosParciales) {
      await pedir('/bot_estado', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ chat_id: chatId, paso, datos_parciales: datosParciales, actualizado_en: new Date().toISOString() })
      });
    },

    borrarEstado
  };
}
```

- [ ] **Paso 4: Correr el test y verificar que pasa**

Run: `node --test test/datos.test.js`
Expected: PASS (9 tests)

- [ ] **Paso 5: Commit**

```bash
git add functions/_lib/datos.js test/datos.test.js
git commit -m "feat: datos.js — acceso a Supabase vía REST, sin SDK"
```

---

## Task 6: `comandos.js` — lógica de conversación (pura, sin IO)

**Files:**
- Create: `functions/_lib/comandos.js`
- Test: `test/comandos.test.js`

**Interfaces:**
- Consume: la forma de `entrada` de Task 3 (`{chatId, tipo, valor, callbackId?}`).
- Produce: `decidirAccion({ entrada, estado, clienteDuplicado, clientesRecientes }) => { respuesta?: {texto, botones?}, nuevoEstado?: {paso, datosParciales}, cancelarEstado?: boolean, guardarCliente?: {nombre, rubro, etapa}, guardarNota?: {clienteId, texto} }`. Usado por Task 7, que además le agrega `autor` a `guardarNota` antes de llamar a `datos.agregarNota`.

Esta es la pieza central del bot: dado el mensaje entrante y el contexto ya cargado (estado pendiente, si el nombre escrito ya existe, la lista de clientes recientes), decide qué responder y qué guardar — sin tocar red ni base de datos, por eso es 100% testeable sin mocks.

- [ ] **Paso 1: Escribir los tests que fallan**

`test/comandos.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidirAccion } from '../functions/_lib/comandos.js';

test('/start responde la ayuda sin tocar estado', () => {
  const accion = decidirAccion({ entrada: { tipo: 'comando', valor: '/start' }, estado: null });
  assert.match(accion.respuesta.texto, /\/nuevo/);
  assert.equal(accion.nuevoEstado, undefined);
});

test('/clientes sin clientes registrados avisa que no hay nada', () => {
  const accion = decidirAccion({ entrada: { tipo: 'comando', valor: '/clientes' }, estado: null, clientesRecientes: [] });
  assert.match(accion.respuesta.texto, /no hay clientes/i);
});

test('/clientes con datos lista nombre y etapa', () => {
  const accion = decidirAccion({
    entrada: { tipo: 'comando', valor: '/clientes' }, estado: null,
    clientesRecientes: [{ id: '1', nombre: 'Fuegos del Sur', etapa: 'cliente' }]
  });
  assert.match(accion.respuesta.texto, /Fuegos del Sur/);
  assert.match(accion.respuesta.texto, /Cliente/);
});

test('/nuevo pide el nombre y arranca el flujo', () => {
  const accion = decidirAccion({ entrada: { tipo: 'comando', valor: '/nuevo' }, estado: null });
  assert.equal(accion.nuevoEstado.paso, 'nuevo_nombre');
  assert.match(accion.respuesta.texto, /nombre/i);
});

test('flujo /nuevo completo sin duplicado: nombre -> rubro -> etapa -> guarda', () => {
  const paso1 = decidirAccion({
    entrada: { tipo: 'texto', valor: 'Cliente Nuevo' },
    estado: { paso: 'nuevo_nombre', datosParciales: {} },
    clienteDuplicado: null
  });
  assert.equal(paso1.nuevoEstado.paso, 'nuevo_rubro');
  assert.equal(paso1.nuevoEstado.datosParciales.nombre, 'Cliente Nuevo');

  const paso2 = decidirAccion({
    entrada: { tipo: 'texto', valor: 'Agro' },
    estado: { paso: 'nuevo_rubro', datosParciales: { nombre: 'Cliente Nuevo' } }
  });
  assert.equal(paso2.nuevoEstado.paso, 'nuevo_etapa');
  assert.ok(paso2.respuesta.botones.some((b) => b.valor === 'etapa:prospecto'));

  const paso3 = decidirAccion({
    entrada: { tipo: 'boton', valor: 'etapa:prospecto' },
    estado: { paso: 'nuevo_etapa', datosParciales: { nombre: 'Cliente Nuevo', rubro: 'Agro' } }
  });
  assert.deepEqual(paso3.guardarCliente, { nombre: 'Cliente Nuevo', rubro: 'Agro', etapa: 'prospecto' });
  assert.equal(paso3.cancelarEstado, true);
});

test('/nuevo con nombre duplicado pregunta antes de crear, y "es el mismo" redirige a /nota', () => {
  const pregunta = decidirAccion({
    entrada: { tipo: 'texto', valor: 'fuegos del sur' },
    estado: { paso: 'nuevo_nombre', datosParciales: {} },
    clienteDuplicado: { id: 'c1', nombre: 'Fuegos del Sur', etapa: 'cliente' }
  });
  assert.equal(pregunta.nuevoEstado.paso, 'nuevo_confirmar_duplicado');
  assert.match(pregunta.respuesta.texto, /Ya existe un cliente llamado Fuegos del Sur/);

  const esElMismo = decidirAccion({
    entrada: { tipo: 'boton', valor: 'dup_si' },
    estado: { paso: 'nuevo_confirmar_duplicado', datosParciales: { nombre: 'fuegos del sur', duplicadoId: 'c1' } }
  });
  assert.equal(esElMismo.nuevoEstado.paso, 'nota_texto');
  assert.equal(esElMismo.nuevoEstado.datosParciales.clienteId, 'c1');
});

test('/nuevo con nombre duplicado, "es otro distinto" sigue el flujo normal', () => {
  const esOtro = decidirAccion({
    entrada: { tipo: 'boton', valor: 'dup_no' },
    estado: { paso: 'nuevo_confirmar_duplicado', datosParciales: { nombre: 'Otro Fuegos', duplicadoId: 'c1' } }
  });
  assert.equal(esOtro.nuevoEstado.paso, 'nuevo_rubro');
  assert.equal(esOtro.nuevoEstado.datosParciales.nombre, 'Otro Fuegos');
});

test('/nota con pocos clientes muestra botones', () => {
  const accion = decidirAccion({
    entrada: { tipo: 'comando', valor: '/nota' }, estado: null,
    clientesRecientes: [{ id: '1', nombre: 'A', etapa: 'cliente' }, { id: '2', nombre: 'B', etapa: 'prospecto' }]
  });
  assert.equal(accion.nuevoEstado.paso, 'nota_elegir_cliente');
  assert.equal(accion.respuesta.botones.length, 2);
});

test('/nota sin clientes avisa que hay que usar /nuevo primero', () => {
  const accion = decidirAccion({ entrada: { tipo: 'comando', valor: '/nota' }, estado: null, clientesRecientes: [] });
  assert.match(accion.respuesta.texto, /\/nuevo/);
});

test('elegir cliente por botón en /nota pasa a pedir el texto de la nota', () => {
  const accion = decidirAccion({
    entrada: { tipo: 'boton', valor: 'nota_cliente:c1' },
    estado: { paso: 'nota_elegir_cliente', datosParciales: {} }
  });
  assert.equal(accion.nuevoEstado.paso, 'nota_texto');
  assert.equal(accion.nuevoEstado.datosParciales.clienteId, 'c1');
});

test('escribir el texto de la nota la guarda y cierra el flujo', () => {
  const accion = decidirAccion({
    entrada: { tipo: 'texto', valor: 'Pidió cotización, enviar el jueves' },
    estado: { paso: 'nota_texto', datosParciales: { clienteId: 'c1' } }
  });
  assert.deepEqual(accion.guardarNota, { clienteId: 'c1', texto: 'Pidió cotización, enviar el jueves' });
  assert.equal(accion.cancelarEstado, true);
});

test('/cancelar con un flujo pendiente lo cancela', () => {
  const accion = decidirAccion({
    entrada: { tipo: 'comando', valor: '/cancelar' },
    estado: { paso: 'nuevo_nombre', datosParciales: {} }
  });
  assert.equal(accion.cancelarEstado, true);
});

test('/cancelar sin nada pendiente lo dice explícito', () => {
  const accion = decidirAccion({ entrada: { tipo: 'comando', valor: '/cancelar' }, estado: null });
  assert.match(accion.respuesta.texto, /nada pendiente/i);
});

test('un texto suelto sin flujo activo sugiere /nota o /nuevo, no adivina', () => {
  const accion = decidirAccion({ entrada: { tipo: 'texto', valor: 'hola' }, estado: null });
  assert.match(accion.respuesta.texto, /\/nota|\/nuevo/);
  assert.equal(accion.guardarCliente, undefined);
  assert.equal(accion.guardarNota, undefined);
});
```

- [ ] **Paso 2: Correr los tests y verificar que fallan**

Run: `node --test test/comandos.test.js`
Expected: FAIL — módulo no existe

- [ ] **Paso 3: Implementar**

`functions/_lib/comandos.js`:

```js
const ETAPAS = [
  { valor: 'prospecto', etiqueta: 'Prospecto' },
  { valor: 'diagnostico', etiqueta: 'Diagnóstico' },
  { valor: 'cliente', etiqueta: 'Cliente' },
  { valor: 'descartado', etiqueta: 'Descartado' }
];

const MAX_BOTONES_CLIENTES = 8;

function etiquetaEtapa(valor) {
  return ETAPAS.find((e) => e.valor === valor)?.etiqueta ?? valor;
}

// Decide qué responder y qué guardar, dado el mensaje/botón entrante y el
// contexto ya cargado por quien llama (spec §5: flujo de /nuevo y /nota).
// Función pura: sin fetch, sin Supabase — todo lo que necesita ya viene
// como parámetro, por eso es 100% testeable sin mocks.
export function decidirAccion({ entrada, estado, clienteDuplicado, clientesRecientes }) {
  const paso = estado?.paso ?? null;
  const datosParciales = estado?.datosParciales ?? {};

  if (entrada.tipo === 'comando' && entrada.valor === '/cancelar') {
    if (!paso) return { respuesta: { texto: 'No hay nada pendiente que cancelar.' } };
    return { respuesta: { texto: 'Cancelado.' }, cancelarEstado: true };
  }

  if (entrada.tipo === 'comando' && entrada.valor === '/start') {
    return {
      respuesta: {
        texto: 'Hola! Comandos:\n/nuevo — registrar un cliente o prospecto\n/nota — agregar una nota a uno existente\n/clientes — ver la lista\n/cancelar — cancelar lo que estabas haciendo'
      }
    };
  }

  if (entrada.tipo === 'comando' && entrada.valor === '/clientes') {
    if (!clientesRecientes?.length) return { respuesta: { texto: 'Todavía no hay clientes registrados. Usa /nuevo para el primero.' } };
    const lineas = clientesRecientes.map((c) => `• ${c.nombre} — ${etiquetaEtapa(c.etapa)}`);
    return { respuesta: { texto: lineas.join('\n') } };
  }

  if (entrada.tipo === 'comando' && entrada.valor === '/nuevo') {
    return {
      respuesta: { texto: '¿Cómo se llama el cliente o prospecto?' },
      nuevoEstado: { paso: 'nuevo_nombre', datosParciales: {} }
    };
  }

  if (entrada.tipo === 'comando' && entrada.valor === '/nota') {
    if (!clientesRecientes?.length) return { respuesta: { texto: 'No hay clientes todavía — usa /nuevo primero.' } };
    if (clientesRecientes.length <= MAX_BOTONES_CLIENTES) {
      return {
        respuesta: {
          texto: '¿A qué cliente le agregas la nota?',
          botones: clientesRecientes.map((c) => ({ etiqueta: c.nombre, valor: `nota_cliente:${c.id}` }))
        },
        nuevoEstado: { paso: 'nota_elegir_cliente', datosParciales: {} }
      };
    }
    return {
      respuesta: { texto: 'Escribe el nombre exacto del cliente:' },
      nuevoEstado: { paso: 'nota_buscar_cliente', datosParciales: {} }
    };
  }

  if (paso === 'nuevo_nombre' && entrada.tipo === 'texto') {
    if (clienteDuplicado) {
      return {
        respuesta: {
          texto: `Ya existe un cliente llamado ${clienteDuplicado.nombre} (etapa: ${etiquetaEtapa(clienteDuplicado.etapa)}). ¿Es el mismo?`,
          botones: [
            { etiqueta: 'Sí, es el mismo', valor: 'dup_si' },
            { etiqueta: 'No, es otro distinto', valor: 'dup_no' }
          ]
        },
        nuevoEstado: { paso: 'nuevo_confirmar_duplicado', datosParciales: { nombre: entrada.valor, duplicadoId: clienteDuplicado.id } }
      };
    }
    return {
      respuesta: { texto: '¿Cuál es su rubro?' },
      nuevoEstado: { paso: 'nuevo_rubro', datosParciales: { nombre: entrada.valor } }
    };
  }

  if (paso === 'nuevo_confirmar_duplicado' && entrada.tipo === 'boton') {
    if (entrada.valor === 'dup_si') {
      return {
        respuesta: { texto: 'Dale, agreguemos la nota a ese cliente. Escribe la nota:' },
        nuevoEstado: { paso: 'nota_texto', datosParciales: { clienteId: datosParciales.duplicadoId } }
      };
    }
    if (entrada.valor === 'dup_no') {
      return {
        respuesta: { texto: '¿Cuál es su rubro?' },
        nuevoEstado: { paso: 'nuevo_rubro', datosParciales: { nombre: datosParciales.nombre } }
      };
    }
    return { respuesta: { texto: 'No entendí — usa uno de los botones de arriba.' } };
  }

  if (paso === 'nuevo_rubro' && entrada.tipo === 'texto') {
    return {
      respuesta: { texto: '¿En qué etapa está?', botones: ETAPAS.map((e) => ({ etiqueta: e.etiqueta, valor: `etapa:${e.valor}` })) },
      nuevoEstado: { paso: 'nuevo_etapa', datosParciales: { ...datosParciales, rubro: entrada.valor } }
    };
  }

  if (paso === 'nuevo_etapa' && entrada.tipo === 'boton' && entrada.valor.startsWith('etapa:')) {
    const etapa = entrada.valor.slice('etapa:'.length);
    return {
      respuesta: { texto: `Listo, ${datosParciales.nombre} queda registrado como ${etiquetaEtapa(etapa)}.` },
      guardarCliente: { nombre: datosParciales.nombre, rubro: datosParciales.rubro, etapa },
      cancelarEstado: true
    };
  }

  if (paso === 'nota_elegir_cliente' && entrada.tipo === 'boton' && entrada.valor.startsWith('nota_cliente:')) {
    return {
      respuesta: { texto: 'Escribe la nota:' },
      nuevoEstado: { paso: 'nota_texto', datosParciales: { clienteId: entrada.valor.slice('nota_cliente:'.length) } }
    };
  }

  if (paso === 'nota_buscar_cliente' && entrada.tipo === 'texto') {
    if (!clienteDuplicado) return { respuesta: { texto: 'No encontré ese cliente. Prueba de nuevo o usa /cancelar.' } };
    return {
      respuesta: { texto: 'Escribe la nota:' },
      nuevoEstado: { paso: 'nota_texto', datosParciales: { clienteId: clienteDuplicado.id } }
    };
  }

  if (paso === 'nota_texto' && entrada.tipo === 'texto') {
    return {
      respuesta: { texto: 'Nota guardada.' },
      guardarNota: { clienteId: datosParciales.clienteId, texto: entrada.valor },
      cancelarEstado: true
    };
  }

  if (!paso) {
    return { respuesta: { texto: 'No entendí. Usa /nota para agregar una nota o /nuevo para registrar un cliente.' } };
  }

  return { respuesta: { texto: 'No entendí esa respuesta. Usa /cancelar si quieres empezar de nuevo.' } };
}
```

- [ ] **Paso 4: Correr los tests y verificar que pasan**

Run: `node --test test/comandos.test.js`
Expected: PASS (14 tests)

- [ ] **Paso 5: Commit**

```bash
git add functions/_lib/comandos.js test/comandos.test.js
git commit -m "feat: comandos.js — lógica de conversación pura del bot"
```

---

## Task 7: `telegram-webhook.js` — la función de Cloudflare Pages

**Files:**
- Create: `functions/api/telegram-webhook.js`

**Interfaces:**
- Consume: `interpretarEntrada` (Task 3), `crearTelegram` (Task 4), `crearDatos` (Task 5), `decidirAccion` (Task 6), `normalizarNombre` (Task 2).
- Produce: el endpoint `POST /api/telegram-webhook` que Task 1 (BotFather) y Task 10 (deploy) conectan.

Este archivo es el adaptador que conecta las piezas puras/testeadas con el runtime real de Cloudflare y Telegram — deliberadamente delgado (sin lógica de decisión propia, todo vive en `comandos.js`), verificado manualmente con el bot real en Task 10 en vez de con tests automatizados, mismo criterio que ya usa `Almenara_Web/functions/api/enviar-diagnostico.js` (tampoco tiene tests).

- [ ] **Paso 1: Implementar**

`functions/api/telegram-webhook.js`:

```js
import { interpretarEntrada } from '../_lib/interpretarEntrada.js';
import { decidirAccion } from '../_lib/comandos.js';
import { crearDatos } from '../_lib/datos.js';
import { crearTelegram } from '../_lib/telegram.js';
import { normalizarNombre } from '../_lib/normalizarNombre.js';

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

async function procesar(update, { datos, telegram }) {
  const entrada = interpretarEntrada(update);
  if (!entrada) return;

  if (update.callback_query) {
    await telegram.responderCallback(update.callback_query.id);
  }

  const autor = await datos.obtenerAutorPorChatId(entrada.chatId);
  if (!autor) {
    await telegram.enviarMensaje(entrada.chatId, 'No estás autorizado para usar este bot.');
    return;
  }

  const estado = await datos.leerEstado(entrada.chatId);

  let clienteDuplicado = null;
  const pasoBuscaCliente = estado?.paso === 'nuevo_nombre' || estado?.paso === 'nota_buscar_cliente';
  if (entrada.tipo === 'texto' && pasoBuscaCliente) {
    clienteDuplicado = await datos.buscarClientePorNombreNormalizado(normalizarNombre(entrada.valor));
  }

  const necesitaListaClientes = entrada.tipo === 'comando' && (entrada.valor === '/nota' || entrada.valor === '/clientes');
  const clientesRecientes = necesitaListaClientes ? await datos.listarClientesRecientes() : undefined;

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
```

- [ ] **Paso 2: Verificar que el archivo carga sin errores de sintaxis**

Run: `node --check functions/api/telegram-webhook.js`
Expected: sin salida (sintaxis válida)

- [ ] **Paso 3: Commit**

```bash
git add functions/api/telegram-webhook.js
git commit -m "feat: telegram-webhook.js — función de Cloudflare que conecta bot y datos"
```

---

## Task 8: Página web — login y lista de clientes

**Files:**
- Create: `js/supabaseClient.js`
- Create: `index.html`
- Create: `css/estilo.css`

**Interfaces:**
- Produce: `supabase` (cliente inicializado) usado también por Task 9.

- [ ] **Paso 1: Cliente de Supabase**

`js/supabaseClient.js`:

```js
// La anon key es pública por diseño (protegida por RLS, no es un secreto)
// — mismo criterio que cualquier app Supabase del lado del cliente. Sin
// build step (igual que el resto de Almenara_Web), así que va hardcodeada
// acá en vez de leerse de una variable de entorno.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co'; // reemplazar tras Task 1
const SUPABASE_ANON_KEY = 'TU-ANON-KEY'; // reemplazar tras Task 1

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

- [ ] **Paso 2: Estilos mínimos**

`css/estilo.css`:

```css
body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; color: #222; }
h1 { font-size: 1.4rem; }
input, select, button, textarea { font: inherit; padding: 0.5rem; border-radius: 6px; border: 1px solid #ccc; }
button { cursor: pointer; background: #1E2761; color: #fff; border: none; }
.lista-clientes { list-style: none; padding: 0; margin-top: 1rem; }
.lista-clientes li { padding: 0.75rem; border-bottom: 1px solid #eee; }
.lista-clientes a { text-decoration: none; color: #1E2761; font-weight: 600; }
.etapa { display: inline-block; font-size: 0.75rem; padding: 0.1rem 0.5rem; border-radius: 999px; background: #eee; margin-left: 0.5rem; }
.filtros { display: flex; gap: 0.5rem; margin-top: 1rem; }
```

- [ ] **Paso 3: Página principal**

`index.html`:

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Clientes — Almenara</title>
  <link rel="stylesheet" href="css/estilo.css" />
</head>
<body>
  <h1>Clientes Almenara</h1>

  <div id="login">
    <p>Ingresa tu correo para recibir el link de acceso:</p>
    <input id="email" type="email" placeholder="tu@correo.com" />
    <button id="btn-login">Enviar link</button>
    <p id="login-mensaje"></p>
  </div>

  <div id="app" style="display:none">
    <div class="filtros">
      <input id="buscador" type="search" placeholder="Buscar cliente..." />
      <select id="filtro-etapa">
        <option value="">Todas las etapas</option>
        <option value="prospecto">Prospecto</option>
        <option value="diagnostico">Diagnóstico</option>
        <option value="cliente">Cliente</option>
        <option value="descartado">Descartado</option>
      </select>
    </div>
    <ul class="lista-clientes" id="lista-clientes"></ul>
  </div>

  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Paso 4: Lógica de la página**

`js/app.js`:

```js
import { supabase } from './supabaseClient.js';

const ETIQUETAS_ETAPA = { prospecto: 'Prospecto', diagnostico: 'Diagnóstico', cliente: 'Cliente', descartado: 'Descartado' };

const loginDiv = document.getElementById('login');
const appDiv = document.getElementById('app');
const loginMensaje = document.getElementById('login-mensaje');
const listaEl = document.getElementById('lista-clientes');
const buscadorEl = document.getElementById('buscador');
const filtroEtapaEl = document.getElementById('filtro-etapa');

let clientesCache = [];

document.getElementById('btn-login').addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim();
  if (!email) return;
  const { error } = await supabase.auth.signInWithOtp({ email });
  loginMensaje.textContent = error ? `Error: ${error.message}` : 'Revisa tu correo y haz clic en el link.';
});

supabase.auth.onAuthStateChange((_event, session) => {
  if (session) mostrarApp();
});

async function mostrarApp() {
  loginDiv.style.display = 'none';
  appDiv.style.display = 'block';
  await cargarClientes();
}

async function cargarClientes() {
  const { data, error } = await supabase
    .from('clientes')
    .select('id, nombre, rubro, etapa, actualizado_en')
    .order('actualizado_en', { ascending: false });
  if (error) {
    listaEl.innerHTML = `<li>Error cargando clientes: ${error.message}</li>`;
    return;
  }
  clientesCache = data;
  renderizarLista();
}

function renderizarLista() {
  const busqueda = buscadorEl.value.trim().toLowerCase();
  const etapaFiltro = filtroEtapaEl.value;
  const filtrados = clientesCache.filter((c) => {
    const calzaBusqueda = !busqueda || c.nombre.toLowerCase().includes(busqueda);
    const calzaEtapa = !etapaFiltro || c.etapa === etapaFiltro;
    return calzaBusqueda && calzaEtapa;
  });

  listaEl.innerHTML = filtrados.length
    ? filtrados.map((c) => `
        <li>
          <a href="cliente.html?id=${c.id}">${c.nombre}</a>
          <span class="etapa">${ETIQUETAS_ETAPA[c.etapa] ?? c.etapa}</span>
        </li>
      `).join('')
    : '<li>Sin resultados.</li>';
}

buscadorEl.addEventListener('input', renderizarLista);
filtroEtapaEl.addEventListener('change', renderizarLista);

// Si ya había una sesión activa (magic link ya usado antes), mostrar la app directo.
const { data: { session } } = await supabase.auth.getSession();
if (session) mostrarApp();
```

- [ ] **Paso 4: Verificar visualmente**

Abrir `index.html` con un servidor local simple (`npx serve .` o la extensión Live Server) — sin Supabase configurado todavía (Task 1 pendiente de completar con las claves reales), el login mostrará un error de red al enviar el link, lo cual es esperado en este punto; confirmar que la página carga sin errores de consola de sintaxis/import.

- [ ] **Paso 5: Commit**

```bash
git add js/supabaseClient.js js/app.js index.html css/estilo.css
git commit -m "feat: página web — login y lista de clientes"
```

---

## Task 9: Página web — ficha de cliente

**Files:**
- Create: `cliente.html`
- Create: `js/cliente.js`

**Interfaces:**
- Consume: `supabase` de Task 8.

- [ ] **Paso 1: HTML de la ficha**

`cliente.html`:

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Ficha de cliente — Almenara</title>
  <link rel="stylesheet" href="css/estilo.css" />
</head>
<body>
  <p><a href="index.html">&larr; Volver a la lista</a></p>

  <div id="ficha">
    <h1><input id="nombre" type="text" /></h1>
    <label>Rubro <input id="rubro" type="text" /></label>
    <label>Etapa
      <select id="etapa">
        <option value="prospecto">Prospecto</option>
        <option value="diagnostico">Diagnóstico</option>
        <option value="cliente">Cliente</option>
        <option value="descartado">Descartado</option>
      </select>
    </label>
    <button id="btn-guardar">Guardar</button>
    <p id="guardado-mensaje"></p>
  </div>

  <h2>Notas</h2>
  <ul id="lista-notas"></ul>

  <script type="module" src="js/cliente.js"></script>
</body>
</html>
```

- [ ] **Paso 2: Lógica de la ficha**

`js/cliente.js`:

```js
import { supabase } from './supabaseClient.js';

const params = new URLSearchParams(location.search);
const clienteId = params.get('id');

const nombreEl = document.getElementById('nombre');
const rubroEl = document.getElementById('rubro');
const etapaEl = document.getElementById('etapa');
const mensajeEl = document.getElementById('guardado-mensaje');
const notasEl = document.getElementById('lista-notas');

if (!clienteId) {
  document.getElementById('ficha').innerHTML = '<p>No se especificó un cliente.</p>';
} else {
  await cargarFicha();
  await cargarNotas();
}

async function cargarFicha() {
  const { data, error } = await supabase.from('clientes').select('nombre, rubro, etapa').eq('id', clienteId).single();
  if (error) {
    mensajeEl.textContent = `Error: ${error.message}`;
    return;
  }
  nombreEl.value = data.nombre;
  rubroEl.value = data.rubro ?? '';
  etapaEl.value = data.etapa;
}

async function cargarNotas() {
  const { data, error } = await supabase
    .from('notas')
    .select('texto, autor, creado_en')
    .eq('cliente_id', clienteId)
    .order('creado_en', { ascending: false });
  if (error) {
    notasEl.innerHTML = `<li>Error cargando notas: ${error.message}</li>`;
    return;
  }
  notasEl.innerHTML = data.length
    ? data.map((n) => `<li><strong>${new Date(n.creado_en).toLocaleDateString('es-CL')} — ${n.autor}:</strong> ${n.texto}</li>`).join('')
    : '<li>Sin notas todavía.</li>';
}

document.getElementById('btn-guardar').addEventListener('click', async () => {
  const { error } = await supabase
    .from('clientes')
    .update({ nombre: nombreEl.value.trim(), rubro: rubroEl.value.trim(), etapa: etapaEl.value })
    .eq('id', clienteId);
  mensajeEl.textContent = error ? `Error: ${error.message}` : 'Guardado.';
});
```

- [ ] **Paso 3: Verificar visualmente**

Abrir `cliente.html?id=<algún-id>` — misma verificación de Task 8 (sin datos reales todavía, confirmar solo que carga sin errores de sintaxis en consola).

- [ ] **Paso 4: Commit**

```bash
git add cliente.html js/cliente.js
git commit -m "feat: página web — ficha de cliente con edición e historial de notas"
```

---

## Task 10: Deploy — conectar todo y verificar de punta a punta

**Files:**
- Modify: `js/supabaseClient.js` (reemplazar los placeholders de Task 8 con las claves reales de Task 1)

**Interfaces:**
- Consume: todas las tareas anteriores.

- [ ] **Paso 1: Crear el proyecto en Cloudflare Pages**

[dash.cloudflare.com](https://dash.cloudflare.com) → Pages → "Create a project" → conectar el repo de GitHub de `Almenara_Clientes` (crear el repo primero si no existe: `gh repo create` o desde github.com, igual que se hizo con `almenara-registro-motor`). Framework preset: **None**. Build command: **vacío**. Output directory: **/ (raíz)**.

- [ ] **Paso 2: Variables de entorno en Cloudflare Pages**

Settings → Environment variables (Production):
- `TELEGRAM_BOT_TOKEN` — de Task 1, Paso 5.
- `TELEGRAM_WEBHOOK_SECRET` — un string aleatorio nuevo, generado ahora (ej. `openssl rand -hex 20` o cualquier generador de contraseñas largas).
- `SUPABASE_URL` — de Task 1, Paso 1.
- `SUPABASE_SERVICE_ROLE_KEY` — de Task 1, Paso 1.

- [ ] **Paso 3: Reemplazar los placeholders del cliente web**

En `js/supabaseClient.js`, reemplazar `SUPABASE_URL`/`SUPABASE_ANON_KEY` con los valores reales de Task 1 (la anon key, no la service role — esa nunca va en código que llega al navegador). Commit:

```bash
git add js/supabaseClient.js
git commit -m "config: claves reales de Supabase en el cliente web"
```

- [ ] **Paso 4: Deploy**

Push a la rama principal — Cloudflare Pages despliega automáticamente. Verificar en el dashboard que el build terminó en "Success" y anotar la URL (ej. `https://almenara-clientes.pages.dev`).

- [ ] **Paso 5: Registrar el webhook en Telegram**

Con el `TELEGRAM_BOT_TOKEN` y el `TELEGRAM_WEBHOOK_SECRET` de Paso 2, y la URL de Paso 4:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://<tu-sitio>.pages.dev/api/telegram-webhook", "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"}'
```

Expected: `{"ok":true,"result":true,"description":"Webhook was set"}`

- [ ] **Paso 6: Verificación de punta a punta**

Desde el Telegram de Carolina o Jorge (ya vinculados en Task 1, Paso 6):
1. `/start` → debe responder con la ayuda.
2. `/nuevo` → seguir el flujo hasta guardar un cliente de prueba.
3. Repetir `/nuevo` con el mismo nombre → debe preguntar por el duplicado.
4. `/nota` → agregar una nota al cliente de prueba.
5. `/clientes` → debe listarlo.
6. Abrir la URL de la página web, hacer login con el correo autorizado, confirmar que el cliente de prueba aparece con su nota.
7. Desde un chat_id **no** vinculado en `usuarios_bot`, escribirle al bot → debe responder "No estás autorizado".

- [ ] **Paso 7: Limpiar el cliente de prueba**

Supabase Studio → Table Editor → borrar el cliente y nota de prueba creados en el Paso 6 (o dejarlos si prefieren usarlos como primer registro real).

- [ ] **Paso 8: Commit final**

```bash
git add docs/DEPLOY.md
git commit -m "docs: registrar la URL de producción y el estado del deploy"
```

---

## Self-Review

**Cobertura del spec:** §1 (alcance, campos, notas libres) → Tasks 6-9. §2 (no reutilizar motor) → decisión ya tomada, reflejada en la arquitectura de Tasks 2-7 (proyecto nuevo). §3 (arquitectura webhook/Cloudflare/Supabase) → Tasks 1, 5, 7, 10. §4 (modelo de datos) → Task 1. §5 (flujo de conversación, duplicados, expiración) → Task 6. §6 (página web) → Tasks 8-9. §7 (errores, token secreto) → Task 7. Sin brechas encontradas.

**Placeholders:** ninguno — cada paso tiene código completo o instrucciones con valores exactos (salvo los dos placeholders literales de claves de Supabase en Task 8, que son intencionales y se resuelven explícitamente en Task 10 Paso 3).

**Consistencia de tipos:** `entrada` (`{chatId, tipo, valor, callbackId?}`) se usa igual en Tasks 3, 6 y 7. La forma de `accion` que devuelve `decidirAccion` (Task 6) se consume exactamente igual en Task 7. `datos.*` (Task 5) coincide con lo que Task 7 llama. Revisado sin discrepancias.
