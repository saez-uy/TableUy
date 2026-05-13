// ============================================================
// api.js — Comunicación con Google Apps Script
// ============================================================

const API_URL = 'https://script.google.com/macros/s/AKfycbwhlyzqSarJMxz7fC40lqO4uuIDqTJJwxzEf2HFTybUsoNff9SHJNd6tdOmiMu24B73/exec';

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;

async function apiGet(params) {
  const url = new URL(API_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  return fetchWithRetry(url.toString(), { method: 'GET' });
}

async function apiPost(body) {
  return fetchWithRetry(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body)
  });
}

async function fetchWithRetry(url, options, attempt = 0) {
  try {
    const response = await fetch(url, options);

    if (response.status === 429 || response.status >= 500) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Respuesta inválida del servidor');
    }
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
      await sleep(delay);
      return fetchWithRetry(url, options, attempt + 1);
    }
    throw err;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// API PÚBLICA (CLIENTE)
// ============================================================

async function getDisponibilidad(fecha) {
  return apiGet({ action: 'getDisponibilidad', fecha });
}

async function getReserva(email, codigo) {
  return apiGet({ action: 'getReserva', email, codigo });
}

async function getConfigPublica() {
  return apiGet({ action: 'getConfig' });
}

async function crearReserva(datos) {
  return apiPost({ action: 'crearReserva', ...datos });
}

async function cancelarReserva(email, codigo) {
  return apiPost({ action: 'cancelarReserva', email, codigo });
}

// ============================================================
// API ADMIN
// ============================================================

function getAdminToken() {
  const stored = sessionStorage.getItem('adminSession');
  if (!stored) return null;
  try {
    const session = JSON.parse(stored);
    if (new Date(session.expiry) < new Date()) {
      sessionStorage.removeItem('adminSession');
      return null;
    }
    return session.token;
  } catch {
    return null;
  }
}

function saveAdminToken(token, expiry) {
  sessionStorage.setItem('adminSession', JSON.stringify({ token, expiry }));
}

function clearAdminToken() {
  sessionStorage.removeItem('adminSession');
}

async function adminLogin(password) {
  return apiGet({ action: 'adminLogin', password });
}

async function getDashboard() {
  const token = getAdminToken();
  if (!token) return { error: 'No autorizado' };
  return apiGet({ action: 'getDashboard', token });
}

async function getReservasAdmin(filtros = {}) {
  const token = getAdminToken();
  if (!token) return { error: 'No autorizado' };
  return apiGet({ action: 'getReservasAdmin', token, ...filtros });
}

async function updateReservaAdmin(id, estado) {
  const token = getAdminToken();
  if (!token) return { error: 'No autorizado' };
  return apiPost({ action: 'updateReserva', token, id, estado });
}

async function getMesasAdmin() {
  const token = getAdminToken();
  if (!token) return { error: 'No autorizado' };
  return apiGet({ action: 'getMesas', token });
}

async function updateMesaAdmin(mesa) {
  const token = getAdminToken();
  if (!token) return { error: 'No autorizado' };
  return apiPost({ action: 'updateMesa', token, ...mesa });
}

async function crearMesaAdmin(mesa) {
  const token = getAdminToken();
  if (!token) return { error: 'No autorizado' };
  return apiPost({ action: 'crearMesa', token, ...mesa });
}

async function updateConfigAdmin(config) {
  const token = getAdminToken();
  if (!token) return { error: 'No autorizado' };
  return apiPost({ action: 'updateConfig', token, config });
}

async function getBloqueadosAdmin() {
  const token = getAdminToken();
  if (!token) return { error: 'No autorizado' };
  return apiGet({ action: 'getBloqueados', token });
}

async function bloquearFechaAdmin(datos) {
  const token = getAdminToken();
  if (!token) return { error: 'No autorizado' };
  return apiPost({ action: 'bloquearFecha', token, ...datos });
}

async function desbloquearFechaAdmin(id) {
  const token = getAdminToken();
  if (!token) return { error: 'No autorizado' };
  return apiPost({ action: 'desbloquearFecha', token, id });
}

async function crearReservaAdmin(datos) {
  const token = getAdminToken();
  if (!token) return { error: 'No autorizado' };
  return apiPost({ action: 'crearReservaAdmin', token, ...datos });
}

// ============================================================
// UTILIDADES COMPARTIDAS
// ============================================================

function formatFecha(fechaStr) {
  const meses = ['enero','febrero','marzo','abril','mayo','junio',
    'julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const d = new Date(fechaStr + 'T12:00:00');
  return `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]}`;
}

function formatFechaCorta(fechaStr) {
  const [y, m, d] = fechaStr.split('-');
  return `${d}/${m}/${y}`;
}

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function estadoBadge(estado) {
  const map = {
    pendiente: { label: 'Pendiente', class: 'badge-warning' },
    confirmada: { label: 'Confirmada', class: 'badge-success' },
    cancelada: { label: 'Cancelada', class: 'badge-danger' },
    completada: { label: 'Completada', class: 'badge-info' },
    'no-show': { label: 'No asistió', class: 'badge-secondary' }
  };
  return map[estado] || { label: estado, class: 'badge-secondary' };
}
