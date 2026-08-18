# Almenara Clientes — Contexto

Bot de Telegram (`bot.js`, polling, corre en un VPS) + Supabase + página web
(Cloudflare) para que Carolina y Jorge registren clientes/prospectos y notas
de reunión desde el celular, consolidado en un solo lugar. Es infraestructura
**propia de Almenara** (herramienta comercial interna), no para un cliente de
terceros.

- Diseño: `docs/superpowers/specs/2026-08-17-bot-clientes-design.md`
- Plan de implementación: `docs/superpowers/plans/2026-08-17-bot-clientes-plan.md`
- Schema de la base de datos: `docs/schema.sql` (correr en Supabase Studio → SQL Editor)

## Cómo está desplegado

- **Bot**: proceso Node con `pm2` en el VPS de DigitalOcean (mismo droplet que Hermes). `bot.js` hace polling a Telegram — variables de entorno en `.env` (`TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
- **Web**: `functions/`/`worker.js` en Cloudflare, sirve `index.html` (lista de clientes), `cliente.html` (ficha) y `configuracion.html` (campos flexibles). Sin build step.
- **Datos**: Supabase — `clientes`, `notas`, `definiciones_campos` (campos que se agregan sin tocar código), `usuarios_bot`, `usuarios_autorizados`, `bot_estado`.

---

# Mapa del ecosistema Almenara

Esta sección es para cualquiera que abra Claude Code acá y necesite
orientarse en el resto de las herramientas de Almenara — no todo vive en
este repo. Almenara Consultora vende un método (levantamiento → diagnóstico
→ priorización → soluciones) y construye herramientas propias para clientes
de maestranzas, agro, construcción, etc.

## Quiénes trabajan en Almenara

- **Carolina**: arquitectura, desarrollo, Supabase, decisiones técnicas.
- **Jorge**: comercial (prospección, reuniones, seguimiento) y trabajo mecánico/terreno.

## Los otros productos de Almenara (repos separados en GitHub)

**Todos con código real funcionando** — no asumir que algo "solo tiene un
video de marketing" significa que no hay app real detrás (ya pasó una vez
con Planificación/Horas de Fuegos del Sur, y era una app completa).

| Repo | Qué es |
|---|---|
| `github.com/claroyneto/almenara-registro-motor` | "Registro por chat": bot de Telegram genérico y config-driven para que operarios de campo registren aplicaciones/faenas por voz o texto. |
| `github.com/claroyneto/almenara-web` | El sitio público de Almenara (Cloudflare) — landing, formulario de diagnóstico en vivo, calculadora. |
| `github.com/claroyneto/fuegos-gantt` | **Planificación**, para el cliente Fuegos del Sur (maestranza) — React+Vite+Supabase, Vercel. |
| `github.com/claroyneto/fuegos-telegram-bot` | **Horas**, para el mismo cliente — control de jornada, misma base Supabase que Planificación. |

**Diagnóstico Operacional** (el formulario de 37 preguntas → informe de
madurez) no tiene repo todavía — vive solo local en el computador de
Carolina (`Almenara_Diagnostico/`), no clonable desde acá.

## Si algo no calza con lo que dice este archivo

El código es la fuente de verdad, no este resumen — si algo cambió y no se
actualizó acá, confiar en lo que el repo correspondiente diga de sí mismo
(su propio `CLAUDE.md`/`README.md`).
