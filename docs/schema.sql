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
