-- ─────────────────────────────────────────────────────────────
--  Base de datos de pedidos de Chicotín (Supabase)
--  Pégalo entero en Supabase → SQL Editor → Run.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.pedidos (
  id          uuid primary key,
  num         text not null check (char_length(num) between 1 and 10),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  status      text not null default 'nuevo'
              check (status in ('nuevo','cocina','reparto','listo','entregado','cancelado')),
  modo        text not null check (modo in ('domicilio','recoger')),
  hora        text check (char_length(hora) <= 60),
  encargo     text check (char_length(encargo) <= 20),
  nombre      text not null check (char_length(nombre) between 1 and 80),
  telefono    text not null check (char_length(telefono) between 9 and 20),
  direccion   text check (char_length(direccion) <= 200),
  items       jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 60),
  total       numeric(8,2) not null check (total >= 0 and total < 1000),
  pago        text not null check (pago in ('Efectivo','Tarjeta','Bizum')),
  notas       text check (char_length(notas) <= 500),
  repartidor  text check (char_length(repartidor) <= 40)
);
-- (si la tabla ya existía de antes)
alter table public.pedidos add column if not exists repartidor text check (char_length(repartidor) <= 40);
create index if not exists pedidos_created_at on public.pedidos (created_at desc);

-- Quién es personal del restaurante (puede ver y mover pedidos en el panel).
create table if not exists public.personal (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.es_personal() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from personal where user_id = auth.uid())
$$;

-- updated_at automático
create or replace function public.tocar_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists pedidos_updated_at on public.pedidos;
create trigger pedidos_updated_at before update on public.pedidos
for each row execute function public.tocar_updated_at();

-- Permisos de tabla (los proyectos nuevos de Supabase no los dan por defecto).
-- Lo que cada uno puede hacer DE VERDAD lo deciden las reglas RLS de abajo.
grant insert on public.pedidos to anon, authenticated;
grant select, update on public.pedidos to authenticated;

-- Seguridad (RLS)
alter table public.pedidos  enable row level security;
alter table public.personal enable row level security;

drop policy if exists "clientes crean pedidos" on public.pedidos;
create policy "clientes crean pedidos" on public.pedidos
  for insert to anon, authenticated with check (status = 'nuevo');

drop policy if exists "personal ve pedidos" on public.pedidos;
create policy "personal ve pedidos" on public.pedidos
  for select to authenticated using (public.es_personal());

drop policy if exists "personal mueve pedidos" on public.pedidos;
create policy "personal mueve pedidos" on public.pedidos
  for update to authenticated using (public.es_personal()) with check (public.es_personal());

-- Seguimiento: el cliente solo ve SU pedido (con el id secreto del enlace)
-- y sin datos personales (ni nombre, ni teléfono, ni dirección).
create or replace function public.seguimiento(p_id uuid)
returns table (num text, status text, modo text, hora text, items jsonb, total numeric,
               created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select num, status, modo, hora, items, total, created_at, updated_at
  from pedidos where id = p_id
$$;
revoke all on function public.seguimiento(uuid) from public;
grant execute on function public.seguimiento(uuid) to anon, authenticated;

-- Tiempo real para el panel
do $$ begin
  alter publication supabase_realtime add table public.pedidos;
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────
--  DESPUÉS: crea el usuario del restaurante en Authentication → Users → Add user
--  y dale acceso al panel cambiando el correo aquí abajo y ejecutando solo esta línea:
--
--  insert into public.personal (user_id)
--  select id from auth.users where email = 'cocina@ejemplo.com';
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
--  Límite de pedidos sin pasar a cocina (status 'nuevo').
--  Para cambiar el máximo, cambia el 10 de limite_pedidos() y vuelve a ejecutar esta parte.
-- ─────────────────────────────────────────────────────────────
create or replace function public.limite_pedidos() returns int
language sql immutable as $$ select 10 $$;

-- Cuántos hay esperando (solo el número, sin datos de nadie). Lo usa la web antes de pedir.
create or replace function public.pedidos_en_espera() returns table (en_espera int, limite int)
language sql stable security definer set search_path = public as $$
  select (select count(*)::int from pedidos where status = 'nuevo'), limite_pedidos()
$$;
revoke all on function public.pedidos_en_espera() from public;
grant execute on function public.pedidos_en_espera() to anon, authenticated;

-- El límite lo hace cumplir la base de datos, no solo la web.
create or replace function public.comprobar_limite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(4242);   -- dos pedidos a la vez no se saltan el límite
  if (select count(*) from pedidos where status = 'nuevo') >= limite_pedidos() then
    raise exception 'LIMITE_PEDIDOS' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists pedidos_limite on public.pedidos;
create trigger pedidos_limite before insert on public.pedidos
for each row execute function public.comprobar_limite();
