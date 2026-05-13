// ============================================================
// calendario.js — Vista de calendario admin
// ============================================================

let calData = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  view: 'month',
  reservas: [],
  selectedDate: null
};

async function initCalendario() {
  if (!checkAuth()) return;

  showCalLoading(true);
  try {
    await loadReservasCalendario();
  } catch (e) {
    showAdminToast('Error cargando datos', 'error');
  }
  showCalLoading(false);

  renderCalendarioAdmin();
  setupCalControls();
}

async function loadReservasCalendario() {
  const result = await getReservasAdmin({});
  if (result.error) throw new Error(result.error);
  calData.reservas = result.reservas || [];
}

// ============================================================
// CONTROLES
// ============================================================
function setupCalControls() {
  document.getElementById('cal-prev')?.addEventListener('click', () => {
    if (calData.view === 'month') {
      calData.month--;
      if (calData.month < 0) { calData.month = 11; calData.year--; }
    } else {
      const d = new Date(calData.selectedDate + 'T12:00:00');
      d.setDate(d.getDate() - 1);
      calData.selectedDate = formatDateISO(d);
    }
    renderCalendarioAdmin();
  });

  document.getElementById('cal-next')?.addEventListener('click', () => {
    if (calData.view === 'month') {
      calData.month++;
      if (calData.month > 11) { calData.month = 0; calData.year++; }
    } else {
      const d = new Date(calData.selectedDate + 'T12:00:00');
      d.setDate(d.getDate() + 1);
      calData.selectedDate = formatDateISO(d);
    }
    renderCalendarioAdmin();
  });

  document.getElementById('btn-view-month')?.addEventListener('click', () => {
    calData.view = 'month';
    renderCalendarioAdmin();
  });

  document.getElementById('btn-view-day')?.addEventListener('click', () => {
    if (!calData.selectedDate) calData.selectedDate = formatDateISO(new Date());
    calData.view = 'day';
    renderCalendarioAdmin();
  });

  document.getElementById('btn-hoy')?.addEventListener('click', () => {
    const now = new Date();
    calData.year = now.getFullYear();
    calData.month = now.getMonth();
    calData.selectedDate = formatDateISO(now);
    renderCalendarioAdmin();
  });
}

// ============================================================
// RENDER PRINCIPAL
// ============================================================
function renderCalendarioAdmin() {
  updateCalHeader();
  if (calData.view === 'month') {
    renderMonthView();
  } else {
    renderDayView();
  }
}

function updateCalHeader() {
  const titleEl = document.getElementById('cal-title');
  if (!titleEl) return;

  if (calData.view === 'month') {
    const d = new Date(calData.year, calData.month, 1);
    titleEl.textContent = d.toLocaleDateString('es-UY', { month: 'long', year: 'numeric' });
  } else if (calData.selectedDate) {
    titleEl.textContent = formatFecha(calData.selectedDate);
  }

  document.getElementById('btn-view-month')?.classList.toggle('btn-primary', calData.view === 'month');
  document.getElementById('btn-view-month')?.classList.toggle('btn-outline', calData.view !== 'month');
  document.getElementById('btn-view-day')?.classList.toggle('btn-primary', calData.view === 'day');
  document.getElementById('btn-view-day')?.classList.toggle('btn-outline', calData.view !== 'day');
}

// ============================================================
// VISTA MENSUAL
// ============================================================
function renderMonthView() {
  const container = document.getElementById('cal-content');
  if (!container) return;

  const firstDay = new Date(calData.year, calData.month, 1);
  const lastDay = new Date(calData.year, calData.month + 1, 0);
  const startPad = firstDay.getDay();
  const today = formatDateISO(new Date());

  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  let html = `<div class="cal-admin-grid">`;
  dayNames.forEach(d => { html += `<div class="cal-admin-day-name">${d}</div>`; });

  for (let i = 0; i < startPad; i++) {
    html += `<div class="cal-admin-cell empty"></div>`;
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(calData.year, calData.month, d);
    const dateStr = formatDateISO(date);
    const isToday = dateStr === today;
    const reservasDia = calData.reservas.filter(r => r.fecha === dateStr && r.estado !== 'cancelada');
    const totalPersonas = reservasDia.reduce((acc, r) => acc + parseInt(r.personas || 0), 0);
    const ocupacionColor = getOcupacionColor(reservasDia.length);

    html += `
      <div class="cal-admin-cell${isToday ? ' today' : ''}" onclick="selectDayView('${dateStr}')">
        <div class="cell-date" style="${isToday ? 'color:var(--color-accent)' : ''}">${d}</div>
        ${reservasDia.length > 0 ? `
          <div class="cell-ocupacion" style="background:${ocupacionColor};width:100%"></div>
          <div class="cell-count">${reservasDia.length} reservas · ${totalPersonas} 👤</div>
        ` : '<div class="cell-count" style="color:var(--color-border)">—</div>'}
      </div>
    `;
  }

  html += '</div>';
  container.innerHTML = html;
}

function getOcupacionColor(numReservas) {
  if (numReservas === 0) return 'transparent';
  if (numReservas <= 2) return 'rgba(76,175,116,0.6)';
  if (numReservas <= 5) return 'rgba(230,168,23,0.7)';
  return 'rgba(214,69,69,0.7)';
}

function selectDayView(fecha) {
  calData.selectedDate = fecha;
  calData.view = 'day';
  renderCalendarioAdmin();
}

// ============================================================
// VISTA DIARIA
// ============================================================
function renderDayView() {
  const container = document.getElementById('cal-content');
  if (!container) return;

  const fecha = calData.selectedDate;
  const reservasDia = calData.reservas.filter(r => r.fecha === fecha);

  if (reservasDia.length === 0) {
    container.innerHTML = `
      <div class="timeline-wrap text-center mt-4">
        <p style="color:var(--color-text-muted)">No hay reservas para ${formatFecha(fecha)}</p>
        <button class="btn btn-primary btn-sm mt-2" onclick="openModalNuevaReservaCalendario('${fecha}')">+ Agregar reserva</button>
      </div>
    `;
    return;
  }

  const horarios = [...new Set(reservasDia.map(r => r.hora))].sort();

  let html = `
    <div class="flex justify-between items-center mb-3">
      <p style="color:var(--color-text-muted);font-size:.9rem">${reservasDia.length} reservas · ${reservasDia.filter(r=>r.estado!=='cancelada').reduce((a,r)=>a+parseInt(r.personas||0),0)} personas</p>
      <button class="btn btn-primary btn-sm" onclick="openModalNuevaReservaCalendario('${fecha}')">+ Agregar reserva</button>
    </div>
    <div class="timeline-wrap">
  `;

  horarios.forEach(hora => {
    const horaReservas = reservasDia.filter(r => r.hora === hora);
    html += `<div class="timeline-hora">
      <div class="timeline-hora-label">${hora}</div>
      <div class="timeline-reservas">
        ${horaReservas.map(r => `
          <div class="timeline-pill ${r.estado}" onclick="showReservaModalCalendario('${r.id}')" title="${r.nombre} · ${r.personas} personas">
            <strong>${r.nombre}</strong> · ${r.personas}👤 · Mesa #${r.mesaNumero}
            <span class="badge ${estadoBadge(r.estado).class}" style="margin-left:.4rem;font-size:.65rem">${estadoBadge(r.estado).label}</span>
          </div>
        `).join('')}
      </div>
    </div>`;
  });

  html += '</div>';
  container.innerHTML = html;
}

// ============================================================
// MODAL DETALLE DESDE CALENDARIO
// ============================================================
function showReservaModalCalendario(id) {
  const r = calData.reservas.find(x => x.id === id);
  if (!r) return;

  const modal = document.getElementById('modal-reserva-cal');
  if (!modal) return;

  document.getElementById('modal-cal-content').innerHTML = `
    <ul class="detail-list">
      <li><span class="label">Código</span><span class="value" style="font-family:monospace">${r.codigo}</span></li>
      <li><span class="label">Nombre</span><span class="value">${r.nombre}</span></li>
      <li><span class="label">Email</span><span class="value">${r.email}</span></li>
      <li><span class="label">Teléfono</span><span class="value">${r.telefono || '—'}</span></li>
      <li><span class="label">Hora</span><span class="value">${r.hora}</span></li>
      <li><span class="label">Personas</span><span class="value">${r.personas}</span></li>
      <li><span class="label">Mesa</span><span class="value">#${r.mesaNumero}</span></li>
      <li><span class="label">Estado</span><span class="value"><span class="badge ${estadoBadge(r.estado).class}">${estadoBadge(r.estado).label}</span></span></li>
      ${r.notas ? `<li><span class="label">Notas</span><span class="value" style="text-align:left">${r.notas}</span></li>` : ''}
      ${r.alergias ? `<li><span class="label">Alergias</span><span class="value" style="text-align:left">${r.alergias}</span></li>` : ''}
    </ul>
    <div class="flex gap-1 mt-3" style="flex-wrap:wrap">
      ${r.estado === 'pendiente' ? `<button class="btn btn-sm" style="background:var(--color-success);color:#fff" onclick="accionCalendario('${r.id}','confirmada')">✓ Confirmar</button>` : ''}
      ${r.estado !== 'cancelada' && r.estado !== 'completada' ? `<button class="btn btn-sm btn-danger" onclick="accionCalendario('${r.id}','cancelada')">✕ Cancelar</button>` : ''}
      ${r.estado === 'confirmada' ? `<button class="btn btn-sm btn-outline" onclick="accionCalendario('${r.id}','no-show')">No asistió</button>` : ''}
      ${r.estado === 'confirmada' ? `<button class="btn btn-sm btn-outline" onclick="accionCalendario('${r.id}','completada')">★ Completada</button>` : ''}
    </div>
  `;

  openModal('modal-reserva-cal');
}

async function accionCalendario(id, estado) {
  const labels = { confirmada: '¿Confirmar reserva?', cancelada: '¿Cancelar reserva?', completada: '¿Marcar como completada?', 'no-show': '¿Marcar como no-show?' };
  if (!confirm(labels[estado] || '¿Actualizar?')) return;

  try {
    const result = await updateReservaAdmin(id, estado);
    if (result.error) { showAdminToast(result.error, 'error'); return; }
    closeModal('modal-reserva-cal');
    showAdminToast('Reserva actualizada', 'success');
    await loadReservasCalendario();
    renderCalendarioAdmin();
  } catch (e) {
    showAdminToast('Error al actualizar', 'error');
  }
}

function openModalNuevaReservaCalendario(fecha) {
  const form = document.getElementById('form-nueva-reserva-cal');
  if (!form) return;
  const fechaInput = form.querySelector('[name=fecha]');
  if (fechaInput) fechaInput.value = fecha;
  openModal('modal-nueva-reserva-cal');
}

async function submitNuevaReservaCal(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;

  const datos = {
    fecha: form.fecha.value,
    hora: form.hora.value,
    personas: parseInt(form.personas.value),
    nombre: form.nombre.value,
    email: form.email.value,
    telefono: form.telefono?.value || '',
    notas: form.notas?.value || ''
  };

  try {
    const result = await crearReservaAdmin(datos);
    if (result.error) { showAdminToast(result.error, 'error'); btn.disabled = false; return; }
    showAdminToast(`Reserva creada — ${result.codigo}`, 'success');
    closeModal('modal-nueva-reserva-cal');
    form.reset();
    btn.disabled = false;
    await loadReservasCalendario();
    renderCalendarioAdmin();
  } catch (err) {
    showAdminToast('Error al crear reserva', 'error');
    btn.disabled = false;
  }
}

// ============================================================
// UTILS
// ============================================================
function showCalLoading(show) {
  const el = document.getElementById('cal-loading');
  if (el) el.classList.toggle('hidden', !show);
}

function formatDateISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
  initCalendario();

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('active');
    });
  });

  document.getElementById('form-nueva-reserva-cal')?.addEventListener('submit', submitNuevaReservaCal);
});
