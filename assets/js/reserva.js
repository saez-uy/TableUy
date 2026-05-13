// ============================================================
// reserva.js — Wizard de reserva (4 pasos)
// ============================================================

const state = {
  paso: 1,
  fecha: null,
  hora: null,
  personas: 2,
  nombre: '',
  email: '',
  telefono: '',
  notas: '',
  alergias: '',
  config: null,
  disponibilidad: null,
  codigoReserva: null
};

let calYear, calMonth;

// ============================================================
// INICIALIZACIÓN
// ============================================================
async function init() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();

  showLoading('Cargando configuración…');

  try {
    state.config = await getConfigPublica();
  } catch (e) {
    showLoading(false);
    showError('No se pudo conectar con el servidor. Por favor recarga la página.');
    return;
  }

  showLoading(false);
  renderCalendar();
  setupStep3Form();
  bindPersonasControls();
}

// ============================================================
// NAVEGACIÓN ENTRE PASOS
// ============================================================
function goToStep(paso) {
  const current = document.querySelector('.wizard-panel.active');
  const next = document.getElementById('paso-' + paso);

  if (current && current !== next) {
    current.classList.add('exit-left');
    setTimeout(() => current.classList.remove('active', 'exit-left'), 350);
  }

  setTimeout(() => {
    if (next) {
      next.classList.add('active');
    }
  }, 50);

  state.paso = paso;
  updateProgressBar(paso);
}

function updateProgressBar(paso) {
  document.querySelectorAll('.wizard-step').forEach((el, i) => {
    const n = i + 1;
    el.classList.toggle('active', n === paso);
    el.classList.toggle('completed', n < paso);
  });
  document.querySelectorAll('.progress-line').forEach((el, i) => {
    el.classList.toggle('completed', i + 1 < paso);
  });
}

function nextStep() {
  if (state.paso === 1) {
    if (!state.fecha) return showToast('Selecciona una fecha', 'error');
    goToStep(2);
    renderSlots();
  } else if (state.paso === 2) {
    if (!state.hora) return showToast('Selecciona una hora', 'error');
    goToStep(3);
  } else if (state.paso === 3) {
    if (!validateStep3()) return;
    goToStep(4);
    renderResumen();
  }
}

function prevStep() {
  if (state.paso > 1) goToStep(state.paso - 1);
}

// ============================================================
// PASO 1: CALENDARIO
// ============================================================
function renderCalendar() {
  const container = document.getElementById('calendar-grid');
  if (!container) return;

  const now = new Date();
  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay = new Date(calYear, calMonth + 1, 0);
  const startPad = firstDay.getDay();
  const diasCierre = (state.config?.diasCierre || '').split(',').map(d => d.trim().toLowerCase());
  const diasSemana = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
  const maxDias = parseInt(state.config?.maxDiasFuturos || 30);
  const minHoras = parseInt(state.config?.minAnticipacionHoras || 2);
  const maxFecha = new Date(now.getTime() + maxDias * 86400000);

  document.getElementById('cal-month-title').textContent =
    new Date(calYear, calMonth, 1).toLocaleDateString('es-UY', { month: 'long', year: 'numeric' });

  container.innerHTML = '';

  for (let i = 0; i < startPad; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day';
    container.appendChild(empty);
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(calYear, calMonth, d);
    const dateStr = formatDateISO(date);
    const isPast = date < new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const isFuture = date > maxFecha;
    const diaNombre = diasSemana[date.getDay()];
    const isClosed = diasCierre.includes(diaNombre);
    const isToday = dateStr === formatDateISO(now);

    const el = document.createElement('div');
    el.className = 'cal-day';
    el.textContent = d;

    if (isPast || isFuture) {
      el.classList.add('past');
    } else if (isClosed) {
      el.classList.add('closed');
      el.title = 'Cerrado';
    } else {
      el.classList.add('available');
      if (isToday) el.classList.add('today');
      if (dateStr === state.fecha) el.classList.add('selected');
      el.addEventListener('click', () => selectDate(dateStr, el));
    }

    container.appendChild(el);
  }
}

function selectDate(fecha, el) {
  document.querySelectorAll('.cal-day.selected').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  state.fecha = fecha;
  state.hora = null;
  document.getElementById('btn-next-1').removeAttribute('disabled');
}

function prevMonth() {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
}

function nextMonth() {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
}

// ============================================================
// PASO 2: HORA Y PERSONAS
// ============================================================
async function renderSlots() {
  const container = document.getElementById('slots-container');
  const dateDisplay = document.getElementById('selected-date-display');

  dateDisplay.textContent = formatFecha(state.fecha);
  container.innerHTML = '<div class="skeleton skeleton-rect" style="border-radius:8px"></div>';

  try {
    state.disponibilidad = await getDisponibilidad(state.fecha);
  } catch (e) {
    container.innerHTML = '<div class="alert alert-error">Error al obtener disponibilidad. Intenta de nuevo.</div>';
    return;
  }

  if (!state.disponibilidad.disponible) {
    container.innerHTML = `<div class="alert alert-error">${state.disponibilidad.mensaje || 'No hay disponibilidad para esta fecha.'}</div>`;
    return;
  }

  const slots = state.disponibilidad.slots || [];
  if (slots.length === 0) {
    container.innerHTML = '<div class="alert alert-warning">No hay horarios configurados para esta fecha.</div>';
    return;
  }

  container.innerHTML = '';
  slots.forEach(slot => {
    const btn = document.createElement('button');
    btn.className = 'slot-btn';
    btn.textContent = slot.hora;

    const disponibleParaPersonas = slot.disponible && slot.capacidadMaxima >= state.personas;

    if (!slot.disponible) {
      btn.disabled = true;
      btn.title = 'Sin disponibilidad';
    } else if (!disponibleParaPersonas) {
      btn.title = `Disponible solo hasta ${slot.capacidadMaxima} personas`;
      btn.classList.add('limited');
    }

    if (slot.hora === state.hora) btn.classList.add('selected');

    btn.addEventListener('click', () => {
      if (!slot.disponible) return;
      document.querySelectorAll('.slot-btn.selected').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.hora = slot.hora;
      document.getElementById('btn-next-2').removeAttribute('disabled');
    });

    container.appendChild(btn);
  });

  updateMaxPersonas();
}

function bindPersonasControls() {
  document.getElementById('personas-minus')?.addEventListener('click', () => changePersonas(-1));
  document.getElementById('personas-plus')?.addEventListener('click', () => changePersonas(1));
}

function changePersonas(delta) {
  const max = parseInt(state.config?.maxPersonasPorReserva || 10);
  state.personas = Math.max(1, Math.min(max, state.personas + delta));
  document.getElementById('personas-count').textContent = state.personas;

  if (state.hora) {
    const slot = state.disponibilidad?.slots?.find(s => s.hora === state.hora);
    if (slot && slot.capacidadMaxima < state.personas) {
      state.hora = null;
      document.querySelectorAll('.slot-btn.selected').forEach(b => b.classList.remove('selected'));
      document.getElementById('btn-next-2').setAttribute('disabled', true);
    }
  }

  if (state.disponibilidad) updateMaxPersonas();
}

function updateMaxPersonas() {
  const slots = state.disponibilidad?.slots || [];
  slots.forEach((slot, i) => {
    const btn = document.querySelectorAll('.slot-btn')[i];
    if (!btn) return;
    if (slot.disponible && slot.capacidadMaxima < state.personas) {
      btn.disabled = true;
      btn.title = `Capacidad máxima: ${slot.capacidadMaxima} personas`;
    } else if (slot.disponible) {
      btn.disabled = false;
      btn.title = '';
    }
  });
}

// ============================================================
// PASO 3: DATOS PERSONALES
// ============================================================
function setupStep3Form() {
  const form = document.getElementById('form-datos');
  if (!form) return;

  form.addEventListener('input', e => {
    const field = e.target.name;
    if (field) state[field] = e.target.value;
  });
}

function validateStep3() {
  const nombre = document.getElementById('nombre').value.trim();
  const email = document.getElementById('email').value.trim();
  const telefono = document.getElementById('telefono').value.trim();

  if (!nombre) { showToast('El nombre es obligatorio', 'error'); return false; }
  if (!email || !isValidEmail(email)) { showToast('Email inválido', 'error'); return false; }
  if (!telefono) { showToast('El teléfono es obligatorio', 'error'); return false; }

  state.nombre = nombre;
  state.email = email;
  state.telefono = telefono;
  state.notas = document.getElementById('notas').value.trim();
  state.alergias = document.getElementById('alergias').value.trim();

  return true;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ============================================================
// PASO 4: RESUMEN Y CONFIRMACIÓN
// ============================================================
function renderResumen() {
  const el = id => document.getElementById(id);
  const resumen = el('resumen');
  if (!resumen) return;

  el('resumen-fecha').textContent = formatFecha(state.fecha);
  el('resumen-hora').textContent = state.hora;
  el('resumen-personas').textContent = state.personas;
  el('resumen-nombre').textContent = state.nombre;
  el('resumen-email').textContent = state.email;
  el('resumen-telefono').textContent = state.telefono;
  if (state.notas) el('resumen-notas').textContent = state.notas;
  else el('resumen-notas-row')?.classList.add('hidden');
  if (state.alergias) el('resumen-alergias').textContent = state.alergias;
  else el('resumen-alergias-row')?.classList.add('hidden');
}

async function confirmarReserva() {
  const btn = document.getElementById('btn-confirmar');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Procesando…';

  try {
    const result = await crearReserva({
      fecha: state.fecha,
      hora: state.hora,
      personas: state.personas,
      nombre: state.nombre,
      email: state.email,
      telefono: state.telefono,
      notas: state.notas,
      alergias: state.alergias
    });

    if (result.error) {
      showToast(result.error, 'error');
      btn.disabled = false;
      btn.textContent = 'Confirmar Reserva';
      return;
    }

    state.codigoReserva = result.codigo;
    showSuccess(result.codigo);

  } catch (e) {
    showToast('Error de conexión. Intenta de nuevo.', 'error');
    btn.disabled = false;
    btn.textContent = 'Confirmar Reserva';
  }
}

function showSuccess(codigo) {
  document.getElementById('wizard-wrap').classList.add('hidden');
  document.getElementById('paso-4').classList.remove('hidden', 'active');

  const successEl = document.getElementById('success-screen');
  successEl.classList.remove('hidden');
  document.getElementById('codigo-generado').textContent = codigo;
  document.getElementById('success-nombre').textContent = state.nombre;
  document.getElementById('success-fecha').textContent = formatFecha(state.fecha);
  document.getElementById('success-hora').textContent = state.hora;
  document.getElementById('success-email').textContent = state.email;
}

// ============================================================
// UTILIDADES UI
// ============================================================
function showLoading(msg) {
  const overlay = document.getElementById('loading-overlay');
  const msgEl = document.getElementById('loading-msg');
  if (!overlay) return;
  if (msg) {
    if (msgEl) msgEl.textContent = msg;
    overlay.classList.add('active');
  } else {
    overlay.classList.remove('active');
  }
}

function showToast(msg, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast alert alert-${type === 'error' ? 'error' : 'info'}`;
  toast.style.cssText = 'position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);z-index:500;min-width:280px;text-align:center;animation:fadeIn 0.3s ease';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function showError(msg) {
  const el = document.getElementById('wizard-error');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}

function formatDateISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Inicializar cuando el DOM está listo
document.addEventListener('DOMContentLoaded', init);
