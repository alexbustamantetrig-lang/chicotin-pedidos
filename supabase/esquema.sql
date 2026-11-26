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
--  Columnas que rellena SOLO la base de datos (aunque el cliente las mande, se sobrescriben).
-- ─────────────────────────────────────────────────────────────
alter table public.pedidos add column if not exists origen      text;           -- huella (md5) de la IP, solo para frenar spam
alter table public.pedidos add column if not exists revisar     text;           -- avisos para el personal (precio que no cuadra…)
alter table public.pedidos add column if not exists total_carta numeric(8,2);  -- total recalculado con los precios de la carta
create index if not exists pedidos_status on public.pedidos (status);

-- ─────────────────────────────────────────────────────────────
--  Ajustes: la carta (la sube el panel al abrirse, sacada de carta.js) y los repartidores.
--  Solo el personal puede leerlos y cambiarlos.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.ajustes (
  clave      text primary key check (char_length(clave) <= 40),
  valor      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.ajustes enable row level security;
grant select, insert, update on public.ajustes to authenticated;
drop policy if exists "personal gestiona ajustes" on public.ajustes;
create policy "personal gestiona ajustes" on public.ajustes
  for all to authenticated using (public.es_personal()) with check (public.es_personal());

-- ─────────────────────────────────────────────────────────────
--  Límite de pedidos sin pasar a cocina (status 'nuevo').
--  Solo cuentan los de las últimas 3 horas y no cuentan los encargos (tortilla / empanada),
--  así un pedido olvidado o un encargo para dentro de dos días no bloquean la web.
--  Para cambiar el máximo, cambia el 10 de limite_pedidos() y vuelve a ejecutar esta parte.
-- ─────────────────────────────────────────────────────────────
create or replace function public.limite_pedidos() returns int
language sql immutable as $$ select 10 $$;

create or replace function public.en_espera_ahora() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from pedidos
  where status = 'nuevo' and encargo is null and created_at > now() - interval '3 hours'
$$;
revoke all on function public.en_espera_ahora() from public;

-- Cuántos hay esperando (solo el número, sin datos de nadie). Lo usa la web antes de pedir.
create or replace function public.pedidos_en_espera() returns table (en_espera int, limite int)
language sql stable security definer set search_path = public as $$
  select en_espera_ahora(), limite_pedidos()
$$;
revoke all on function public.pedidos_en_espera() from public;
grant execute on function public.pedidos_en_espera() to anon, authenticated;

-- Precio de una línea según la carta. null = no se reconoce (plato inventado, extra que no existe…).
create or replace function public.precio_linea(c jsonb, it jsonb, dia int) returns numeric
language plpgsql immutable as $$
declare r jsonb := it->'ref'; cat jsonb; p jsonb; u numeric; ex text; e jsonb;
begin
  if r is null then return null; end if;
  if r->>'k' = 'mdd' then
    return (c->'mdd'->>(case when dia in (0, 6) then 'precioFinde' else 'precioSemana' end))::numeric;
  end if;
  if r->>'k' = 'salsa' then
    if not coalesce((c->'salsas'->'lista') ? (r->>'s'), false) then return null; end if;
    return (c->'salsas'->>'precio')::numeric;
  end if;
  if r->>'k' <> 'plato' then return null; end if;
  select x into cat from jsonb_array_elements(c->'carta') x where x->>'id' = r->>'cat';
  if (r->>'i')::int < 0 or coalesce((r->>'v')::int, 0) < 0 then return null; end if;   -- -1 sería "el último"
  p := cat->'platos'->((r->>'i')::int);
  if p is null then return null; end if;
  u := case when p ? 'variantes' then (p->'variantes'->((r->>'v')::int)->>1)::numeric else (p->>'p')::numeric end;
  for ex in select jsonb_array_elements_text(coalesce(r->'ex', '[]'::jsonb)) loop
    e := null;
    select y into e from jsonb_array_elements(c->'extras'->(p->>'extras')) y where y->>0 = ex;
    if e is null then return null; end if;
    u := u + (e->>1)::numeric;
  end loop;
  return u;
exception when others then return null;
end $$;
revoke all on function public.precio_linea(jsonb, jsonb, int) from public;

-- ¿Lo que lee la cocina (nombre, tamaño, extras) es lo mismo que se ha cobrado?
-- Evita, por ejemplo, un "Cachopo" cobrado como si fuera un postre de 2 €.
create or replace function public.linea_coherente(c jsonb, it jsonb) returns boolean
language plpgsql immutable as $$
declare
  r jsonb := it->'ref'; n text := coalesce(it->>'n', '');
  bits text[] := string_to_array(coalesce(it->>'d', ''), ' · ');
  cat jsonb; p jsonb; mas text[]; pedidos_ex text[];
begin
  if r->>'k' = 'mdd' then return n = 'Menú del día'; end if;
  if r->>'k' = 'salsa' then return n = 'Salsa ' || (r->>'s') and coalesce(it->>'d', '') = ''; end if;
  select x into cat from jsonb_array_elements(c->'carta') x where x->>'id' = r->>'cat';
  p := cat->'platos'->((r->>'i')::int);
  if p is null then return false; end if;
  if n not in (p->>'n', 'Hamburguesa ' || (p->>'n'), 'Bocadillo ' || (p->>'n'), 'Sándwich ' || (p->>'n')) then return false; end if;
  if p ? 'variantes' and coalesce(bits[1], '') <> (p->'variantes'->((r->>'v')::int)->>0) then return false; end if;
  select coalesce(array_agg(substr(b, 3) order by substr(b, 3)), '{}') into mas from unnest(bits) b where b like '+ %';
  select coalesce(array_agg(e order by e), '{}') into pedidos_ex from jsonb_array_elements_text(coalesce(r->'ex', '[]'::jsonb)) e;
  return mas = pedidos_ex;
exception when others then return false;
end $$;
revoke all on function public.linea_coherente(jsonb, jsonb) from public;

-- Control de cada pedido nuevo. Rechaza solo lo que es claramente abuso (spam, límite);
-- lo que no cuadra con la carta (precio, horario, fecha de encargo) NO se rechaza: se marca
-- en "revisar" para que el personal lo vea en rojo en el panel. Así nunca se pierde un pedido
-- real por una carta desactualizada.
create or replace function public.comprobar_limite() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c      jsonb := (select valor from ajustes where clave = 'carta');
  ahora  timestamp := now() at time zone 'Europe/Madrid';
  dia    int := extract(dow from ahora)::int;
  hhmm   text := to_char(ahora, 'HH24:MI');
  ip     text;
  hdr    json;
  tel    text := right(regexp_replace(new.telefono, '\D', '', 'g'), 9);
  avisos text[] := '{}';
  it jsonb; q int; u numeric; linea numeric; suma numeric := 0; envio numeric := 0; f date;
begin
  perform pg_advisory_xact_lock(4242);   -- dos pedidos a la vez no se saltan los límites

  -- Reintento del mismo pedido (se cortó la conexión): que choque con la clave primaria y la web lo dé por bueno.
  -- Va después del bloqueo para ver también un primer intento que aún se estaba guardando.
  if exists (select 1 from pedidos where id = new.id) then return new; end if;

  -- IP del cliente. cf-connecting-ip la pone Cloudflare (delante de Supabase) y el cliente no puede falsearla;
  -- x-forwarded-for solo como respaldo. Si las cabeceras no existen o están mal, simplemente no hay IP.
  begin
    hdr := nullif(current_setting('request.headers', true), '')::json;
    ip := trim(coalesce(nullif(hdr->>'cf-connecting-ip', ''), split_part(coalesce(hdr->>'x-forwarded-for', ''), ',', 1)));
  exception when others then ip := '';
  end;
  ip := coalesce(ip, '');

  -- Lo que el cliente no puede decidir.
  new.status := 'nuevo'; new.repartidor := null;
  new.created_at := now(); new.updated_at := now();
  new.origen := case when ip <> '' then md5('chicotin:' || ip) end;
  new.revisar := null; new.total_carta := null;

  if length(tel) < 9 then raise exception 'DATOS_NO_VALIDOS' using errcode = 'P0001'; end if;
  -- Cada línea: un objeto con cantidad entera 1-50 y un total numérico (la web siempre lo manda así).
  if exists (select 1 from jsonb_array_elements(new.items) x
             where jsonb_typeof(x) <> 'object' or coalesce(x->>'qty', '') !~ '^[0-9]{1,2}$'
                or (x->>'qty')::int not between 1 and 50 or jsonb_typeof(x->'total') is distinct from 'number'
                or char_length(coalesce(x->>'n', '')) not between 1 and 80 or char_length(coalesce(x->>'d', '')) > 300) then
    raise exception 'DATOS_NO_VALIDOS' using errcode = 'P0001';
  end if;
  -- Número de pedido del día: 1, 2, 3… y vuelve a empezar cada día (hora de España).
  -- Lo pone la base de datos; la web lo lee después con seguimiento().
  new.num := (select coalesce(max(num::int), 0) + 1 from pedidos
              where (created_at at time zone 'Europe/Madrid')::date = ahora::date and num ~ '^[0-9]{1,9}$')::text;

  -- Anti-spam: por conexión y por teléfono.
  if new.origen is not null and (
       (select count(*) from pedidos where origen = new.origen and created_at > now() - interval '15 minutes') >= 4
    or (select count(*) from pedidos where origen = new.origen and status = 'nuevo' and created_at > now() - interval '3 hours') >= 3) then
    raise exception 'DEMASIADOS_PEDIDOS' using errcode = 'P0001';
  end if;
  if (select count(*) from pedidos where status = 'nuevo' and created_at > now() - interval '3 hours'
        and right(regexp_replace(telefono, '\D', '', 'g'), 9) = tel) >= 2 then
    raise exception 'DEMASIADOS_PEDIDOS' using errcode = 'P0001';
  end if;

  -- Límite de cocina (los encargos van aparte).
  if new.encargo is null and en_espera_ahora() >= limite_pedidos() then
    raise exception 'LIMITE_PEDIDOS' using errcode = 'P0001';
  end if;

  -- Fecha del encargo: mínimo 2 días.
  if new.encargo is not null then
    begin f := new.encargo::date; exception when others then f := null; end;
    if f is null or f < ahora::date + 2 then avisos := avisos || 'Encargo con menos de 2 días de antelación'::text; end if;
  end if;

  -- Precios y horario, comparados con la carta que subió el panel.
  if c is null then
    avisos := avisos || 'Carta sin sincronizar: abre el panel para comprobar precios'::text;
  else
    if not coalesce((c->'config'->>'modoPruebas')::boolean, false) and not exists (
         select 1 from jsonb_array_elements(c->'config'->'horario'->(dia::text)) t
         where hhmm >= t->>0 and hhmm < t->>1) then
      avisos := avisos || 'Hecho con el local cerrado'::text;
    end if;
    for it in select * from jsonb_array_elements(new.items) loop
      q := (it->>'qty')::int; linea := (it->>'total')::numeric;   -- ya validados arriba
      u := precio_linea(c, it, dia);
      if u is null then
        avisos := avisos || format('"%s" no se reconoce en la carta', left(it->>'n', 40));
      elsif round(u * q, 2) <> linea then
        avisos := avisos || format('%s× %s: cobra %s € y en carta son %s €', q, left(it->>'n', 40), linea, round(u * q, 2));
      elsif not linea_coherente(c, it) then
        avisos := avisos || format('"%s %s" no coincide con lo cobrado (revisa plato, tamaño y extras)', left(it->>'n', 40), left(coalesce(it->>'d', ''), 60));
      end if;
      suma := suma + coalesce(round(u * q, 2), linea);
    end loop;
    if new.modo = 'domicilio' then
      envio := coalesce((c->'config'->>'gastosEnvio')::numeric, 0);
      if suma < coalesce((c->'config'->>'pedidoMinimoDomicilio')::numeric, 0) then
        avisos := avisos || 'No llega al pedido mínimo a domicilio'::text;
      end if;
    end if;
    new.total_carta := suma + envio;
    if new.total <> new.total_carta then
      avisos := avisos || format('El total (%s €) no cuadra con la carta (%s €)', new.total, new.total_carta);
    end if;
  end if;

  new.revisar := left(nullif(array_to_string(avisos, ' · '), ''), 600);
  return new;
end $$;
drop trigger if exists pedidos_limite on public.pedidos;
create trigger pedidos_limite before insert on public.pedidos
for each row execute function public.comprobar_limite();

-- ─────────────────────────────────────────────────────────────
--  Cola automática de cocina.
--  En cocina caben CONFIG.capacidadCocina pedidos a la vez (carta.js, por defecto 10).
--  Los pedidos nuevos esperan en cola y entran solos en cocina, por orden de llegada,
--  cada vez que hay hueco (al mandar uno a reparto, marcarlo listo o cancelarlo).
--  Los encargos entran en la cola el día del encargo.
-- ─────────────────────────────────────────────────────────────
create or replace function public.fecha_segura(t text) returns date
language plpgsql immutable as $$
begin return t::date; exception when others then return null; end $$;

create or replace function public.capacidad_cocina() returns int
language sql stable security definer set search_path = public as $$
  select greatest(1, coalesce((select (valor->'config'->>'capacidadCocina')::int from ajustes where clave = 'carta'), 10))
$$;
revoke all on function public.capacidad_cocina() from public;

create or replace function public.llenar_cocina() returns void
language plpgsql security definer set search_path = public as $$
declare hueco int; hoy date := (now() at time zone 'Europe/Madrid')::date;
begin
  perform pg_advisory_xact_lock(4243);   -- dos tablets a la vez no meten pedidos de más
  hueco := capacidad_cocina() - (select count(*) from pedidos where status = 'cocina');
  if hueco <= 0 then return; end if;
  update pedidos set status = 'cocina' where id in (
    select id from pedidos
    where status = 'nuevo' and (encargo is null or fecha_segura(encargo) <= hoy)
    order by created_at limit hueco);
end $$;
revoke all on function public.llenar_cocina() from public;

create or replace function public.tras_cambio_pedidos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() = 1 then perform llenar_cocina(); end if;   -- no se llama a sí misma en bucle
  return null;
end $$;
revoke all on function public.tras_cambio_pedidos() from public;

drop trigger if exists pedidos_llenar_cocina on public.pedidos;
create trigger pedidos_llenar_cocina after insert or update of status on public.pedidos
for each statement execute function public.tras_cambio_pedidos();
drop trigger if exists ajustes_llenar_cocina on public.ajustes;
create trigger ajustes_llenar_cocina after insert or update on public.ajustes
for each statement execute function public.tras_cambio_pedidos();

select public.llenar_cocina();   -- por si ya había pedidos esperando
