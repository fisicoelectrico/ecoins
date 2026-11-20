'use strict';
/* E-Coins · Eco Solar — web app (vanilla JS + Supabase RPC) */

const SB_URL = 'https://zdhkhsrwvvripuczhvam.supabase.co';
const SB_KEY = 'sb_publishable_qY1cvnQFjr3_V2oJcj5JHw_B442NbhZ';
const TK = 'ec_token';

const S = {
  token: localStorage.getItem(TK) || null,
  loginPin: null,
  me: null,
  admin: null,
  cal: { year: null, month: null, tipo: 'dia', dias: [], sel: null, msg: '' },
  asg: { persona: null, concepto: 'post', mes: null, filtro: '', proceso: '' },
  lider: [],
  historial: null,
  tard: null,
};

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtNum = (n) => new Intl.NumberFormat('es-CO').format(n || 0);
const money = (n) => '$' + fmtNum(n);
const pDate = (s) => { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const fDate = (s, o = { day: 'numeric', month: 'short', year: 'numeric' }) => { const d = pDate(s); return d ? d.toLocaleDateString('es-CO', o) : ''; };
const fDateLong = (s) => { const t = fDate(s, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
const fMes = (s) => { const d = pDate(s); if (!d) return ''; const t = d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
const fTs = (s) => s ? new Date(s).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const cfg = (k) => { const c = (S.admin && S.admin.config) || (S.me && S.me.config) || {}; return c[k]; };
const cfgN = (k, def) => { const v = Number(cfg(k)); return Number.isFinite(v) ? v : def; };
const isAdmin = () => S.me && S.me.persona.rol === 'admin';
const isLider = () => S.me && (S.me.persona.rol === 'lider' || S.me.persona.rol === 'admin' || S.me.persona.es_lider);
const ganaEcoins = (p) => p.rol !== 'admin' || p.es_lider;
const soloAdmin = () => S.me && S.me.persona.rol === 'admin' && !S.me.persona.es_lider;
const esLiderProceso = () => S.me && (S.me.persona.rol === 'lider' || S.me.persona.es_lider);

const ERR = {
  SESION_INVALIDA: 'Tu sesión venció. Ingresa de nuevo.',
  CREDENCIALES: 'Cédula o PIN incorrectos.',
  HONOR_SIN_GANAR: 'La postulación de honor es solo para quien ya fue Empleado del Mes este año.',
  FECHA_FUTURA: 'La fecha no puede ser futura.',
  TARDANZA_DUPLICADA: 'Ya hay una llegada tarde registrada ese día para esa persona.',
  ADMIN_NO_GANA: 'Los administradores que no lideran un proceso no ganan e-coins.',
  CEDULA_NO_REGISTRADA: 'Esa cédula no está registrada. Avísale a gerencia o subgerencia.',
  PIN_ADMIN_REQUERIDO: 'Un administrador necesita PIN (4 a 6 números).',
  BLOQUEADO_TEMPORAL: 'Demasiados intentos. Espera 10 minutos.',
  NO_AUTORIZADO: 'No tienes permiso para esta acción.',
  PIN_ACTUAL_INCORRECTO: 'El PIN actual no es correcto.',
  PIN_FORMATO: 'El PIN debe tener entre 4 y 6 números.',
  PIN_IGUAL: 'El PIN nuevo debe ser diferente al actual.',
  SUSTENTO_OBLIGATORIO: 'El sustento es obligatorio (mínimo 5 caracteres).',
  CONCEPTO_INVALIDO: 'Concepto no válido.',
  PERSONA_INVALIDA: 'La persona no existe o está inactiva.',
  MES_FUTURO: 'No se pueden cargar logros de meses futuros.',
  EMP_YA_GANO_ESTE_ANIO: 'Esta persona ya fue Empleado del Mes este año.',
  FINAL_UNA_VEZ_AL_ANIO: 'El bono de finalista ya se cargó este año.',
  TOPE_MENSUAL: 'Supera el tope de e-coins por persona en ese mes.',
  YA_REGISTRADO: 'Ese logro ya está registrado para ese mes.',
  SALDO_INSUFICIENTE: 'No tienes e-coins suficientes (se descuentan las solicitudes pendientes).',
  MINIMO_DINERO: 'El canje en dinero tiene un mínimo de e-coins.',
  NO_CANCELABLE: 'Esa solicitud ya no se puede cancelar.',
  NO_ENCONTRADA: 'La solicitud ya fue resuelta.',
  MOTIVO_OBLIGATORIO: 'Escribe el motivo.',
  DATOS_INCOMPLETOS: 'Faltan datos obligatorios.',
  ROL_INVALIDO: 'Rol no válido.',
  DOCUMENTO_DUPLICADO: 'Ya existe una persona con esa cédula.',
  DOCUMENTO_NO_EXISTE: 'La cédula no existe.',
  NO_PUEDES_QUITARTE_ADMIN: 'No puedes quitarte el rol de administrador ni desactivarte.',
  SALDO_NEGATIVO: 'La corrección dejaría el saldo negativo.',
  CANTIDAD_CERO: 'La cantidad no puede ser cero.',
  RANGO_INVALIDO: 'La fecha final debe ser igual o posterior a la inicial.',
  RANGO_MUY_GRANDE: 'Rango de fechas muy grande.',
  TIPO_INVALIDO: 'Tipo no válido.',
  CLAVE_INVALIDA: 'Configuración no válida.',
};
function traducir(msg) {
  const m = String(msg || '');
  if (m.startsWith('DIA_NO_DISPONIBLE')) return m.split(':').slice(1).join(':').trim() || 'Ese día no está disponible.';
  const k = Object.keys(ERR).find((x) => m.includes(x));
  return k ? ERR[k] : (m || 'Ocurrió un error. Intenta de nuevo.');
}

async function rpc(fn, args = {}) {
  let r;
  try {
    r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
  } catch (e) {
    throw new Error('Sin conexión. Revisa tu internet.');
  }
  const txt = await r.text();
  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
  if (!r.ok) {
    const msg = (data && (data.message || data.hint)) || r.statusText;
    if (String(msg).includes('SESION_INVALIDA')) { salir(true); }
    throw new Error(traducir(msg));
  }
  return data;
}

let toastT;
function toast(msg, bad = false) {
  const t = $('#toast');
  t.textContent = msg; t.className = bad ? 'bad' : ''; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3800);
}
function modal(html) { const m = $('#modal'); m.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">${html}</div>`; m.hidden = false; const f = m.querySelector('input,select,textarea,button'); if (f) f.focus(); }
function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }
async function busy(btn, fn) {
  const old = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin" aria-hidden="true"></span>'; }
  try { return await fn(); }
  catch (e) { toast(e.message, true); return undefined; }
  finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = old; } }
}

/* ---------- sesión ---------- */
async function cargarYo() { S.me = await rpc('ec_yo', { p_token: S.token }); }
async function cargarAdmin() { if (isAdmin()) S.admin = await rpc('ec_admin_resumen', { p_token: S.token }); }
async function cargarLider() { if (isLider()) S.lider = await rpc('ec_lider_pendientes', { p_token: S.token }); }

function salir(silencioso) {
  const t = S.token;
  S.token = null; S.me = null; S.admin = null; S.historial = null;
  localStorage.removeItem(TK);
  if (t && !silencioso) rpc('ec_logout', { p_token: t }).catch(() => {});
  location.hash = '#/';
  render();
}

/* ---------- vistas: acceso ---------- */
function vLogin() {
  return `<div class="login"><form class="card stack" id="f-login" autocomplete="on">
    <div class="brand" style="color:var(--ink)"><div class="logo">e</div>E-Coins <span class="small" style="font-family:Inter;font-weight:400">Eco Solar</span></div>
    <div><h1>${S.loginPin ? `Hola, ${esc(S.loginPin.nombre)}` : 'Ingresar'}</h1><p class="sub">${S.loginPin ? 'Tu cuenta es de administrador: escribe tu PIN.' : 'Escribe tu número de cédula.'}</p></div>
    <label class="f">Cédula<input class="in" name="doc" inputmode="numeric" autocomplete="username" required value="${esc(S.loginPin ? S.loginPin.doc : '')}" ${S.loginPin ? 'readonly' : 'autofocus'}></label>
    ${S.loginPin ? '<label class="f">PIN<input class="in" name="pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="6" required autofocus></label>' : ''}
    <div class="err" id="login-err" role="alert"></div>
    <button class="btn block" type="submit">Entrar</button>
    ${S.loginPin ? '<button class="btn out block" type="button" data-act="otra-cedula">Usar otra cédula</button>' : '<p class="help">Si tu cédula no aparece, avísale a gerencia o subgerencia.</p>'}
  </form></div>`;
}
function vCambiarPin(forzado) {
  return `${forzado ? '' : header()}<main class="narrow" style="margin:0 auto"><form class="card stack" id="f-pin">
    <div><h1>${forzado ? 'Crea tu PIN personal' : 'Cambiar PIN'}</h1><p class="sub">${forzado ? 'Por seguridad, cambia el PIN temporal que te dieron.' : 'Entre 4 y 6 números.'}</p></div>
    <label class="f">PIN actual<input class="in" name="a" type="password" inputmode="numeric" maxlength="6" required autocomplete="current-password"></label>
    <label class="f">PIN nuevo (4 a 6 números)<input class="in" name="n" type="password" inputmode="numeric" maxlength="6" required autocomplete="new-password"></label>
    <label class="f">Repite el PIN nuevo<input class="in" name="c" type="password" inputmode="numeric" maxlength="6" required autocomplete="new-password"></label>
    <div class="err" id="pin-err" role="alert"></div>
    <button class="btn block" type="submit">Guardar PIN</button>
    ${forzado ? '<button type="button" class="btn out block" data-act="salir">Salir</button>' : ''}
  </form></main>`;
}

/* ---------- layout ---------- */
function header() {
  const p = S.me.persona;
  const r = route();
  const unread = (S.me.notificaciones || []).filter((n) => !n.leida).length;
  const pend = S.admin ? S.admin.kpis.pendientes : 0;
  const liderPend = (S.lider || []).filter((x) => !x.visto_bueno_lider).length;
  const t = (h, label, extra = '') => `<a class="tab ${r === h ? 'on' : ''}" href="#/${h}">${label}${extra}</a>`;
  return `<header class="top"><div class="top-in">
      <div class="brand"><div class="logo" aria-hidden="true">e</div>E-Coins</div>
      <div class="who"><div><b>${esc(p.nombre)}</b><small>${esc(p.proceso)} · ${esc(rolTxt(p.rol))}</small></div>
      <button class="btn-ghost-dark" data-act="salir">Salir</button></div>
    </div></header>
    <nav class="tabs" aria-label="Secciones"><div class="tabs-in">
      ${soloAdmin() ? '' : `${t('inicio', 'Inicio')}${t('calendario', 'Pedir tiempo')}${t('solicitudes', 'Mis solicitudes')}`}
      ${t('avisos', 'Avisos', unread ? ` <span class="badge">${unread}</span>` : '')}
      ${esLiderProceso() ? t('lider', 'Mi proceso', liderPend ? ` <span class="badge">${liderPend}</span>` : '') : ''}
      ${isAdmin() ? `<span class="tab-sep" aria-hidden="true"></span>
        ${t('admin/saldos', 'Saldos y asignación')}${t('admin/solicitudes', 'Aprobar', pend ? ` <span class="badge">${pend}</span>` : '')}
        ${t('admin/registrar', 'Registrar mes')}${t('admin/calendario', 'Días y reglas')}${t('admin/tardanzas', 'Llegadas tarde')}${t('admin/personas', 'Personas')}${t('admin/historial', 'Historial')}` : ''}
      ${isAdmin() ? t('pin', 'Cambiar PIN') : ''}
    </div></nav>`;
}
const rolTxt = (r) => ({ empleado: 'Empleado', lider: 'Líder', admin: 'Administrador' }[r] || r);
function route() { const h = location.hash.replace(/^#\/?/, ''); return h || 'inicio'; }

/* ---------- empleado ---------- */
const movTxt = (m) => {
  if (m.tipo === 'ganancia') return m.concepto_nombre || 'Logro';
  if (m.tipo === 'canje_tiempo') return m.sustento || 'Tiempo libre';
  if (m.tipo === 'canje_dinero') return 'Canje en dinero';
  if (m.tipo === 'ajuste') return 'Corrección: ' + (m.sustento || '');
  if (m.tipo === 'descuento') return m.sustento || 'Llegada tarde';
  return m.tipo;
};
const solTxt = (s) => s.tipo === 'dia' ? 'Día completo' : s.tipo === 'medio' ? 'Medio día' : 'Canje en dinero';
const estadoPill = (e) => `<span class="pill ${{ pendiente: 'pend', aprobada: 'ok', rechazada: 'no', cancelada: 'can' }[e]}">${esc(e.charAt(0).toUpperCase() + e.slice(1))}</span>`;

function equivalencia(n) {
  const dia = cfgN('costo_dia', 8);
  const d = Math.floor(n / dia), h = n % dia;
  const partes = [];
  if (d) partes.push(`${d} día${d > 1 ? 's' : ''}`);
  if (h || !d) partes.push(`${h} hora${h === 1 ? '' : 's'}`);
  return `${partes.join(' y ')} libres · o ${money(n * cfgN('valor_ecoin', 10000))}`;
}

function vInicio() {
  const m = S.me, disp = m.saldo - m.comprometido;
  const pend = (m.solicitudes || []).filter((s) => s.estado === 'pendiente');
  return `${header()}<main class="narrow" style="margin:0 auto;width:100%">
    <div><p class="sub" style="margin:0">Hola,</p><h1>${esc(m.persona.nombre.split(' ')[0])}</h1></div>
    <section class="hero" aria-label="Mi saldo">
      <div class="lab">Mi saldo</div>
      <div class="big"><b>${m.saldo}</b><span>e-coins</span></div>
      <div class="eq">= ${equivalencia(m.saldo)}</div>
      ${m.comprometido ? `<div class="eq">${m.comprometido} reservados en solicitudes · disponibles ${disp}</div>` : ''}
      <div class="acts"><a class="btn amber" href="#/calendario">Pedir tiempo libre</a><button class="btn dark" data-act="dinero">Canjear en dinero</button></div>
    </section>
    <div class="grid g2">
      <div class="card kpi"><div class="lab">Libres tomados ${new Date().getFullYear()}</div><div class="val">${String(m.dias_tomados).replace('.', ',')} ${Number(m.dias_tomados) === 1 ? 'día' : 'días'}</div></div>
      <div class="card kpi"><div class="lab">Ganados este año</div><div class="val">${m.ganados_anio}</div></div>
    </div>
    ${m.proximo_vence ? `<div class="note">Tus e-coins más antiguos vencen el <b>${fDate(m.proximo_vence)}</b> (12 meses desde que se cargan).</div>` : ''}
    ${pend.length ? `<section class="card"><h2 style="margin-bottom:6px">En curso</h2><div class="list">${pend.map((s) => `
      <div><div><b>${solTxt(s)}${s.fecha ? ' · ' + fDate(s.fecha) : ''}</b><div class="small">${s.visto_bueno_lider ? 'Líder dio visto bueno · ' : ''}Esperando aprobación · −${s.costo}</div></div>
      <button class="btn danger sm" data-act="cancelar" data-id="${s.id}">Cancelar</button></div>`).join('')}</div></section>` : ''}
    <section class="card"><h2 style="margin-bottom:6px">Movimientos</h2>
      ${(m.movimientos || []).length ? `<div class="list">${m.movimientos.slice(0, 25).map((x) => `
        <div><div><b style="font-size:14px">${esc(movTxt(x))}</b><div class="small">${x.mes_logro ? fMes(x.mes_logro) + ' · ' : ''}${fTs(x.created_at)}</div></div>
        <div class="${x.cantidad > 0 ? 'pos' : 'neg'}">${x.cantidad > 0 ? '+' : '−'}${Math.abs(x.cantidad)}</div></div>`).join('')}</div>`
      : '<div class="empty">Aún no tienes movimientos. Cada postulación suma.</div>'}
    </section>
    <section class="card"><h2 style="margin-bottom:8px">¿Cómo se ganan?</h2><div class="list">
      ${(m.conceptos || []).map((c) => `<div><span style="font-size:14px">${esc(c.nombre)}</span><span class="pos">+${c.cantidad}</span></div>`).join('')}
    </div><p class="help" style="margin:10px 0 0">1 e-coin = 1 hora libre o ${money(cfgN('valor_ecoin', 10000))}. Día completo = ${cfgN('costo_dia', 8)} · Medio día = ${cfgN('costo_medio', 4)}.</p></section>
  </main>`;
}

function vSolicitudes() {
  const l = S.me.solicitudes || [];
  return `${header()}<main class="narrow" style="margin:0 auto;width:100%"><h1>Mis solicitudes</h1>
    <section class="card">${l.length ? `<div class="list">${l.map((s) => `
      <div><div><b>${solTxt(s)}${s.fecha ? ' · ' + fDate(s.fecha) : ''}</b>
        <div class="small">−${s.costo} e-coins · pedida ${fTs(s.created_at)}${s.motivo ? ' · ' + esc(s.motivo) : ''}</div></div>
        <div class="row">${estadoPill(s.estado)}${s.estado === 'pendiente' ? `<button class="btn danger sm" data-act="cancelar" data-id="${s.id}">Cancelar</button>` : ''}</div></div>`).join('')}</div>`
      : '<div class="empty">No has hecho solicitudes.</div>'}</section></main>`;
}

function vAvisos() {
  const l = S.me.notificaciones || [];
  return `${header()}<main class="narrow" style="margin:0 auto;width:100%"><h1>Avisos</h1>
    <section class="card">${l.length ? `<div class="list">${l.map((n) => `
      <div><div><b style="${n.leida ? 'font-weight:600' : ''}">${n.leida ? '' : '<span class="badge" style="margin-right:6px">Nuevo</span>'}${esc(n.titulo)}</b>
      <div class="small">${esc(n.cuerpo || '')}</div><div class="small">${fTs(n.created_at)}</div></div></div>`).join('')}</div>`
      : '<div class="empty">No tienes avisos.</div>'}</section></main>`;
}

/* ---------- calendario ---------- */
function calInit() {
  if (S.cal.year === null) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1);
    S.cal.year = d.getFullYear(); S.cal.month = d.getMonth();
  }
}
async function calCargar() {
  calInit();
  const a = new Date(S.cal.year, S.cal.month, 1), b = new Date(S.cal.year, S.cal.month + 1, 0);
  S.cal.dias = await rpc('ec_calendario', { p_token: S.token, p_desde: iso(a), p_hasta: iso(b) });
}
function vCalendario() {
  calInit();
  const c = S.cal, m = S.me;
  const disp = m.saldo - m.comprometido;
  const costo = c.tipo === 'dia' ? cfgN('costo_dia', 8) : cfgN('costo_medio', 4);
  const first = new Date(c.year, c.month, 1);
  const offset = (first.getDay() + 6) % 7;
  const nombreMes = fMes(iso(first));
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push('<div aria-hidden="true"></div>');
  (c.dias || []).forEach((d) => {
    const n = pDate(d.fecha).getDate();
    const sel = c.sel === d.fecha && d.estado === 'ok';
    cells.push(`<button type="button" class="day ${sel ? 'sel' : d.estado}" data-act="dia" data-f="${d.fecha}" aria-label="${esc(fDateLong(d.fecha))}${d.estado === 'ok' ? ', disponible' : ', no disponible'}" ${sel ? 'aria-pressed="true"' : ''}>${n}</button>`);
  });
  return `${header()}<main class="narrow" style="margin:0 auto;width:100%">
    <div class="row between"><h1>Pedir tiempo libre</h1><span class="pill ok" style="font-size:14px">${disp} disponibles</span></div>
    <div class="seg" role="group" aria-label="Tipo">
      <button class="${c.tipo === 'dia' ? 'on' : ''}" data-act="tipo" data-t="dia" aria-pressed="${c.tipo === 'dia'}">Día completo · ${cfgN('costo_dia', 8)}</button>
      <button class="${c.tipo === 'medio' ? 'on' : ''}" data-act="tipo" data-t="medio" aria-pressed="${c.tipo === 'medio'}">Medio día · ${cfgN('costo_medio', 4)}</button>
    </div>
    <section class="card stack">
      <div class="cal-head">
        <button class="icon-btn" data-act="mes" data-d="-1" aria-label="Mes anterior"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
        <h2>${nombreMes}</h2>
        <button class="icon-btn" data-act="mes" data-d="1" aria-label="Mes siguiente"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
      </div>
      <div class="dow" aria-hidden="true"><div>L</div><div>M</div><div>M</div><div>J</div><div>V</div><div>S</div><div>D</div></div>
      <div class="days">${cells.join('')}</div>
      <div class="legend">
        <span><i style="background:#fff;border:1px solid #7FBF99"></i>Disponible</span>
        <span><i style="background:var(--red-l)"></i>Festivo</span>
        <span><i style="background:var(--orange-l)"></i>Semana festiva o día siguiente</span>
        <span><i style="background:var(--violet-l)"></i>Bloqueo, diciembre o cupo lleno</span>
        <span><i style="background:var(--gray-l)"></i>No elegible</span>
      </div>
    </section>
    ${c.msg ? `<div class="note" role="status">${esc(c.msg)}</div>` : ''}
    ${c.sel ? `<section class="card stack">
      <div class="row between"><div><b>${esc(fDateLong(c.sel))}</b><div class="small">${c.tipo === 'dia' ? 'Día completo' : 'Medio día'}${disp >= costo ? ` · te quedarían ${disp - costo} e-coins` : ''}</div></div><div class="neg" style="font-size:24px">−${costo}</div></div>
      ${disp < costo ? `<div class="err">No te alcanzan los e-coins para ${c.tipo === 'dia' ? 'un día completo' : 'medio día'}.</div>` : ''}
      <button class="btn block" data-act="postular" ${disp < costo ? 'disabled' : ''}>Postular este día</button>
    </section>` : '<p class="help" style="text-align:center">Toca un día disponible. Si tocas uno bloqueado te decimos por qué.</p>'}
  </main>`;
}

/* ---------- líder ---------- */
function vLider() {
  const l = S.lider || [];
  return `${header()}<main class="narrow" style="margin:0 auto;width:100%"><div><h1>Mi proceso</h1><p class="sub">Da tu visto bueno operativo. La aprobación final es de gerencia o subgerencia.</p></div>
    <section class="card">${l.length ? `<div class="list">${l.map((s) => `
      <div><div><b>${esc(s.nombre)}</b><div class="small">${solTxt(s)} · ${fDate(s.fecha)} · −${s.costo}</div></div>
      ${s.visto_bueno_lider ? '<span class="pill ok">Visto bueno dado</span>' : `<button class="btn sm" data-act="vb" data-id="${s.id}">Dar visto bueno</button>`}</div>`).join('')}</div>`
      : '<div class="empty">No hay solicitudes pendientes en tu proceso.</div>'}</section></main>`;
}

/* ---------- admin ---------- */
function procesos() { return [...new Set(((S.admin && S.admin.personas) || []).map((p) => p.proceso))].sort((a, b) => a.localeCompare(b)); }

function vAdminSaldos() {
  const A = S.admin, k = A.kpis, g = S.asg;
  const conceptos = A.conceptos.filter((c) => c.activo);
  if (!g.mes) { const d = new Date(); g.mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
  const activos = A.personas.filter((p) => p.activo && ganaEcoins(p));
  if (!g.persona && activos.length) g.persona = activos[0].id;
  const per = A.personas.find((p) => p.id === g.persona);
  const con = conceptos.find((c) => c.id === g.concepto) || conceptos[0];
  const extra = (g.concepto === 'emp' ? 'post' : g.concepto === 'lidg' ? 'lidc' : null);
  const extraC = extra ? conceptos.find((c) => c.id === extra) : null;
  const f = g.filtro.toLowerCase();
  const lista = A.personas.filter((p) => ganaEcoins(p) && (!f || p.nombre.toLowerCase().includes(f) || p.documento.includes(f)) && (!g.proceso || p.proceso === g.proceso));
  return `${header()}<main>
    <div class="row between"><div><h1>Saldos del equipo</h1><p class="sub">1 e-coin = 1 hora libre o ${money(cfgN('valor_ecoin', 10000))} · Día completo = ${cfgN('costo_dia', 8)} e-coins</p></div>
      <button class="btn out sm" data-act="csv">Descargar CSV</button></div>
    <div class="grid g4">
      <div class="card kpi"><div class="lab">E-coins en circulación</div><div class="val">${fmtNum(k.circulacion)}</div><div class="hint">≈ ${money(k.circulacion * cfgN('valor_ecoin', 10000))}</div></div>
      <div class="card kpi"><div class="lab">Solicitudes por aprobar</div><div class="val">${k.pendientes}</div><a class="hint" href="#/admin/solicitudes">Revisar</a></div>
      <div class="card kpi"><div class="lab">Días libres tomados ${new Date().getFullYear()}</div><div class="val">${String(k.dias_anio).replace('.', ',')}</div></div>
      <div class="card kpi"><div class="lab">Emitidos ${new Date().getFullYear()}</div><div class="val">${fmtNum(k.emitidos_anio)}</div></div>
    </div>
    <div class="split">
      <section class="card p0 main" aria-label="Saldos por persona">
        <div class="row" style="padding:14px 16px;border-bottom:1px solid var(--line2)">
          <label class="sr" for="q">Buscar</label><input id="q" class="in" style="flex:1;min-width:160px" placeholder="Buscar nombre o cédula" value="${esc(g.filtro)}" data-inp="filtro">
          <label class="sr" for="qp">Proceso</label><select id="qp" class="in" style="width:auto" data-inp="proceso"><option value="">Todos los procesos</option>${procesos().map((p) => `<option ${g.proceso === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
        </div>
        <div class="tbl-wrap"><table style="min-width:680px"><thead><tr><th>Persona</th><th>Proceso</th><th class="n">Saldo</th><th class="n">Reservado</th><th class="n">Días ${new Date().getFullYear()}</th><th class="n">Ganados año</th><th>Último movimiento</th></tr></thead><tbody>
        ${lista.map((p) => `<tr class="click ${p.id === g.persona ? 'sel' : ''}" data-act="pick" data-id="${p.id}" tabindex="0">
          <td><b>${esc(p.nombre)}</b>${p.activo ? '' : ' <span class="pill can">Inactivo</span>'}<div class="small">${esc(rolTxt(p.rol))}</div></td><td>${esc(p.proceso)}</td>
          <td class="n num" style="font-weight:700;font-size:17px">${p.saldo}</td><td class="n">${p.comprometido || ''}</td><td class="n">${String(p.dias).replace('.', ',')}</td><td class="n">${p.ganados_anio}</td>
          <td class="small">${p.ultimo ? `${p.ultimo.cantidad > 0 ? '+' : ''}${p.ultimo.cantidad} ${esc(p.ultimo.texto)} · ${fTs(p.ultimo.fecha)}` : '—'}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Sin resultados. Agrega personas en la pestaña Personas.</td></tr>'}
        </tbody></table></div>
      </section>
      <div class="side stack">
        <form class="card stack" id="f-asg">
          <div><h2>Asignar e-coins</h2><p class="sub" style="font-size:14px">El monto lo fija el concepto. No hay e-coins regalados.</p></div>
          <label class="f">Persona<input class="in" type="search" placeholder="Buscar por nombre o cédula…" data-filtro-select="#sel-persona" aria-label="Buscar persona"><select class="in" id="sel-persona" name="persona" data-inp="persona">${activos.map((p) => `<option value="${p.id}" ${p.id === g.persona ? 'selected' : ''} data-q="${esc((p.nombre + ' ' + p.documento).toLowerCase())}">${esc(p.nombre)} · ${esc(p.proceso)}</option>`).join('')}</select>
            <span class="help">Saldo actual: <b>${per ? per.saldo : 0} e-coins</b></span></label>
          <fieldset style="border:0;margin:0;padding:0" class="chips"><legend style="font-weight:600;font-size:14px;margin-bottom:8px">Concepto</legend>
            ${conceptos.map((c) => `<button type="button" class="chip ${c.id === g.concepto ? 'on' : ''}" data-act="concepto" data-id="${c.id}" aria-pressed="${c.id === g.concepto}"><span>${esc(c.nombre)}</span><b>+${c.cantidad}</b></button>`).join('')}
          </fieldset>
          <label class="f">Mes del logro<input class="in" type="month" name="mes" value="${g.mes}" max="${new Date().toISOString().slice(0, 7)}" data-inp="mes"></label>
          <label class="f">Sustento (obligatorio)<textarea class="in" name="sustento" rows="3" placeholder="Hecho verificable: indicador, entrega, error evitado…" required minlength="5"></textarea></label>
          ${per && con ? `<div class="preview"><div style="font-size:14px">Se cargan a <b>${esc(per.nombre)}</b>${extraC ? `<br><span class="small">Incluye ${esc(extraC.nombre.toLowerCase())} (+${extraC.cantidad}) si no estaba</span>` : ''}</div><div class="num">+${con.cantidad}</div></div>` : ''}
          <button class="btn block" type="submit" ${per ? '' : 'disabled'}>Registrar e-coins</button>
        </form>
        <form class="card stack" id="f-ajuste">
          <div><h3>Corrección manual</h3><p class="help" style="margin:4px 0 0">Solo para corregir errores. Queda registrada con tu nombre.</p></div>
          <div class="row"><label class="f" style="flex:1">Cantidad (+ o −)<input class="in" type="number" name="cant" step="1" required></label></div>
          <label class="f">Motivo<input class="in" name="motivo" required minlength="5"></label>
          <button class="btn out block" type="submit" ${per ? '' : 'disabled'}>Aplicar corrección a ${per ? esc(per.nombre.split(' ')[0]) : '—'}</button>
        </form>
      </div>
    </div>
  </main>`;
}

function vAdminSolicitudes() {
  const A = S.admin;
  const tarjeta = (s) => {
    const despues = s.saldo - s.costo;
    return `<article class="card stack">
      <div class="row between"><div><b style="font-size:17px">${esc(s.nombre)}</b><div class="small">${esc(s.proceso)} · pedida ${fTs(s.created_at)}</div></div><span class="pill pend">Pendiente</span></div>
      <div class="grid g3">
        <div style="background:var(--bg);border-radius:10px;padding:10px"><div class="small">${s.tipo === 'dinero' ? 'Canje' : 'Fecha'}</div><b>${s.tipo === 'dinero' ? money(s.costo * cfgN('valor_ecoin', 10000)) : esc(fDate(s.fecha, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}</b></div>
        <div style="background:var(--bg);border-radius:10px;padding:10px"><div class="small">Tipo</div><b>${solTxt(s)} · −${s.costo}</b></div>
        <div style="background:var(--bg);border-radius:10px;padding:10px"><div class="small">Saldo</div><b>${s.saldo} → ${despues}</b></div>
      </div>
      <div class="small">${s.tipo === 'dinero' ? 'Canje en dinero: se paga en la nómina siguiente.' : (s.visto_bueno_lider ? '✓ Reglas de calendario validadas · ✓ Visto bueno del líder' : '✓ Reglas de calendario validadas · Líder aún no da visto bueno')}</div>
      ${despues < 0 ? '<div class="err">El saldo ya no alcanza: no se puede aprobar.</div>' : ''}
      <div class="row"><button class="btn sm" data-act="aprobar" data-id="${s.id}" ${despues < 0 ? 'disabled' : ''}>Aprobar</button><button class="btn danger sm" data-act="rechazar" data-id="${s.id}">Rechazar con motivo</button></div>
    </article>`;
  };
  return `${header()}<main><div><h1>Aprobar solicitudes</h1><p class="sub">El sistema ya validó festivos, diciembre, bloqueos, cupo y saldo. Tú decides con el contexto del trabajo.</p></div>
    <div class="split"><div class="main stack">${A.pendientes.length ? A.pendientes.map(tarjeta).join('') : '<div class="card empty">No hay solicitudes pendientes.</div>'}</div>
    <aside class="side card"><h2 style="margin-bottom:6px">Resueltas recientemente</h2>${A.recientes.length ? `<div class="list">${A.recientes.map((r) => `
      <div><div><b style="font-size:14px">${esc(r.nombre)}</b><div class="small">${solTxt(r)}${r.fecha ? ' · ' + fDate(r.fecha) : ''}</div></div>${estadoPill(r.estado)}</div>`).join('')}</div>` : '<div class="empty">Nada todavía.</div>'}</aside></div></main>`;
}

function vAdminRegistrar() {
  const A = S.admin;
  const act = A.personas.filter((p) => p.activo && ganaEcoins(p));
  const lideres = act.filter((p) => p.es_lider);
  const d = new Date(); const mesDef = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const opt = (arr) => arr.map((p) => `<option value="${esc(p.documento)}">${esc(p.nombre)} · ${esc(p.proceso)}</option>`).join('');
  return `${header()}<main><div><h1>Registrar resultados del mes</h1><p class="sub">Úsalo cada mes después del comité, y también para la carga retroactiva de 2026 (mes por mes).</p></div>
    <div class="split">
      <form class="card stack main" id="f-mes">
        <label class="f" style="max-width:260px">Mes<input class="in" type="month" name="mes" value="${mesDef}" max="${mesDef}" required></label>
        <div class="grid g2">
          <label class="f">Empleado del Mes<select class="in" name="emp"><option value="">— Ninguno —</option>${opt(act)}</select></label>
          <label class="f">Líder del Mes<select class="in" name="lidg"><option value="">— Ninguno —</option>${opt(lideres)}</select></label>
        </div>
        <fieldset style="border:0;margin:0;padding:0" class="stack"><legend style="font-weight:600;font-size:14px;margin-bottom:8px">Postulados · +${(A.conceptos.find((c) => c.id === 'post') || {}).cantidad || 2}</legend>
          <p class="help" style="margin:0">Si la persona ya fue Empleado del Mes este año, se registra sola como <b>postulación de honor</b> (+2, sin límite de veces).</p>
          <input class="in" type="search" placeholder="Buscar nombre o proceso…" data-filtro="#grid-post .check" aria-label="Buscar postulado"><div class="grid g2" id="grid-post">${act.map((p) => `<label class="check" data-q="${esc((p.nombre + ' ' + p.proceso + ' ' + p.documento).toLowerCase())}"><input type="checkbox" name="post" value="${esc(p.documento)}"><span>${esc(p.nombre)}<span class="small" style="display:block">${esc(p.proceso)}</span></span></label>`).join('')}</div>
        </fieldset>
        <fieldset style="border:0;margin:0;padding:0" class="stack"><legend style="font-weight:600;font-size:14px;margin-bottom:8px">Líderes que cumplieron los criterios · +${(A.conceptos.find((c) => c.id === 'lidc') || {}).cantidad || 2}</legend>
          ${lideres.length ? `<div class="grid g2">${lideres.map((p) => `<label class="check"><input type="checkbox" name="lidc" value="${esc(p.documento)}"><span>${esc(p.nombre)}<span class="small" style="display:block">${esc(p.proceso)}</span></span></label>`).join('')}</div>` : '<p class="help">No hay personas con rol Líder. Asígnalo en Personas.</p>'}
        </fieldset>
        <label class="f">Sustento general del mes<textarea class="in" name="sustento" rows="2" placeholder="Ej.: Acta del comité de reconocimiento de octubre 2026"></textarea><span class="help">Si lo dejas vacío en meses pasados se usa “Carga retroactiva”.</span></label>
        <div class="err" id="mes-err" role="alert"></div>
        <button class="btn" type="submit">Registrar mes</button>
        <div id="mes-res"></div>
      </form>
      <div class="side stack">
        <section class="card stack"><h3>Rachas</h3><p class="help" style="margin:0">Suma +2 a quien lleve 3 meses seguidos postulado o cumpliendo como líder. Ejecútalo después de registrar los meses.</p><button class="btn out-g" data-act="rachas">Calcular rachas</button></section>
        <form class="card stack" id="f-csv"><h3>Carga masiva (opcional)</h3>
          <p class="help" style="margin:0">Una línea por logro: <code>cedula;concepto;AAAA-MM;sustento</code>. Conceptos: ${A.conceptos.map((c) => `<code>${c.id}</code>`).join(', ')}.</p>
          <textarea class="in" name="csv" rows="6" placeholder="1012345678;post;2026-03;Acta comité marzo"></textarea>
          <button class="btn out" type="submit">Cargar líneas</button><div id="csv-res"></div></form>
      </div>
    </div></main>`;
}

function vAdminCalendario() {
  const A = S.admin, c = A.config;
  const tog = (k, t, d) => `<label class="check"><input type="checkbox" data-cfgb="${k}" ${c[k] !== false ? 'checked' : ''}><span><b>${t}</b><span class="small" style="display:block">${d}</span></span></label>`;
  const num = (k, t) => `<label class="f">${t}<input class="in" type="number" min="0" step="1" data-cfgn="${k}" value="${esc(c[k])}"></label>`;
  return `${header()}<main><div><h1>Días y reglas</h1><p class="sub">Lo que cambies aquí se refleja de inmediato en el calendario de todos.</p></div>
    <div class="grid g3" style="align-items:start">
      <section class="card stack"><h2>Reglas automáticas</h2>
        <label class="check"><input type="checkbox" checked disabled><span><b>Festivos nacionales y fines de semana</b><span class="small" style="display:block">Siempre activos.</span></span></label>
        ${tog('bloquear_semana_festiva', 'Semana completa con festivo', 'Si la semana tiene festivo, no se elige ningún día de esa semana.')}
        ${tog('bloquear_post_festivo', 'Día hábil siguiente a un festivo', 'Ej.: el lunes después de Semana Santa.')}
        ${tog('bloquear_diciembre', 'Diciembre completo', 'Cierre colectivo que se repone durante el año.')}
        <div class="grid g2">${num('cupo_por_proceso', 'Personas libres por proceso el mismo día')}${num('anticipacion_habiles', 'Días hábiles de anticipación')}${num('costo_dia', 'E-coins por día completo')}${num('costo_medio', 'E-coins por medio día')}${num('tope_mensual', 'Tope de e-coins por persona al mes')}${num('min_canje_dinero', 'Mínimo para canje en dinero')}${num('valor_ecoin', 'Valor del e-coin en pesos')}</div>
        <button class="btn" data-act="guardar-cfg">Guardar reglas</button>
      </section>
      <section class="card stack"><h2>Bloqueos de la empresa</h2>
        ${A.bloqueos.length ? A.bloqueos.map((b) => `<div class="row between" style="background:var(--bg);border-radius:10px;padding:10px 12px"><div><b>${fDate(b.desde)}${b.hasta !== b.desde ? ' – ' + fDate(b.hasta) : ''}</b><div class="small">${esc(b.motivo)} · ${b.proceso ? esc(b.proceso) : 'Toda la empresa'}</div></div><button class="btn danger sm" data-act="del-bloqueo" data-id="${b.id}" aria-label="Quitar bloqueo">Quitar</button></div>`).join('') : '<p class="help">No hay bloqueos manuales.</p>'}
        <form class="stack" id="f-bloqueo" style="border-top:1px solid var(--line2);padding-top:12px"><b>Agregar bloqueo</b>
          <div class="grid g2"><label class="f">Desde<input class="in" type="date" name="desde" required></label><label class="f">Hasta<input class="in" type="date" name="hasta" required></label></div>
          <label class="f">Motivo (lo ve el empleado)<input class="in" name="motivo" required placeholder="Ej.: auditoría ISO 9001"></label>
          <label class="f">Aplica a<select class="in" name="proceso"><option value="">Toda la empresa</option>${procesos().map((p) => `<option>${esc(p)}</option>`).join('')}</select></label>
          <button class="btn" type="submit">Guardar bloqueo</button></form>
      </section>
      <section class="card stack"><h2>Festivos</h2><p class="help" style="margin:0">Calendario oficial de Colombia. Si una ley cambia un festivo, ajústalo aquí.</p>
        <div class="list" style="max-height:420px;overflow:auto">${A.festivos.map((f) => `<div><div><b style="font-size:14px">${esc(fDate(f.fecha, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}</b><div class="small">${esc(f.nombre)}</div></div><button class="btn danger sm" data-act="del-festivo" data-f="${f.fecha}" aria-label="Quitar festivo">Quitar</button></div>`).join('')}</div>
        <form class="stack" id="f-festivo" style="border-top:1px solid var(--line2);padding-top:12px"><div class="grid g2"><label class="f">Fecha<input class="in" type="date" name="fecha" required></label><label class="f">Nombre<input class="in" name="nombre" required></label></div><button class="btn out" type="submit">Agregar festivo</button></form>
      </section>
    </div></main>`;
}

function vAdminPersonas() {
  const A = S.admin;
  return `${header()}<main><div class="row between"><div><h1>Personas</h1><p class="sub">${A.personas.filter((p) => p.activo).length} activas · empleados y líderes entran con la cédula; administradores con cédula y PIN.</p></div>
    <div class="row"><button class="btn out sm" data-act="import-personas">Cargar lista</button><button class="btn sm" data-act="persona-nueva">Agregar persona</button></div></div>
    <input class="in" type="search" placeholder="Buscar por nombre, cédula o proceso…" data-filtro="#tbl-personas tbody tr" aria-label="Buscar persona" style="max-width:420px">
    <section class="card p0"><div class="tbl-wrap"><table id="tbl-personas" style="min-width:640px"><thead><tr><th>Nombre</th><th>Cédula</th><th>Proceso</th><th>Rol</th><th>Estado</th><th></th></tr></thead><tbody>
      ${A.personas.map((p) => `<tr data-q="${esc((p.nombre + ' ' + p.documento + ' ' + p.proceso).toLowerCase())}"><td><b>${esc(p.nombre)}</b></td><td>${esc(p.documento)}</td><td>${esc(p.proceso)}</td><td>${esc(rolTxt(p.rol))}${p.rol === 'admin' && p.es_lider ? ' · Líder' : ''}</td>
        <td>${p.activo ? (p.rol === 'admin' && p.debe_cambiar_pin ? '<span class="pill pend">PIN temporal</span>' : '<span class="pill ok">Activo</span>') : '<span class="pill can">Inactivo</span>'}</td>
        <td class="n" style="white-space:nowrap"><button class="btn out sm" data-act="persona-editar" data-id="${p.id}">Editar</button>${p.rol === 'admin' ? ` <button class="btn out sm" data-act="persona-pin" data-id="${p.id}">Nuevo PIN</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div></section></main>`;
}


function vAdminTardanzas() {
  const T = S.tard, A = S.admin;
  if (!T) return `${header()}<main><div class="empty"><span class="spin"></span></div></main>`;
  const act = A.personas.filter((p) => p.activo && ganaEcoins(p));
  const hoy = iso(new Date());
  const estado = (t) => t.justificada ? '<span class="pill can">Justificada</span>' : t.descontada ? `<span class="pill no">−${T.descuento} descontado</span>` : '<span class="pill pend">Sin descuento</span>';
  return `${header()}<main><div><h1>Llegadas tarde</h1><p class="sub">Cada llegada tarde resta ${T.descuento} e-coin, sin importar cuánto tiempo. Solo descuenta las que estén desde la fecha de inicio y con la regla encendida.</p></div>
    <div class="grid g3" style="align-items:start">
      <form class="card stack" id="f-tard-cfg"><h2>Regla</h2>
        <label class="check"><input type="checkbox" name="activo" ${T.activo ? 'checked' : ''}><span><b>Descontar e-coins por llegadas tarde</b><span class="small" style="display:block">Al encenderla se descuentan también las ya registradas desde la fecha de inicio.</span></span></label>
        <label class="f">Empieza a descontar desde<input class="in" type="date" name="desde" value="${esc(T.desde || '')}" max="${hoy}" required></label>
        <div class="note">${T.activo && T.desde ? `Encendida desde el <b>${fDate(T.desde)}</b>.` : 'Apagada: las llegadas tarde se registran pero no descuentan.'}</div>
        <button class="btn" type="submit">Guardar regla</button>
      </form>
      <form class="card stack" id="f-tard"><h2>Registrar una</h2>
        <label class="f">Persona<input class="in" type="search" placeholder="Buscar por nombre o cédula…" data-filtro-select="#sel-tard" aria-label="Buscar persona"><select class="in" id="sel-tard" name="persona">${act.map((p) => `<option value="${p.id}" data-q="${esc((p.nombre + ' ' + p.documento).toLowerCase())}">${esc(p.nombre)} · ${esc(p.proceso)}</option>`).join('')}</select></label>
        <label class="f">Fecha<input class="in" type="date" name="fecha" value="${hoy}" max="${hoy}" required></label>
        <label class="f">Nota (opcional)<input class="in" name="nota" placeholder="Ej.: llegó 7:25"></label>
        <button class="btn" type="submit">Registrar llegada tarde</button>
      </form>
      <form class="card stack" id="f-tard-lista"><h2>Pegar varias</h2>
        <p class="help" style="margin:0">Una por línea, desde Excel o el reporte de asistencia: <code>cédula;AAAA-MM-DD;nota</code></p>
        <textarea class="in" name="lista" rows="7" placeholder="1003232466;2026-11-12;7:20" required></textarea>
        <button class="btn out" type="submit">Cargar lista</button><div id="tard-res"></div>
      </form>
    </div>
    <input class="in" type="search" placeholder="Buscar en el registro…" data-filtro="#tbl-tard tbody tr" aria-label="Buscar en el registro" style="max-width:420px">
    <section class="card p0"><div class="tbl-wrap"><table id="tbl-tard" style="min-width:720px"><thead><tr><th>Fecha</th><th>Persona</th><th>Nota</th><th>Estado</th><th></th></tr></thead><tbody>
      ${T.lista.map((t) => `<tr data-q="${esc((t.nombre + ' ' + t.documento + ' ' + t.proceso + ' ' + t.fecha).toLowerCase())}"><td>${fDate(t.fecha, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</td><td><b>${esc(t.nombre)}</b><div class="small">${esc(t.proceso)}</div></td><td class="small">${esc(t.nota || '')}</td><td>${estado(t)}</td>
        <td class="n" style="white-space:nowrap"><button class="btn out sm" data-act="tard-just" data-id="${t.id}" data-v="${t.justificada ? '0' : '1'}">${t.justificada ? 'Quitar justificación' : 'Justificar'}</button> <button class="btn danger sm" data-act="tard-borrar" data-id="${t.id}">Anular</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No hay llegadas tarde registradas.</td></tr>'}
    </tbody></table></div></section></main>`;
}
async function cargarTard() { S.tard = await rpc('ec_admin_tardanzas', { p_token: S.token }); }

function vAdminHistorial() {
  const h = S.historial;
  return `${header()}<main><div><h1>Historial de movimientos</h1><p class="sub">Últimos 300 movimientos con quién los registró. Sirve de soporte para auditoría.</p></div>
    <section class="card p0"><div class="tbl-wrap">${h === null ? '<div class="empty"><span class="spin"></span></div>' : `<table style="min-width:760px"><thead><tr><th>Fecha</th><th>Persona</th><th>Movimiento</th><th>Mes logro</th><th class="n">E-coins</th><th>Sustento</th><th>Registró</th></tr></thead><tbody>
      ${h.map((m) => `<tr><td class="small">${fTs(m.created_at)}</td><td><b>${esc(m.nombre)}</b><div class="small">${esc(m.proceso)}</div></td><td>${esc(m.concepto_nombre || m.tipo.replace('_', ' '))}</td><td>${m.mes_logro ? fMes(m.mes_logro) : ''}</td>
        <td class="n ${m.cantidad > 0 ? 'pos' : 'neg'}">${m.cantidad > 0 ? '+' : '−'}${Math.abs(m.cantidad)}</td><td class="small">${esc(m.sustento || '')}</td><td class="small">${esc(m.creado_por || '')}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Sin movimientos.</td></tr>'}
    </tbody></table>`}</div></section></main>`;
}

/* ---------- render ---------- */
async function render() {
  const app = $('#app');
  if (!S.token) { app.innerHTML = vLogin(); return; }
  if (!S.me) {
    app.innerHTML = '<div class="login"><span class="spin" style="color:var(--green);width:32px;height:32px"></span></div>';
    try { await cargarYo(); await Promise.all([cargarAdmin(), cargarLider()]); }
    catch (e) { if (S.token) { app.innerHTML = `<div class="login"><div class="card stack"><b>${esc(e.message)}</b><button class="btn" onclick="location.reload()">Reintentar</button></div></div>`; } return; }
  }
  if (S.me.persona.debe_cambiar_pin) { app.innerHTML = vCambiarPin(true); return; }
  const r = route();
  if (r.startsWith('admin') && !isAdmin()) { location.hash = '#/inicio'; return; }
  if (soloAdmin() && ['inicio', 'calendario', 'solicitudes', 'lider'].includes(r)) { location.hash = '#/admin/saldos'; return; }
  let html;
  switch (r) {
    case 'calendario': if (!S.cal.dias.length) { try { await calCargar(); } catch (e) { toast(e.message, true); } } html = vCalendario(); break;
    case 'solicitudes': html = vSolicitudes(); break;
    case 'avisos': html = vAvisos(); if ((S.me.notificaciones || []).some((n) => !n.leida)) { rpc('ec_marcar_leidas', { p_token: S.token }).then(() => { S.me.notificaciones.forEach((n) => { n.leida = true; }); }).catch(() => {}); } break;
    case 'lider': html = vLider(); break;
    case 'pin': html = vCambiarPin(false); break;
    case 'admin/saldos': html = vAdminSaldos(); break;
    case 'admin/solicitudes': html = vAdminSolicitudes(); break;
    case 'admin/registrar': html = vAdminRegistrar(); break;
    case 'admin/calendario': html = vAdminCalendario(); break;
    case 'admin/personas': html = vAdminPersonas(); break;
    case 'admin/tardanzas':
      if (!S.tard) { try { await cargarTard(); } catch (e) { toast(e.message, true); } }
      html = vAdminTardanzas(); break;
    case 'admin/historial':
      html = vAdminHistorial();
      if (S.historial === null) { rpc('ec_admin_historial', { p_token: S.token }).then((h) => { S.historial = h || []; if (route() === 'admin/historial') render(); }).catch((e) => toast(e.message, true)); }
      break;
    default: html = vInicio();
  }
  app.innerHTML = html;
}
async function refrescar() {
  await cargarYo();
  await Promise.all([cargarAdmin(), cargarLider()]);
  S.historial = null;
}

/* ---------- eventos ---------- */
document.addEventListener('submit', async (ev) => {
  const f = ev.target; ev.preventDefault();
  const btn = f.querySelector('button[type=submit]');
  const fd = new FormData(f);
  if (f.id === 'f-login') {
    const err = $('#login-err'); err.textContent = '';
    await busy(btn, async () => {
      const doc = String(fd.get('doc') || '').replace(/[^0-9A-Za-z]/g, '');
      const r = S.loginPin
        ? await rpc('ec_login', { p_documento: doc, p_pin: fd.get('pin') })
        : await rpc('ec_ingresar', { p_documento: doc });
      if (r.error) { err.textContent = traducir(r.error); return; }
      if (r.requiere_pin) { S.loginPin = { doc, nombre: r.nombre }; render(); return; }
      S.loginPin = null;
      S.token = r.token; localStorage.setItem(TK, r.token); S.me = null;
      location.hash = r.rol === 'admin' ? '#/admin/saldos' : '#/inicio';
      await render();
    });
  } else if (f.id === 'f-pin') {
    const err = $('#pin-err'); err.textContent = '';
    if (fd.get('n') !== fd.get('c')) { err.textContent = 'Los PIN nuevos no coinciden.'; return; }
    if (!/^[0-9]{4,6}$/.test(fd.get('n'))) { err.textContent = ERR.PIN_FORMATO; return; }
    await busy(btn, async () => {
      try { await rpc('ec_cambiar_pin', { p_token: S.token, p_actual: fd.get('a'), p_nuevo: fd.get('n') }); }
      catch (e) { err.textContent = e.message; return; }
      S.me.persona.debe_cambiar_pin = false; toast('PIN actualizado');
      location.hash = isAdmin() ? '#/admin/saldos' : '#/inicio'; render();
    });
  } else if (f.id === 'f-asg') {
    const g = S.asg;
    await busy(btn, async () => {
      const r = await rpc('ec_admin_asignar', { p_token: S.token, p_persona: g.persona, p_concepto: g.concepto, p_mes: `${g.mes}-01`, p_sustento: fd.get('sustento') });
      toast(`+${r.agregados} e-coins registrados. Nuevo saldo: ${r.saldo}`);
      await refrescar(); render();
    });
  } else if (f.id === 'f-ajuste') {
    const n = parseInt(fd.get('cant'), 10);
    await busy(btn, async () => {
      const r = await rpc('ec_admin_ajuste', { p_token: S.token, p_persona: S.asg.persona, p_cantidad: n, p_motivo: fd.get('motivo') });
      toast(`Corrección aplicada. Nuevo saldo: ${r.saldo}`); await refrescar(); render();
    });
  } else if (f.id === 'f-mes') {
    const mes = fd.get('mes'), sus = (fd.get('sustento') || '').trim();
    const filas = [];
    fd.getAll('post').forEach((d) => filas.push({ documento: d, concepto: 'post', mes: `${mes}-01`, sustento: sus }));
    fd.getAll('lidc').forEach((d) => filas.push({ documento: d, concepto: 'lidc', mes: `${mes}-01`, sustento: sus }));
    if (fd.get('emp')) filas.push({ documento: fd.get('emp'), concepto: 'emp', mes: `${mes}-01`, sustento: sus });
    if (fd.get('lidg')) filas.push({ documento: fd.get('lidg'), concepto: 'lidg', mes: `${mes}-01`, sustento: sus });
    const err = $('#mes-err'); err.textContent = '';
    if (!filas.length) { err.textContent = 'Marca al menos un postulado, ganador o líder.'; return; }
    const curr = new Date(); const esActual = mes === `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}`;
    if (esActual && sus.length < 5) { err.textContent = 'Para el mes actual escribe el sustento (ej.: acta del comité).'; return; }
    await busy(btn, async () => {
      const r = await rpc('ec_admin_importar_logros', { p_token: S.token, p_filas: filas });
      $('#mes-res').innerHTML = resultadoCarga(r);
      toast(`${fMes(mes + '-01')}: ${r.ecoins} e-coins cargados`);
      await refrescar();
      if (!r.errores.length) { f.reset(); f.querySelector('[name=mes]').value = mes; }
    });
  } else if (f.id === 'f-csv') {
    const filas = String(fd.get('csv') || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const [documento, concepto, mes, ...rest] = l.split(/[;\t,]/);
      return { documento: (documento || '').trim(), concepto: (concepto || '').trim(), mes: ((mes || '').trim().slice(0, 7)) + '-01', sustento: rest.join(' ').trim() };
    });
    if (!filas.length) return;
    await busy(btn, async () => {
      const r = await rpc('ec_admin_importar_logros', { p_token: S.token, p_filas: filas });
      $('#csv-res').innerHTML = resultadoCarga(r); await refrescar();
    });
  } else if (f.id === 'f-bloqueo') {
    await busy(btn, async () => {
      await rpc('ec_admin_bloqueo_guardar', { p_token: S.token, p_desde: fd.get('desde'), p_hasta: fd.get('hasta'), p_motivo: fd.get('motivo'), p_proceso: fd.get('proceso') });
      toast('Bloqueo guardado'); S.cal.dias = []; await refrescar(); render();
    });
  } else if (f.id === 'f-festivo') {
    await busy(btn, async () => {
      await rpc('ec_admin_festivo_guardar', { p_token: S.token, p_fecha: fd.get('fecha'), p_nombre: fd.get('nombre') });
      toast('Festivo guardado'); S.cal.dias = []; await refrescar(); render();
    });
  } else if (f.id === 'f-persona') {
    const id = f.dataset.id || null;
    await busy(btn, async () => {
      await rpc('ec_admin_persona_guardar', { p_token: S.token, p_id: id, p_nombre: fd.get('nombre'), p_documento: fd.get('documento'), p_proceso: fd.get('proceso'), p_rol: fd.get('rol'), p_activo: fd.get('activo') === 'on', p_pin: fd.get('pin') || null, p_es_lider: fd.get('es_lider') === 'on' });
      closeModal(); toast(id ? 'Persona actualizada' : 'Persona creada'); await refrescar(); render();
    });
  } else if (f.id === 'f-resetpin') {
    await busy(btn, async () => {
      await rpc('ec_admin_reset_pin', { p_token: S.token, p_id: f.dataset.id, p_pin: fd.get('pin') });
      closeModal(); toast('PIN temporal asignado. Se le pedirá cambiarlo al entrar.'); await refrescar(); render();
    });
  } else if (f.id === 'f-import-personas') {
    const filas = String(fd.get('lista') || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const [nombre, documento, proceso, rol, pin] = l.split(/[;\t]/).map((x) => (x || '').trim());
      return { nombre, documento, proceso, rol, pin };
    });
    await busy(btn, async () => {
      const r = await rpc('ec_admin_importar_personas', { p_token: S.token, p_filas: filas });
      $('#imp-res').innerHTML = `<div class="okbox">${r.ok} personas creadas · ${r.actualizadas || 0} actualizadas.</div>${r.errores.length ? `<div class="err">Errores: ${r.errores.map((e) => `fila ${e.fila}: ${esc(traducir(e.error))}`).join(' · ')}</div>` : ''}`;
      await refrescar();
    });
  } else if (f.id === 'f-dinero') {
    const n = parseInt(fd.get('cant'), 10);
    await busy(btn, async () => {
      await rpc('ec_solicitar_dinero', { p_token: S.token, p_cantidad: n });
      closeModal(); toast('Solicitud de canje enviada'); await refrescar(); render();
    });
  } else if (f.id === 'f-tard-cfg') {
    await busy(btn, async () => {
      await rpc('ec_admin_config_guardar', { p_token: S.token, p_clave: 'tardanzas_desde', p_valor: fd.get('desde') });
      await rpc('ec_admin_config_guardar', { p_token: S.token, p_clave: 'tardanzas_activo', p_valor: fd.get('activo') === 'on' });
      toast('Regla guardada'); await cargarTard(); await refrescar(); render();
    });
  } else if (f.id === 'f-tard' || f.id === 'f-tard-lista') {
    const filas = f.id === 'f-tard'
      ? [{ persona_id: fd.get('persona'), fecha: fd.get('fecha'), nota: fd.get('nota') }]
      : String(fd.get('lista') || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const [documento, fecha, ...n] = l.split(/[;\t,]/); return { documento: (documento || '').trim(), fecha: (fecha || '').trim(), nota: n.join(' ').trim() }; });
    if (!filas.length) return;
    await busy(btn, async () => {
      const r = await rpc('ec_admin_tardanzas_registrar', { p_token: S.token, p_filas: filas });
      await cargarTard(); await refrescar(); render();
      toast(`${r.ok} registradas · ${r.descontadas} con descuento`);
      if (r.errores.length) { const box = $('#tard-res'); if (box) box.innerHTML = `<div class="err">${r.errores.map((e) => `${esc(e.documento || '')} ${esc(e.fecha || '')}: ${esc(traducir(e.error))}`).join('<br>')}</div>`; else toast(traducir(r.errores[0].error), true); }
    });
  } else if (f.id === 'f-rechazo') {
    await busy(btn, async () => {
      await rpc('ec_admin_resolver', { p_token: S.token, p_id: Number(f.dataset.id), p_aprobar: false, p_motivo: fd.get('motivo') });
      closeModal(); toast('Solicitud rechazada'); await refrescar(); render();
    });
  }
});

function resultadoCarga(r) {
  return `<div class="okbox">${r.ok} logros cargados · ${r.ecoins} e-coins.</div>${r.errores.length ? `<div class="card" style="margin-top:8px;padding:12px"><b class="err">${r.errores.length} no se cargaron:</b><div class="list">${r.errores.map((e) => `<div><span class="small">${esc(e.documento || '')} · ${esc(e.concepto || '')} · ${esc((e.mes || '').slice(0, 7))}</span><span class="small err">${esc(traducir(e.error))}</span></div>`).join('')}</div></div>` : ''}`;
}

document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.dataset.inp === 'filtro') { S.asg.filtro = el.value; const pos = el.selectionStart; render().then(() => { const q = $('#q'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }); }
});

const sinTildes = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
document.addEventListener('input', (ev) => {
  const el = ev.target;
  const q = sinTildes(el.value).trim();
  if (el.dataset.filtro) {
    document.querySelectorAll(el.dataset.filtro).forEach((n) => { n.style.display = !q || sinTildes(n.dataset.q || n.textContent).includes(q) ? '' : 'none'; });
  }
  if (el.dataset.filtroSelect) {
    const sel = document.querySelector(el.dataset.filtroSelect);
    if (!sel) return;
    if (!sel._todas) sel._todas = Array.from(sel.options).map((o) => o.cloneNode(true));
    const actual = sel.value;
    const visibles = sel._todas.filter((o) => !q || sinTildes(o.dataset.q || o.textContent).includes(q));
    sel.replaceChildren(...visibles.map((o) => o.cloneNode(true)));
    if (visibles.some((o) => o.value === actual)) sel.value = actual;
    else if (visibles.length) { sel.value = visibles[0].value; S.asg.persona = visibles[0].value; }
  }
});
document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.dataset.inp === 'proceso') { S.asg.proceso = el.value; render(); }
  if (el.dataset.inp === 'persona') { S.asg.persona = el.value; render(); }
  if (el.dataset.inp === 'mes') { S.asg.mes = el.value; }
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !$('#modal').hidden) closeModal();
  if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('tr[data-act=pick]')) { ev.preventDefault(); ev.target.click(); }
});
$('#modal').addEventListener('click', (ev) => { if (ev.target.id === 'modal') closeModal(); });

document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const a = el.dataset.act;
  if (a === 'salir') { salir(false); }
  else if (a === 'otra-cedula') { S.loginPin = null; render(); }
  else if (a === 'cerrar') { closeModal(); }
  else if (a === 'tipo') { S.cal.tipo = el.dataset.t; render(); }
  else if (a === 'mes') {
    const d = new Date(S.cal.year, S.cal.month + Number(el.dataset.d), 1);
    S.cal.year = d.getFullYear(); S.cal.month = d.getMonth(); S.cal.sel = null; S.cal.msg = '';
    await busy(null, calCargar); render();
  } else if (a === 'dia') {
    const d = S.cal.dias.find((x) => x.fecha === el.dataset.f);
    if (!d) return;
    if (d.estado === 'ok') { S.cal.sel = d.fecha; S.cal.msg = ''; }
    else { S.cal.sel = null; S.cal.msg = `${fDate(d.fecha, { day: 'numeric', month: 'long' })}: ${d.motivo || 'No disponible.'}`; }
    render();
  } else if (a === 'postular') {
    await busy(el, async () => {
      await rpc('ec_solicitar', { p_token: S.token, p_fecha: S.cal.sel, p_tipo: S.cal.tipo });
      toast('Solicitud enviada. Te avisamos cuando la aprueben.');
      S.cal.sel = null; S.cal.msg = ''; await refrescar(); await calCargar(); render();
    });
  } else if (a === 'cancelar') {
    if (!confirmar('¿Cancelar esta solicitud? Se liberan tus e-coins.')) return;
    await busy(el, async () => { await rpc('ec_cancelar_solicitud', { p_token: S.token, p_id: Number(el.dataset.id) }); toast('Solicitud cancelada'); S.cal.dias = []; await refrescar(); render(); });
  } else if (a === 'dinero') {
    const min = cfgN('min_canje_dinero', 10), disp = S.me.saldo - S.me.comprometido, val = cfgN('valor_ecoin', 10000);
    modal(`<h2>Canjear en dinero</h2><p class="help" style="margin:0">Mínimo ${min} e-coins · 1 e-coin = ${money(val)} · Se paga en la nómina siguiente, después de aprobado.</p>
      <form class="stack" id="f-dinero"><label class="f">Cantidad de e-coins<input class="in" type="number" name="cant" min="${min}" max="${disp}" step="1" required value="${Math.min(Math.max(min, 0), disp)}"></label>
      <span class="help">Disponibles: ${disp}</span>
      ${disp < min ? `<div class="err">Necesitas al menos ${min} e-coins disponibles.</div>` : ''}
      <div class="row"><button class="btn" type="submit" ${disp < min ? 'disabled' : ''}>Solicitar canje</button><button class="btn out" type="button" data-act="cerrar">Cancelar</button></div></form>`);
  } else if (a === 'vb') {
    await busy(el, async () => { await rpc('ec_visto_bueno', { p_token: S.token, p_id: Number(el.dataset.id) }); toast('Visto bueno registrado'); await refrescar(); render(); });
  } else if (a === 'pick') { S.asg.persona = el.dataset.id; render(); }
  else if (a === 'concepto') { S.asg.concepto = el.dataset.id; render(); }
  else if (a === 'aprobar') {
    await busy(el, async () => { await rpc('ec_admin_resolver', { p_token: S.token, p_id: Number(el.dataset.id), p_aprobar: true, p_motivo: null }); toast('Aprobada. Se notificó a la persona.'); await refrescar(); render(); });
  } else if (a === 'rechazar') {
    modal(`<h2>Rechazar solicitud</h2><form class="stack" id="f-rechazo" data-id="${el.dataset.id}"><label class="f">Motivo (lo verá la persona)<textarea class="in" name="motivo" rows="3" required minlength="3"></textarea></label>
      <div class="row"><button class="btn danger" type="submit">Rechazar</button><button class="btn out" type="button" data-act="cerrar">Volver</button></div></form>`);
  } else if (a === 'rachas') {
    await busy(el, async () => { const r = await rpc('ec_admin_calcular_rachas', { p_token: S.token }); toast(r.rachas ? `${r.rachas} rachas nuevas cargadas` : 'No hay rachas nuevas'); await refrescar(); });
  } else if (a === 'guardar-cfg') {
    await busy(el, async () => {
      const tareas = [];
      document.querySelectorAll('[data-cfgb]').forEach((i) => tareas.push(rpc('ec_admin_config_guardar', { p_token: S.token, p_clave: i.dataset.cfgb, p_valor: i.checked })));
      document.querySelectorAll('[data-cfgn]').forEach((i) => { const v = parseInt(i.value, 10); if (Number.isFinite(v) && v >= 0) tareas.push(rpc('ec_admin_config_guardar', { p_token: S.token, p_clave: i.dataset.cfgn, p_valor: v })); });
      await Promise.all(tareas); toast('Reglas guardadas'); S.cal.dias = []; await refrescar(); render();
    });
  } else if (a === 'del-bloqueo') {
    if (!confirmar('¿Quitar este bloqueo?')) return;
    await busy(el, async () => { await rpc('ec_admin_bloqueo_borrar', { p_token: S.token, p_id: Number(el.dataset.id) }); S.cal.dias = []; await refrescar(); render(); });
  } else if (a === 'del-festivo') {
    if (!confirmar('¿Quitar este festivo?')) return;
    await busy(el, async () => { await rpc('ec_admin_festivo_borrar', { p_token: S.token, p_fecha: el.dataset.f }); S.cal.dias = []; await refrescar(); render(); });
  } else if (a === 'persona-nueva' || a === 'persona-editar') {
    const p = a === 'persona-editar' ? S.admin.personas.find((x) => x.id === el.dataset.id) : null;
    modal(`<h2>${p ? 'Editar persona' : 'Agregar persona'}</h2><form class="stack" id="f-persona" ${p ? `data-id="${p.id}"` : ''}>
      <label class="f">Nombre completo<input class="in" name="nombre" required value="${esc(p ? p.nombre : '')}"></label>
      <label class="f">Cédula (con ella ingresa)<input class="in" name="documento" required inputmode="numeric" value="${esc(p ? p.documento : '')}"></label>
      <label class="f">Proceso<input class="in" name="proceso" list="dl-proc" required value="${esc(p ? p.proceso : '')}"><datalist id="dl-proc">${procesos().map((x) => `<option value="${esc(x)}">`).join('')}</datalist></label>
      <label class="f">Rol<select class="in" name="rol">${['empleado', 'lider', 'admin'].map((r) => `<option value="${r}" ${p && p.rol === r ? 'selected' : ''}>${rolTxt(r)}</option>`).join('')}</select></label>
      <label class="f">PIN (solo para administradores)<input class="in" name="pin" inputmode="numeric" maxlength="6" pattern="[0-9]{4,6}"><span class="help">Empleados y líderes entran solo con la cédula. Un administrador nuevo necesita PIN temporal.</span></label>
      <label class="check"><input type="checkbox" name="es_lider" ${p && p.es_lider ? 'checked' : ''}><span>Es líder de su proceso<span class="small" style="display:block">Aparece en Líderes del Mes y da visto bueno a su proceso, aunque sea administrador.</span></span></label>
      <label class="check"><input type="checkbox" name="activo" ${!p || p.activo ? 'checked' : ''}><span>Activo</span></label>
      <div class="row"><button class="btn" type="submit">Guardar</button><button class="btn out" type="button" data-act="cerrar">Cancelar</button></div></form>`);
  } else if (a === 'persona-pin') {
    const p = S.admin.personas.find((x) => x.id === el.dataset.id);
    modal(`<h2>Nuevo PIN para ${esc(p.nombre)}</h2><form class="stack" id="f-resetpin" data-id="${p.id}"><label class="f">PIN temporal (4 a 6 números)<input class="in" name="pin" inputmode="numeric" maxlength="6" required pattern="[0-9]{4,6}"></label>
      <p class="help" style="margin:0">Cierra sus sesiones abiertas y le pedirá cambiarlo al entrar.</p>
      <div class="row"><button class="btn" type="submit">Asignar PIN</button><button class="btn out" type="button" data-act="cerrar">Cancelar</button></div></form>`);
  } else if (a === 'import-personas') {
    modal(`<h2>Cargar lista de personas</h2><p class="help" style="margin:0">Pega desde Excel una persona por línea con columnas: <b>nombre; cédula; proceso; rol</b>. Rol: empleado, lider o admin (admin necesita una quinta columna con PIN). Si la cédula ya existe, se actualiza.</p>
      <form class="stack" id="f-import-personas"><textarea class="in" name="lista" rows="8" placeholder="Laura Gómez;1012345678;IS;empleado" required></textarea>
      <div id="imp-res"></div><div class="row"><button class="btn" type="submit">Cargar</button><button class="btn out" type="button" data-act="cerrar">Cerrar</button></div></form>`);
  } else if (a === 'tard-just') {
    await busy(el, async () => { await rpc('ec_admin_tardanza_justificar', { p_token: S.token, p_id: Number(el.dataset.id), p_justificada: el.dataset.v === '1' }); await cargarTard(); await refrescar(); render(); });
  } else if (a === 'tard-borrar') {
    if (!confirmar('¿Anular este registro de llegada tarde? Si ya se descontó, se devuelve el e-coin.')) return;
    await busy(el, async () => { await rpc('ec_admin_tardanza_borrar', { p_token: S.token, p_id: Number(el.dataset.id) }); await cargarTard(); await refrescar(); render(); });
  } else if (a === 'csv') {
    const rows = [['Nombre', 'Cedula', 'Proceso', 'Rol', 'Saldo', 'Reservado', 'Dias tomados', 'Ganados año']].concat(
      S.admin.personas.map((p) => [p.nombre, p.documento, p.proceso, rolTxt(p.rol), p.saldo, p.comprometido, p.dias, p.ganados_anio]));
    const csv = '﻿' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const l = document.createElement('a'); l.href = url; l.download = `ecoins-saldos-${iso(new Date())}.csv`; l.click(); URL.revokeObjectURL(url);
  }
});
function confirmar(msg) { return window.confirm(msg); }

window.addEventListener('hashchange', () => { closeModal(); render(); window.scrollTo(0, 0); });
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && S.token && S.me) { try { await refrescar(); if (!$('#modal').hidden) return; const a = document.activeElement; if (a && a.matches('input,textarea,select')) return; render(); } catch (e) { /* silencioso */ } }
});
render();
