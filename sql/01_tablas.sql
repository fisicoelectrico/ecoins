-- E-Coins · tablas (Supabase / Postgres). Todas con RLS y sin políticas: acceso solo vía funciones ec_*.
create table public.ec_personas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  documento text not null unique,
  proceso text not null,
  rol text not null default 'empleado' check (rol in ('empleado','lider','admin')),
  pin_hash text not null,
  debe_cambiar_pin boolean not null default true,
  activo boolean not null default true,
  intentos_fallidos int not null default 0,
  bloqueado_hasta timestamptz,
  created_at timestamptz not null default now()
);
create table public.ec_sesiones (
  token text primary key,
  persona_id uuid not null references public.ec_personas(id) on delete cascade,
  expira timestamptz not null,
  created_at timestamptz not null default now()
);
create index on public.ec_sesiones(persona_id);
create table public.ec_conceptos (
  id text primary key, nombre text not null, cantidad int not null, orden int not null default 0, activo boolean not null default true
);
create table public.ec_movimientos (
  id bigint generated always as identity primary key,
  persona_id uuid not null references public.ec_personas(id) on delete cascade,
  tipo text not null check (tipo in ('ganancia','canje_tiempo','canje_dinero','ajuste','vencimiento')),
  concepto text references public.ec_conceptos(id),
  cantidad int not null,
  mes_logro date,
  sustento text,
  vence date,
  solicitud_id bigint,
  creado_por uuid references public.ec_personas(id),
  created_at timestamptz not null default now()
);
create index on public.ec_movimientos(persona_id);
create unique index ec_mov_unico_concepto_mes on public.ec_movimientos(persona_id, concepto, mes_logro)
  where tipo = 'ganancia' and concepto <> 'mejora';
create table public.ec_solicitudes (
  id bigint generated always as identity primary key,
  persona_id uuid not null references public.ec_personas(id) on delete cascade,
  tipo text not null check (tipo in ('dia','medio','dinero')),
  fecha date,
  costo int not null check (costo > 0),
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada','cancelada')),
  visto_bueno_lider boolean not null default false,
  visto_bueno_por uuid references public.ec_personas(id),
  motivo text,
  resuelto_por uuid references public.ec_personas(id),
  resuelto_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.ec_solicitudes(persona_id);
create index on public.ec_solicitudes(fecha);
create table public.ec_bloqueos (
  id bigint generated always as identity primary key,
  desde date not null, hasta date not null check (hasta >= desde), motivo text not null, proceso text,
  creado_por uuid references public.ec_personas(id), created_at timestamptz not null default now()
);
create table public.ec_festivos (fecha date primary key, nombre text not null);
create table public.ec_notificaciones (
  id bigint generated always as identity primary key,
  persona_id uuid not null references public.ec_personas(id) on delete cascade,
  titulo text not null, cuerpo text, leida boolean not null default false, created_at timestamptz not null default now()
);
create index on public.ec_notificaciones(persona_id, leida);
create table public.ec_config (clave text primary key, valor jsonb not null);

alter table public.ec_personas enable row level security;
alter table public.ec_sesiones enable row level security;
alter table public.ec_conceptos enable row level security;
alter table public.ec_movimientos enable row level security;
alter table public.ec_solicitudes enable row level security;
alter table public.ec_bloqueos enable row level security;
alter table public.ec_festivos enable row level security;
alter table public.ec_notificaciones enable row level security;
alter table public.ec_config enable row level security;
revoke all on public.ec_personas, public.ec_sesiones, public.ec_conceptos, public.ec_movimientos, public.ec_solicitudes,
  public.ec_bloqueos, public.ec_festivos, public.ec_notificaciones, public.ec_config from anon, authenticated;

insert into public.ec_conceptos(id, nombre, cantidad, orden) values
 ('post','Postulado por su proceso',2,1), ('emp','Ganador Empleado del Mes',6,2), ('lidc','Líder que cumple criterios',2,3),
 ('lidg','Ganador Líder del Mes',4,4), ('racha','Racha de 3 meses',2,5), ('mejora','Mejora o poka-yoke implementado',2,6),
 ('final','Finalista anual sin premio mayor',16,7);

insert into public.ec_config(clave, valor) values
 ('valor_ecoin','10000'), ('costo_dia','8'), ('costo_medio','4'), ('cupo_por_proceso','1'), ('anticipacion_habiles','5'),
 ('tope_mensual','12'), ('min_canje_dinero','10'), ('bloquear_diciembre','true'), ('bloquear_semana_festiva','true'), ('bloquear_post_festivo','true');
-- Festivos: copia de public.festivos desde 2026 + Virgen de Chiquinquirá (Ley 2578 de 2026) trasladado por Ley Emiliani.
