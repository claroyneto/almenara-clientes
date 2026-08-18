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
  -- Campos definidos a mano por la usuaria en la pantalla "Configurar
  -- campos" (ver definiciones_campos) — nunca requieren migración de
  -- schema para agregar uno nuevo. { "<id de definiciones_campos>": valor }
  campos_extra jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- Campos adicionales que la usuaria puede agregar/quitar desde la web sin
-- tocar código ni el esquema — nombre, rubro y etapa siguen siendo fijos
-- porque el bot de Telegram depende de ellos con una conversación ya
-- armada; esto es solo para lo que el bot no pregunta.
create table if not exists public.definiciones_campos (
  id uuid primary key default gen_random_uuid(),
  etiqueta text not null,
  tipo text not null check (tipo in ('texto','numero','seleccion')),
  opciones jsonb, -- solo si tipo = 'seleccion': array de strings
  orden int not null default 0,
  creado_en timestamptz not null default now()
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
alter table public.definiciones_campos enable row level security;
-- usuarios_bot y bot_estado: solo los toca la función del bot con la
-- service_role key (bypasea RLS). RLS habilitado sin políticas para
-- 'authenticated' deniega todo desde la página web, que es lo correcto.
alter table public.usuarios_bot enable row level security;
alter table public.bot_estado enable row level security;

-- security definer para poder chequear usuarios_autorizados desde las
-- políticas de clientes/notas sin que esas subqueries queden sujetas a
-- RLS de usuarios_autorizados (que no tiene políticas para 'authenticated'
-- y, evaluada como el usuario que llama, siempre devolvería falso).
create or replace function public.es_autorizado() returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.usuarios_autorizados u
                   where u.email = auth.jwt()->>'email');
  $$;
revoke all on function public.es_autorizado() from public, anon;
grant execute on function public.es_autorizado() to authenticated;

alter table public.usuarios_autorizados enable row level security;
-- Sin políticas para 'authenticated': solo el bot (service_role, bypasea RLS)
-- escribe/lee esta tabla directo. Los usuarios normales solo la consultan
-- indirectamente a través de public.es_autorizado().

drop policy if exists clientes_select on public.clientes;
create policy clientes_select on public.clientes for select to authenticated
  using (public.es_autorizado());

drop policy if exists clientes_insert on public.clientes;
create policy clientes_insert on public.clientes for insert to authenticated
  with check (public.es_autorizado());

drop policy if exists clientes_update on public.clientes;
create policy clientes_update on public.clientes for update to authenticated
  using (public.es_autorizado())
  with check (public.es_autorizado());

drop policy if exists notas_select on public.notas;
create policy notas_select on public.notas for select to authenticated
  using (public.es_autorizado());

drop policy if exists notas_insert on public.notas;
create policy notas_insert on public.notas for insert to authenticated
  with check (public.es_autorizado());

drop policy if exists definiciones_campos_select on public.definiciones_campos;
create policy definiciones_campos_select on public.definiciones_campos for select to authenticated
  using (public.es_autorizado());

drop policy if exists definiciones_campos_insert on public.definiciones_campos;
create policy definiciones_campos_insert on public.definiciones_campos for insert to authenticated
  with check (public.es_autorizado());

drop policy if exists definiciones_campos_delete on public.definiciones_campos;
create policy definiciones_campos_delete on public.definiciones_campos for delete to authenticated
  using (public.es_autorizado());

create index if not exists notas_cliente_id_idx on public.notas(cliente_id);

comment on table public.clientes is 'Clientes/prospectos comerciales de Almenara — no de un cliente de terceros.';
