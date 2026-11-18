-- ============ Helpers internos ============
create or replace function public.ec__cfg(p_clave text) returns jsonb
language sql stable security definer set search_path = public as $$
  select valor from ec_config where clave = p_clave
$$;

create or replace function public.ec__cfg_int(p_clave text) returns int
language sql stable security definer set search_path = public as $$
  select (valor #>> '{}')::int from ec_config where clave = p_clave
$$;

create or replace function public.ec__cfg_bool(p_clave text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((valor #>> '{}')::boolean, true) from ec_config where clave = p_clave
$$;

create or replace function public.ec__sesion(p_token text) returns public.ec_personas
language plpgsql security definer set search_path = public as $$
declare r ec_personas;
begin
  select p.* into r from ec_sesiones s join ec_personas p on p.id = s.persona_id
   where s.token = p_token and s.expira > now() and p.activo;
  if not found then raise exception 'SESION_INVALIDA'; end if;
  return r;
end $$;

create or replace function public.ec__admin(p_token text) returns public.ec_personas
language plpgsql security definer set search_path = public as $$
declare r ec_personas;
begin
  r := ec__sesion(p_token);
  if r.rol <> 'admin' then raise exception 'NO_AUTORIZADO'; end if;
  return r;
end $$;

create or replace function public.ec__saldo(p_persona uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(cantidad),0)::int from ec_movimientos where persona_id = p_persona
$$;

create or replace function public.ec__comprometido(p_persona uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(costo),0)::int from ec_solicitudes where persona_id = p_persona and estado = 'pendiente'
$$;

create or replace function public.ec__es_festivo(d date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from ec_festivos where fecha = d)
$$;

create or replace function public.ec__habil(d date) returns boolean
language sql stable security definer set search_path = public as $$
  select extract(isodow from d) < 6 and not ec__es_festivo(d)
$$;

create or replace function public.ec__sumar_habiles(d date, n int) returns date
language plpgsql stable security definer set search_path = public as $$
declare x date := d; c int := 0;
begin
  while c < n loop
    x := x + 1;
    if ec__habil(x) then c := c + 1; end if;
  end loop;
  return x;
end $$;

create or replace function public.ec__notificar(p_persona uuid, p_titulo text, p_cuerpo text) returns void
language sql security definer set search_path = public as $$
  insert into ec_notificaciones(persona_id, titulo, cuerpo) values (p_persona, p_titulo, p_cuerpo)
$$;

-- Estado de un día para una persona: ok | pasado | antic | wk | dic | fest | sem | post | emp | cupo | propia
create or replace function public.ec__dia_estado(p_persona uuid, d date, out estado text, out motivo text)
language plpgsql stable security definer set search_path = public as $$
declare
  per ec_personas; prev date; f record; b record; n int;
begin
  select * into per from ec_personas where id = p_persona;
  if d <= current_date then estado := 'pasado'; motivo := 'La fecha ya pasó.'; return; end if;
  if extract(isodow from d) >= 6 then estado := 'wk'; motivo := 'Fin de semana: solo se eligen días de lunes a viernes.'; return; end if;
  select * into f from ec_festivos fe where fe.fecha = d;
  if found then estado := 'fest'; motivo := 'Festivo: ' || f.nombre || '.'; return; end if;
  if ec__cfg_bool('bloquear_diciembre') and extract(month from d) = 12 then
    estado := 'dic'; motivo := 'Diciembre no se puede elegir (cierre colectivo).'; return; end if;
  if ec__cfg_bool('bloquear_semana_festiva') and exists(
      select 1 from ec_festivos fe where fe.fecha between date_trunc('week', d)::date and date_trunc('week', d)::date + 6) then
    estado := 'sem'; motivo := 'Semana con festivo: no se puede elegir ningún día de esa semana.'; return; end if;
  if ec__cfg_bool('bloquear_post_festivo') then
    prev := d - 1;
    while extract(isodow from prev) >= 6 loop prev := prev - 1; end loop;
    if ec__es_festivo(prev) then estado := 'post'; motivo := 'Día hábil siguiente a un festivo.'; return; end if;
  end if;
  select * into b from ec_bloqueos bl where d between bl.desde and bl.hasta and (bl.proceso is null or bl.proceso = per.proceso) order by bl.id limit 1;
  if found then estado := 'emp'; motivo := 'Bloqueado por la empresa: ' || b.motivo || '.'; return; end if;
  if d < ec__sumar_habiles(current_date, ec__cfg_int('anticipacion_habiles')) then
    estado := 'antic'; motivo := 'Se debe pedir con ' || ec__cfg_int('anticipacion_habiles') || ' días hábiles de anticipación.'; return; end if;
  if exists(select 1 from ec_solicitudes so where so.persona_id = p_persona and so.fecha = d and so.estado in ('pendiente','aprobada')) then
    estado := 'propia'; motivo := 'Ya tienes una solicitud para este día.'; return; end if;
  select count(*) into n from ec_solicitudes so join ec_personas pe on pe.id = so.persona_id
   where so.fecha = d and so.estado in ('pendiente','aprobada') and pe.proceso = per.proceso and so.persona_id <> p_persona;
  if n >= ec__cfg_int('cupo_por_proceso') then
    estado := 'cupo'; motivo := 'Cupo lleno: otra persona de tu proceso ya tiene ese día.'; return; end if;
  estado := 'ok'; motivo := null;
end $$;

-- Asignación interna con todas las reglas
create or replace function public.ec__asignar(p_admin uuid, p_persona uuid, p_concepto text, p_mes date, p_sustento text) returns int
language plpgsql security definer set search_path = public as $$
declare
  c ec_conceptos; mes date := date_trunc('month', p_mes)::date; total int; win date; posts int; agregado int := 0;
begin
  select * into c from ec_conceptos where id = p_concepto and activo;
  if not found then raise exception 'CONCEPTO_INVALIDO'; end if;
  if not exists(select 1 from ec_personas where id = p_persona and activo) then raise exception 'PERSONA_INVALIDA'; end if;
  if coalesce(length(trim(p_sustento)),0) < 5 then raise exception 'SUSTENTO_OBLIGATORIO'; end if;
  if mes > date_trunc('month', current_date)::date then raise exception 'MES_FUTURO'; end if;

  if p_concepto = 'emp' and exists(select 1 from ec_movimientos where persona_id = p_persona and concepto = 'emp'
       and tipo = 'ganancia' and extract(year from mes_logro) = extract(year from mes)) then
    raise exception 'EMP_YA_GANO_ESTE_ANIO';
  end if;
  if p_concepto = 'final' and exists(select 1 from ec_movimientos where persona_id = p_persona and concepto = 'final'
       and tipo = 'ganancia' and extract(year from mes_logro) = extract(year from mes)) then
    raise exception 'FINAL_UNA_VEZ_AL_ANIO';
  end if;
  if p_concepto = 'post' then
    select min(mes_logro) into win from ec_movimientos where persona_id = p_persona and concepto = 'emp' and tipo = 'ganancia'
      and extract(year from mes_logro) = extract(year from mes) and mes_logro < mes;
    if win is not null then
      select count(*) into posts from ec_movimientos where persona_id = p_persona and concepto = 'post' and tipo = 'ganancia'
        and mes_logro > win and extract(year from mes_logro) = extract(year from mes);
      if posts >= 3 then raise exception 'POST_MAX_3_TRAS_GANAR'; end if;
    end if;
  end if;

  -- Ganar el mes implica la postulación / cumplimiento base
  if p_concepto = 'emp' and not exists(select 1 from ec_movimientos where persona_id = p_persona and concepto = 'post' and mes_logro = mes and tipo='ganancia') then
    agregado := agregado + ec__asignar(p_admin, p_persona, 'post', mes, p_sustento);
  end if;
  if p_concepto = 'lidg' and not exists(select 1 from ec_movimientos where persona_id = p_persona and concepto = 'lidc' and mes_logro = mes and tipo='ganancia') then
    agregado := agregado + ec__asignar(p_admin, p_persona, 'lidc', mes, p_sustento);
  end if;

  if p_concepto <> 'final' then
    select coalesce(sum(cantidad),0) into total from ec_movimientos
      where persona_id = p_persona and tipo = 'ganancia' and mes_logro = mes and concepto <> 'final';
    if total + c.cantidad > ec__cfg_int('tope_mensual') then raise exception 'TOPE_MENSUAL'; end if;
  end if;

  begin
    insert into ec_movimientos(persona_id, tipo, concepto, cantidad, mes_logro, sustento, vence, creado_por)
    values (p_persona, 'ganancia', p_concepto, c.cantidad, mes, trim(p_sustento), (current_date + interval '12 months')::date, p_admin);
  exception when unique_violation then
    raise exception 'YA_REGISTRADO';
  end;
  perform ec__notificar(p_persona, '+' || c.cantidad || ' e-coins', c.nombre || ' · ' || to_char(mes, 'MM/YYYY'));
  return agregado + c.cantidad;
end $$;

-- ============ API pública (anon) ============
create or replace function public.ec_login(p_documento text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p ec_personas; t text;
begin
  select * into p from ec_personas where documento = trim(p_documento) and activo;
  if not found then return jsonb_build_object('error', 'CREDENCIALES'); end if;
  if p.bloqueado_hasta is not null and p.bloqueado_hasta > now() then return jsonb_build_object('error', 'BLOQUEADO_TEMPORAL'); end if;
  if p.pin_hash <> crypt(coalesce(p_pin,''), p.pin_hash) then
    update ec_personas set
      bloqueado_hasta = case when intentos_fallidos + 1 >= 5 then now() + interval '10 minutes' else null end,
      intentos_fallidos = case when intentos_fallidos + 1 >= 5 then 0 else intentos_fallidos + 1 end
     where id = p.id;
    return jsonb_build_object('error', 'CREDENCIALES');
  end if;
  update ec_personas set intentos_fallidos = 0, bloqueado_hasta = null where id = p.id;
  delete from ec_sesiones where expira < now();
  t := encode(gen_random_bytes(32), 'hex');
  insert into ec_sesiones(token, persona_id, expira) values (t, p.id, now() + interval '30 days');
  return jsonb_build_object('token', t, 'debe_cambiar_pin', p.debe_cambiar_pin, 'rol', p.rol, 'nombre', p.nombre);
end $$;

create or replace function public.ec_logout(p_token text) returns void
language sql security definer set search_path = public as $$
  delete from ec_sesiones where token = p_token
$$;

create or replace function public.ec_cambiar_pin(p_token text, p_actual text, p_nuevo text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare p ec_personas;
begin
  p := ec__sesion(p_token);
  if p.pin_hash <> crypt(p_actual, p.pin_hash) then raise exception 'PIN_ACTUAL_INCORRECTO'; end if;
  if p_nuevo !~ '^[0-9]{4,6}$' then raise exception 'PIN_FORMATO'; end if;
  if p_nuevo = p_actual then raise exception 'PIN_IGUAL'; end if;
  update ec_personas set pin_hash = crypt(p_nuevo, gen_salt('bf')), debe_cambiar_pin = false where id = p.id;
end $$;

create or replace function public.ec_yo(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p ec_personas; anio int := extract(year from current_date);
begin
  p := ec__sesion(p_token);
  return jsonb_build_object(
    'persona', jsonb_build_object('id', p.id, 'nombre', p.nombre, 'documento', p.documento, 'proceso', p.proceso, 'rol', p.rol, 'debe_cambiar_pin', p.debe_cambiar_pin),
    'saldo', ec__saldo(p.id),
    'comprometido', ec__comprometido(p.id),
    'dias_tomados', (select coalesce(sum(case tipo when 'dia' then 1 when 'medio' then 0.5 else 0 end),0) from ec_solicitudes
                      where persona_id = p.id and estado = 'aprobada' and extract(year from fecha) = anio),
    'ganados_anio', (select coalesce(sum(cantidad),0) from ec_movimientos where persona_id = p.id and tipo = 'ganancia' and extract(year from created_at) = anio),
    'proximo_vence', (select min(vence) from ec_movimientos where persona_id = p.id and tipo = 'ganancia' and vence >= current_date),
    'movimientos', coalesce((select jsonb_agg(m order by m.created_at desc) from (
        select mv.id, mv.tipo, mv.concepto, c.nombre as concepto_nombre, mv.cantidad, mv.mes_logro, mv.sustento, mv.created_at, mv.vence
          from ec_movimientos mv left join ec_conceptos c on c.id = mv.concepto
         where mv.persona_id = p.id order by mv.created_at desc limit 60) m), '[]'::jsonb),
    'solicitudes', coalesce((select jsonb_agg(s order by s.created_at desc) from (
        select id, tipo, fecha, costo, estado, visto_bueno_lider, motivo, created_at, resuelto_at
          from ec_solicitudes where persona_id = p.id order by created_at desc limit 40) s), '[]'::jsonb),
    'notificaciones', coalesce((select jsonb_agg(n order by n.created_at desc) from (
        select id, titulo, cuerpo, leida, created_at from ec_notificaciones where persona_id = p.id order by created_at desc limit 40) n), '[]'::jsonb),
    'config', (select jsonb_object_agg(clave, valor) from ec_config),
    'conceptos', (select jsonb_agg(c order by c.orden) from ec_conceptos c where activo)
  );
end $$;

create or replace function public.ec_calendario(p_token text, p_desde date, p_hasta date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p ec_personas; res jsonb := '[]'::jsonb; d date; e record;
begin
  p := ec__sesion(p_token);
  if p_hasta - p_desde > 70 then raise exception 'RANGO_MUY_GRANDE'; end if;
  d := p_desde;
  while d <= p_hasta loop
    e := ec__dia_estado(p.id, d);
    res := res || jsonb_build_object('fecha', d, 'estado', e.estado, 'motivo', e.motivo);
    d := d + 1;
  end loop;
  return res;
end $$;

create or replace function public.ec_solicitar(p_token text, p_fecha date, p_tipo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p ec_personas; e record; costo int; disp int; sid bigint; a record;
begin
  p := ec__sesion(p_token);
  if p_tipo not in ('dia','medio') then raise exception 'TIPO_INVALIDO'; end if;
  perform pg_advisory_xact_lock(hashtext('ec_sol_' || p_fecha::text));
  e := ec__dia_estado(p.id, p_fecha);
  if e.estado <> 'ok' then raise exception 'DIA_NO_DISPONIBLE: %', e.motivo; end if;
  costo := case p_tipo when 'dia' then ec__cfg_int('costo_dia') else ec__cfg_int('costo_medio') end;
  disp := ec__saldo(p.id) - ec__comprometido(p.id);
  if disp < costo then raise exception 'SALDO_INSUFICIENTE'; end if;
  insert into ec_solicitudes(persona_id, tipo, fecha, costo) values (p.id, p_tipo, p_fecha, costo) returning id into sid;
  for a in select id from ec_personas where activo and (rol = 'admin' or (rol = 'lider' and proceso = p.proceso)) and id <> p.id loop
    perform ec__notificar(a.id, 'Nueva solicitud de tiempo libre', p.nombre || ' pidió ' || case p_tipo when 'dia' then 'día completo' else 'medio día' end || ' el ' || to_char(p_fecha, 'DD/MM/YYYY'));
  end loop;
  return jsonb_build_object('id', sid, 'costo', costo);
end $$;

create or replace function public.ec_solicitar_dinero(p_token text, p_cantidad int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p ec_personas; sid bigint; a record;
begin
  p := ec__sesion(p_token);
  if p_cantidad < ec__cfg_int('min_canje_dinero') then raise exception 'MINIMO_DINERO'; end if;
  if ec__saldo(p.id) - ec__comprometido(p.id) < p_cantidad then raise exception 'SALDO_INSUFICIENTE'; end if;
  insert into ec_solicitudes(persona_id, tipo, costo, visto_bueno_lider) values (p.id, 'dinero', p_cantidad, true) returning id into sid;
  for a in select id from ec_personas where activo and rol = 'admin' and id <> p.id loop
    perform ec__notificar(a.id, 'Nueva solicitud de canje en dinero', p.nombre || ' pidió canjear ' || p_cantidad || ' e-coins');
  end loop;
  return jsonb_build_object('id', sid);
end $$;

create or replace function public.ec_cancelar_solicitud(p_token text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare p ec_personas;
begin
  p := ec__sesion(p_token);
  update ec_solicitudes set estado = 'cancelada', resuelto_at = now() where id = p_id and persona_id = p.id and estado = 'pendiente';
  if not found then raise exception 'NO_CANCELABLE'; end if;
end $$;

create or replace function public.ec_marcar_leidas(p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare p ec_personas;
begin
  p := ec__sesion(p_token);
  update ec_notificaciones set leida = true where persona_id = p.id and not leida;
end $$;

-- ============ Líder ============
create or replace function public.ec_lider_pendientes(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p ec_personas;
begin
  p := ec__sesion(p_token);
  if p.rol not in ('lider','admin') then raise exception 'NO_AUTORIZADO'; end if;
  return coalesce((select jsonb_agg(x order by x.fecha) from (
    select s.id, s.tipo, s.fecha, s.costo, s.visto_bueno_lider, s.created_at, pe.nombre, pe.proceso
      from ec_solicitudes s join ec_personas pe on pe.id = s.persona_id
     where s.estado = 'pendiente' and s.tipo <> 'dinero' and pe.proceso = p.proceso and pe.id <> p.id) x), '[]'::jsonb);
end $$;

create or replace function public.ec_visto_bueno(p_token text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare p ec_personas; s record;
begin
  p := ec__sesion(p_token);
  select so.*, pe.proceso, pe.nombre into s from ec_solicitudes so join ec_personas pe on pe.id = so.persona_id where so.id = p_id and so.estado = 'pendiente';
  if not found then raise exception 'NO_ENCONTRADA'; end if;
  if not (p.rol = 'admin' or (p.rol = 'lider' and p.proceso = s.proceso)) then raise exception 'NO_AUTORIZADO'; end if;
  update ec_solicitudes set visto_bueno_lider = true, visto_bueno_por = p.id where id = p_id;
end $$;

-- ============ Admin ============
create or replace function public.ec_admin_resumen(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a ec_personas; anio int := extract(year from current_date);
begin
  a := ec__admin(p_token);
  return jsonb_build_object(
    'personas', coalesce((select jsonb_agg(x order by x.nombre) from (
      select pe.id, pe.nombre, pe.documento, pe.proceso, pe.rol, pe.activo, pe.debe_cambiar_pin,
        ec__saldo(pe.id) as saldo,
        ec__comprometido(pe.id) as comprometido,
        (select coalesce(sum(case tipo when 'dia' then 1 when 'medio' then 0.5 else 0 end),0) from ec_solicitudes
          where persona_id = pe.id and estado = 'aprobada' and extract(year from fecha) = anio) as dias,
        (select coalesce(sum(cantidad),0) from ec_movimientos where persona_id = pe.id and tipo = 'ganancia' and extract(year from mes_logro) = anio) as ganados_anio,
        (select jsonb_build_object('cantidad', mv.cantidad, 'texto', coalesce(c.nombre, mv.tipo), 'fecha', mv.created_at)
           from ec_movimientos mv left join ec_conceptos c on c.id = mv.concepto
          where mv.persona_id = pe.id order by mv.created_at desc limit 1) as ultimo
      from ec_personas pe) x), '[]'::jsonb),
    'pendientes', coalesce((select jsonb_agg(x order by x.created_at) from (
      select s.id, s.tipo, s.fecha, s.costo, s.visto_bueno_lider, s.created_at, pe.id as persona_id, pe.nombre, pe.proceso,
        ec__saldo(pe.id) as saldo
        from ec_solicitudes s join ec_personas pe on pe.id = s.persona_id where s.estado = 'pendiente') x), '[]'::jsonb),
    'recientes', coalesce((select jsonb_agg(x order by x.resuelto_at desc) from (
      select s.id, s.tipo, s.fecha, s.costo, s.estado, s.resuelto_at, pe.nombre
        from ec_solicitudes s join ec_personas pe on pe.id = s.persona_id
       where s.estado in ('aprobada','rechazada') order by s.resuelto_at desc limit 15) x), '[]'::jsonb),
    'bloqueos', coalesce((select jsonb_agg(b order by b.desde) from ec_bloqueos b where b.hasta >= current_date - 30), '[]'::jsonb),
    'festivos', coalesce((select jsonb_agg(f order by f.fecha) from ec_festivos f where f.fecha between current_date - 30 and current_date + 500), '[]'::jsonb),
    'config', (select jsonb_object_agg(clave, valor) from ec_config),
    'conceptos', (select jsonb_agg(c order by c.orden) from ec_conceptos c),
    'kpis', jsonb_build_object(
      'circulacion', (select coalesce(sum(cantidad),0) from ec_movimientos),
      'pendientes', (select count(*) from ec_solicitudes where estado = 'pendiente'),
      'dias_anio', (select coalesce(sum(case tipo when 'dia' then 1 when 'medio' then 0.5 else 0 end),0) from ec_solicitudes where estado='aprobada' and extract(year from fecha) = anio),
      'emitidos_anio', (select coalesce(sum(cantidad),0) from ec_movimientos where tipo = 'ganancia' and extract(year from mes_logro) = anio)
    )
  );
end $$;

create or replace function public.ec_admin_historial(p_token text, p_persona uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a ec_personas;
begin
  a := ec__admin(p_token);
  return coalesce((select jsonb_agg(x order by x.created_at desc) from (
    select mv.id, mv.tipo, mv.concepto, c.nombre as concepto_nombre, mv.cantidad, mv.mes_logro, mv.sustento, mv.created_at,
           pe.nombre, pe.proceso, cr.nombre as creado_por
      from ec_movimientos mv join ec_personas pe on pe.id = mv.persona_id
      left join ec_conceptos c on c.id = mv.concepto left join ec_personas cr on cr.id = mv.creado_por
     where p_persona is null or mv.persona_id = p_persona
     order by mv.created_at desc limit 300) x), '[]'::jsonb);
end $$;

create or replace function public.ec_admin_asignar(p_token text, p_persona uuid, p_concepto text, p_mes date, p_sustento text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a ec_personas; n int;
begin
  a := ec__admin(p_token);
  n := ec__asignar(a.id, p_persona, p_concepto, p_mes, p_sustento);
  return jsonb_build_object('agregados', n, 'saldo', ec__saldo(p_persona));
end $$;

create or replace function public.ec_admin_ajuste(p_token text, p_persona uuid, p_cantidad int, p_motivo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a ec_personas;
begin
  a := ec__admin(p_token);
  if p_cantidad = 0 then raise exception 'CANTIDAD_CERO'; end if;
  if coalesce(length(trim(p_motivo)),0) < 5 then raise exception 'SUSTENTO_OBLIGATORIO'; end if;
  if ec__saldo(p_persona) + p_cantidad < 0 then raise exception 'SALDO_NEGATIVO'; end if;
  insert into ec_movimientos(persona_id, tipo, cantidad, sustento, creado_por, vence)
  values (p_persona, 'ajuste', p_cantidad, trim(p_motivo), a.id, case when p_cantidad > 0 then (current_date + interval '12 months')::date end);
  perform ec__notificar(p_persona, case when p_cantidad > 0 then '+' else '' end || p_cantidad || ' e-coins (corrección)', trim(p_motivo));
  return jsonb_build_object('saldo', ec__saldo(p_persona));
end $$;

create or replace function public.ec_admin_resolver(p_token text, p_id bigint, p_aprobar boolean, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a ec_personas; s ec_solicitudes; txt text;
begin
  a := ec__admin(p_token);
  select * into s from ec_solicitudes where id = p_id and estado = 'pendiente' for update;
  if not found then raise exception 'NO_ENCONTRADA'; end if;
  txt := case s.tipo when 'dia' then 'Día completo ' || to_char(s.fecha,'DD/MM/YYYY')
                     when 'medio' then 'Medio día ' || to_char(s.fecha,'DD/MM/YYYY')
                     else 'Canje en dinero de ' || s.costo || ' e-coins' end;
  if p_aprobar then
    if ec__saldo(s.persona_id) < s.costo then raise exception 'SALDO_INSUFICIENTE'; end if;
    update ec_solicitudes set estado = 'aprobada', resuelto_por = a.id, resuelto_at = now(), motivo = nullif(trim(coalesce(p_motivo,'')),'') where id = p_id;
    insert into ec_movimientos(persona_id, tipo, cantidad, sustento, solicitud_id, creado_por)
    values (s.persona_id, case when s.tipo = 'dinero' then 'canje_dinero' else 'canje_tiempo' end, -s.costo, txt, s.id, a.id);
    perform ec__notificar(s.persona_id, case when s.tipo = 'dinero' then '¡Canje aprobado!' else '¡Tu tiempo libre fue aprobado!' end, txt || ' · −' || s.costo || ' e-coins');
  else
    if coalesce(length(trim(p_motivo)),0) < 3 then raise exception 'MOTIVO_OBLIGATORIO'; end if;
    update ec_solicitudes set estado = 'rechazada', resuelto_por = a.id, resuelto_at = now(), motivo = trim(p_motivo) where id = p_id;
    perform ec__notificar(s.persona_id, 'Solicitud no aprobada', txt || ' · Motivo: ' || trim(p_motivo) || '. Conservas tus e-coins.');
  end if;
end $$;

create or replace function public.ec_admin_persona_guardar(p_token text, p_id uuid, p_nombre text, p_documento text, p_proceso text, p_rol text, p_activo boolean, p_pin text default null) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare a ec_personas; nid uuid;
begin
  a := ec__admin(p_token);
  if coalesce(trim(p_nombre),'') = '' or coalesce(trim(p_documento),'') = '' or coalesce(trim(p_proceso),'') = '' then raise exception 'DATOS_INCOMPLETOS'; end if;
  if p_rol not in ('empleado','lider','admin') then raise exception 'ROL_INVALIDO'; end if;
  if p_id = a.id and (p_rol <> 'admin' or not p_activo) then raise exception 'NO_PUEDES_QUITARTE_ADMIN'; end if;
  if p_id is null then
    if coalesce(p_pin,'') !~ '^[0-9]{4,6}$' then raise exception 'PIN_FORMATO'; end if;
    insert into ec_personas(nombre, documento, proceso, rol, activo, pin_hash)
    values (trim(p_nombre), trim(p_documento), trim(p_proceso), p_rol, coalesce(p_activo,true), crypt(p_pin, gen_salt('bf'))) returning id into nid;
    return nid;
  else
    update ec_personas set nombre = trim(p_nombre), documento = trim(p_documento), proceso = trim(p_proceso), rol = p_rol, activo = p_activo where id = p_id;
    if not p_activo then delete from ec_sesiones where persona_id = p_id; end if;
    return p_id;
  end if;
exception when unique_violation then raise exception 'DOCUMENTO_DUPLICADO';
end $$;

create or replace function public.ec_admin_reset_pin(p_token text, p_id uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare a ec_personas;
begin
  a := ec__admin(p_token);
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'PIN_FORMATO'; end if;
  update ec_personas set pin_hash = crypt(p_pin, gen_salt('bf')), debe_cambiar_pin = true, intentos_fallidos = 0, bloqueado_hasta = null where id = p_id;
  delete from ec_sesiones where persona_id = p_id;
end $$;

create or replace function public.ec_admin_importar_personas(p_token text, p_filas jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare a ec_personas; f jsonb; ok int := 0; errores jsonb := '[]'::jsonb; i int := 0; r text;
begin
  a := ec__admin(p_token);
  for f in select * from jsonb_array_elements(p_filas) loop
    i := i + 1;
    begin
      r := lower(coalesce(nullif(trim(f->>'rol'),''),'empleado'));
      if r not in ('empleado','lider','admin') then raise exception 'ROL_INVALIDO'; end if;
      if coalesce(f->>'pin','') !~ '^[0-9]{4,6}$' then raise exception 'PIN_FORMATO'; end if;
      if coalesce(trim(f->>'nombre'),'') = '' or coalesce(trim(f->>'documento'),'') = '' or coalesce(trim(f->>'proceso'),'') = '' then raise exception 'DATOS_INCOMPLETOS'; end if;
      insert into ec_personas(nombre, documento, proceso, rol, pin_hash)
      values (trim(f->>'nombre'), trim(f->>'documento'), trim(f->>'proceso'), r, crypt(f->>'pin', gen_salt('bf')));
      ok := ok + 1;
    exception when unique_violation then
      errores := errores || jsonb_build_object('fila', i, 'error', 'DOCUMENTO_DUPLICADO');
    when others then
      errores := errores || jsonb_build_object('fila', i, 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('ok', ok, 'errores', errores);
end $$;

create or replace function public.ec_admin_importar_logros(p_token text, p_filas jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a ec_personas; f jsonb; pid uuid; ok int := 0; total int := 0; n int; errores jsonb := '[]'::jsonb; i int := 0;
begin
  a := ec__admin(p_token);
  for f in select value from jsonb_array_elements(p_filas) order by (value->>'mes'), case lower(value->>'concepto') when 'emp' then 2 when 'lidg' then 2 when 'final' then 3 else 1 end loop
    i := i + 1;
    begin
      pid := null;
      select id into pid from ec_personas where documento = trim(f->>'documento');
      if pid is null then raise exception 'DOCUMENTO_NO_EXISTE'; end if;
      n := ec__asignar(a.id, pid, lower(trim(f->>'concepto')), (f->>'mes')::date,
             coalesce(nullif(trim(f->>'sustento'),''), 'Carga retroactiva ' || extract(year from (f->>'mes')::date)));
      ok := ok + 1; total := total + n;
    exception when others then
      errores := errores || jsonb_build_object('fila', i, 'documento', f->>'documento', 'concepto', f->>'concepto', 'mes', f->>'mes', 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('ok', ok, 'ecoins', total, 'errores', errores);
end $$;

create or replace function public.ec_admin_calcular_rachas(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a ec_personas; r record; n int := 0;
begin
  a := ec__admin(p_token);
  for r in
    with m as (
      select distinct persona_id, mes_logro as mes from ec_movimientos
       where tipo = 'ganancia' and concepto in ('post','lidc')),
    g as (
      select persona_id, mes, (mes - make_interval(months => (row_number() over (partition by persona_id order by mes))::int))::date as grp from m),
    b as (
      select persona_id, mes, row_number() over (partition by persona_id, grp order by mes) as k from g)
    select persona_id, mes from b where k % 3 = 0
  loop
    if not exists(select 1 from ec_movimientos where persona_id = r.persona_id and concepto = 'racha' and mes_logro = r.mes) then
      begin
        perform ec__asignar(a.id, r.persona_id, 'racha', r.mes, 'Racha de 3 meses calculada automáticamente');
        n := n + 1;
      exception when others then null;
      end;
    end if;
  end loop;
  return jsonb_build_object('rachas', n);
end $$;

create or replace function public.ec_admin_bloqueo_guardar(p_token text, p_desde date, p_hasta date, p_motivo text, p_proceso text) returns bigint
language plpgsql security definer set search_path = public as $$
declare a ec_personas; nid bigint;
begin
  a := ec__admin(p_token);
  if coalesce(trim(p_motivo),'') = '' then raise exception 'MOTIVO_OBLIGATORIO'; end if;
  if p_hasta < p_desde then raise exception 'RANGO_INVALIDO'; end if;
  insert into ec_bloqueos(desde, hasta, motivo, proceso, creado_por) values (p_desde, p_hasta, trim(p_motivo), nullif(trim(coalesce(p_proceso,'')),''), a.id) returning id into nid;
  return nid;
end $$;

create or replace function public.ec_admin_bloqueo_borrar(p_token text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare a ec_personas;
begin
  a := ec__admin(p_token);
  delete from ec_bloqueos where id = p_id;
end $$;

create or replace function public.ec_admin_festivo_guardar(p_token text, p_fecha date, p_nombre text) returns void
language plpgsql security definer set search_path = public as $$
declare a ec_personas;
begin
  a := ec__admin(p_token);
  insert into ec_festivos(fecha, nombre) values (p_fecha, coalesce(nullif(trim(p_nombre),''),'Festivo'))
  on conflict (fecha) do update set nombre = excluded.nombre;
end $$;

create or replace function public.ec_admin_festivo_borrar(p_token text, p_fecha date) returns void
language plpgsql security definer set search_path = public as $$
declare a ec_personas;
begin
  a := ec__admin(p_token);
  delete from ec_festivos where fecha = p_fecha;
end $$;

create or replace function public.ec_admin_config_guardar(p_token text, p_clave text, p_valor jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare a ec_personas;
begin
  a := ec__admin(p_token);
  update ec_config set valor = p_valor where clave = p_clave;
  if not found then raise exception 'CLAVE_INVALIDA'; end if;
end $$;

-- ============ Permisos ============
do $$
declare fn record;
begin
  for fn in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'ec\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.sig);
    if fn.proname not like 'ec\_\_%' then
      execute format('grant execute on function %s to anon, authenticated', fn.sig);
    end if;
  end loop;
end $$;
