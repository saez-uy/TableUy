// ============================================================
// admin.js — Panel de administración principal
// ============================================================

async function initAdmin() {
  if (!checkAuth()) return;
  await loadDashboard();
  activateNavLink();
}

function checkAuth() {
  const token = getAdminToken();
  if (!token) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

// ============================================================
// LOGIN
// ============================================================
async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  const password = form.querySelector('#admin-password').value;
  const btn = form.querySelector('button[type=submit]');
  const errorEl = document.getElementById('login-error');

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  if (errorEl) errorEl.classList.add('hidden');

  try {
    const result = await adminLogin(password);

    if (result.success) {
      saveAdminToken(result.token, result.expiry);
      window.location.reload();
    } else {
      if (errorEl) { errorEl.textContent = result.error || 'Password incorrecto'; errorEl.classList.remove('hidden'); }
      btn.disabled = false;
      btn.textContent = 'Ingresar';
    }
  } catch (err) {
    if (errorEl) { errorEl.textContent = 'Error de conexión'; errorEl.classList.remove('hidden'); }
    btn.disabled = false;
    btn.textContent = 'Ingresar';
  }
}

function handleLogout() {
  clearAdminToken();
  window.location.href = 'index.html';
}

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
  const container = document.getElementById('dashboard-content');
  if (!container) return;

  container.innerHTML = renderSkeletonMetrics();

  try {
    const data = await getDashboard();
    if (data.error) { showAdminError(data.error); return; }
    renderDashboard(data);
  } catch (e) {
    showAdminError('Error al cargar el dashboard');
  }
}

function renderSkeletonMetrics() {
  return `
    <div class="metrics-grid">
      ${Array(4).fill('<div class="metric-card"><div class="skeleton skeleton-text" style="width:50%"></div><div class="skeleton skeleton-text" style="width:30%;height:2.5rem;margin-top:.5rem"></div></div>').join('')}
    </div>
  `;
}

function renderDashboard(data) {
  const container = document.getElementById('dashboard-content');
  const { hoy, semana } = data;

  container.innerHTML = `
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Reservas hoy</div>
        <div class="metric-value">${hoy.totalReservas}</div>
        <div class="metric-sub">${hoy.confirmadas} confirmadas · ${hoy.pendientes} pendientes</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Personas esperadas</div>
        <div class="metric-value">${hoy.personas}</div>
        <div class="metric-sub">Ocupación estimada</div>
        <div class="progress-bar-wrap mt-1">
          <div class="progress-bar-fill" style="width: ${Math.min(hoy.ocupacion, 100)}%"></div>
        </div>
        <div class="mt-1" style="font-size:.75rem;color:var(--color-text-dim)">${hoy.ocupacion}% de capacidad</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Esta semana</div>
        <div class="metric-value">${semana.totalReservas}</div>
        <div class="metric-sub">${semana.personas} personas · ${semana.cancelaciones} canceladas</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Pendientes confirmar</div>
        <div class="metric-value text-accent">${hoy.pendientes}</div>
        <div class="metric-sub">Requieren atención</div>
      </div>
    </div>

    <div class="mt-4">
      <div class="flex justify-between items-center mb-2">
        <h3 style="font-size:1.2rem">Reservas de hoy — ${formatFechaCorta(hoy.fecha)}</h3>
        <a href="calendario.html" class="btn btn-outline btn-sm">Ver calendario</a>
      </div>
      ${hoy.reservas.length === 0 ? '<div class="alert alert-info">No hay reservas para hoy.</div>' :
        `<div class="table-wrapper">
          <div class="table-scroll">
            <table>
              <thead><tr>
                <th>Hora</th><th>Nombre</th><th>Personas</th><th>Mesa</th><th>Estado</th><th>Acciones</th>
              </tr></thead>
              <tbody>
                ${hoy.reservas.map(r => renderReservaRow(r)).join('')}
              </tbody>
            </table>
          </div>
        </div>`
      }
    </div>
  `;
}

// ============================================================
// RESERVAS (TABLA COMPLETA)
// ============================================================
let reservasCache = [];
let filtroActual = {};

async function loadReservas() {
  const container = document.getElementById('reservas-content');
  if (!container) return;

  container.innerHTML = '<div class="table-wrapper"><div style="padding:2rem;text-align:center"><span class="spinner"></span></div></div>';

  try {
    const data = await getReservasAdmin(filtroActual);
    if (data.error) { showAdminError(data.error); return; }
    reservasCache = data.reservas;
    renderTablaReservas(reservasCache);
  } catch (e) {
    showAdminError('Error al cargar reservas');
  }
}

function renderTablaReservas(reservas) {
  const container = document.getElementById('reservas-content');
  container.innerHTML = `
    <div class="table-wrapper">
      <div class="table-toolbar">
        <div class="search-input-wrap">
          <span class="search-icon">🔍</span>
          <input type="text" class="form-control" id="busqueda-input" placeholder="Buscar por nombre, email, código…" value="${filtroActual.busqueda || ''}">
        </div>
        <select class="form-control" id="filtro-estado" style="max-width:160px">
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendientes</option>
          <option value="confirmada">Confirmadas</option>
          <option value="cancelada">Canceladas</option>
          <option value="completada">Completadas</option>
          <option value="no-show">No show</option>
        </select>
        <input type="date" class="form-control" id="filtro-fecha" style="max-width:160px" value="${filtroActual.fecha || ''}">
        <button class="btn btn-outline btn-sm" onclick="exportarCSV()">⬇ CSV</button>
        <button class="btn btn-primary btn-sm" onclick="openModalNuevaReserva()">+ Nueva</button>
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr>
            <th>Código</th><th>Fecha</th><th>Hora</th><th>Nombre</th>
            <th>Personas</th><th>Mesa</th><th>Estado</th><th>Acciones</th>
          </tr></thead>
          <tbody id="reservas-tbody">
            ${reservas.map(r => renderReservaRow(r)).join('')}
          </tbody>
        </table>
      </div>
      ${reservas.length === 0 ? '<div style="padding:2rem;text-align:center;color:var(--color-text-muted)">No hay reservas que coincidan</div>' : ''}
    </div>
  `;

  document.getElementById('filtro-estado').value = filtroActual.estado || '';

  document.getElementById('busqueda-input').addEventListener('input', debounce(e => {
    filtroActual.busqueda = e.target.value;
    const filtered = reservasCache.filter(r => {
      const q = e.target.value.toLowerCase();
      return !q || r.nombre.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || r.codigo.toLowerCase().includes(q);
    });
    document.getElementById('reservas-tbody').innerHTML = filtered.map(r => renderReservaRow(r)).join('');
  }, 300));

  document.getElementById('filtro-estado').addEventListener('change', e => {
    filtroActual.estado = e.target.value;
    loadReservas();
  });

  document.getElementById('filtro-fecha').addEventListener('change', e => {
    filtroActual.fecha = e.target.value;
    loadReservas();
  });
}

function renderReservaRow(r) {
  const badge = estadoBadge(r.estado);
  return `
    <tr>
      <td><code style="font-size:.8rem;letter-spacing:.05em">${r.codigo}</code></td>
      <td>${formatFechaCorta(r.fecha)}</td>
      <td style="font-weight:600">${r.hora}</td>
      <td>
        <div style="font-weight:500">${r.nombre}</div>
        <div style="font-size:.78rem;color:var(--color-text-muted)">${r.email}</div>
      </td>
      <td style="text-align:center">${r.personas}</td>
      <td style="text-align:center">#${r.mesaNumero}</td>
      <td><span class="badge ${badge.class}">${badge.label}</span></td>
      <td>
        <div class="table-actions">
          <button class="action-btn" onclick="verDetalleReserva('${r.id}')" title="Ver detalle">👁</button>
          ${r.estado === 'pendiente' ? `<button class="action-btn confirm" onclick="cambiarEstado('${r.id}','confirmada')" title="Confirmar">✓</button>` : ''}
          ${r.estado !== 'cancelada' && r.estado !== 'completada' ? `<button class="action-btn cancel" onclick="cambiarEstado('${r.id}','cancelada')" title="Cancelar">✕</button>` : ''}
          ${r.estado === 'confirmada' ? `<button class="action-btn" onclick="cambiarEstado('${r.id}','completada')" title="Marcar completada">★</button>` : ''}
          ${r.estado === 'confirmada' ? `<button class="action-btn" onclick="cambiarEstado('${r.id}','no-show')" title="No show">✗</button>` : ''}
        </div>
      </td>
    </tr>
  `;
}

async function cambiarEstado(id, estado) {
  const labels = { confirmada: 'confirmar', cancelada: 'cancelar', completada: 'marcar como completada', 'no-show': 'marcar como no-show' };
  if (!confirm(`¿Deseas ${labels[estado] || 'actualizar'} esta reserva?`)) return;

  try {
    const result = await updateReservaAdmin(id, estado);
    if (result.error) { showAdminError(result.error); return; }
    showAdminToast('Reserva actualizada', 'success');
    await loadReservas();
  } catch (e) {
    showAdminError('Error al actualizar reserva');
  }
}

function verDetalleReserva(id) {
  const r = reservasCache.find(x => x.id === id);
  if (!r) return;

  const modal = document.getElementById('modal-detalle');
  if (!modal) return;

  document.getElementById('modal-detalle-content').innerHTML = `
    <ul class="detail-list">
      <li><span class="label">Código</span><span class="value" style="font-family:monospace;letter-spacing:.05em">${r.codigo}</span></li>
      <li><span class="label">Fecha</span><span class="value">${formatFecha(r.fecha)}</span></li>
      <li><span class="label">Hora</span><span class="value">${r.hora}</span></li>
      <li><span class="label">Personas</span><span class="value">${r.personas}</span></li>
      <li><span class="label">Mesa</span><span class="value">#${r.mesaNumero}</span></li>
      <li><span class="label">Estado</span><span class="value"><span class="badge ${estadoBadge(r.estado).class}">${estadoBadge(r.estado).label}</span></span></li>
      <li><span class="label">Nombre</span><span class="value">${r.nombre}</span></li>
      <li><span class="label">Email</span><span class="value">${r.email}</span></li>
      <li><span class="label">Teléfono</span><span class="value">${r.telefono || '—'}</span></li>
      ${r.notas ? `<li><span class="label">Notas</span><span class="value" style="text-align:left;max-width:200px">${r.notas}</span></li>` : ''}
      ${r.alergias ? `<li><span class="label">Alergias</span><span class="value" style="text-align:left;max-width:200px">${r.alergias}</span></li>` : ''}
      <li><span class="label">Creada</span><span class="value" style="font-size:.8rem">${formatDatetime(r.fechaCreacion)}</span></li>
    </ul>
    <div class="flex gap-1 mt-3" style="flex-wrap:wrap">
      ${r.estado === 'pendiente' ? `<button class="btn btn-sm" style="background:var(--color-success);color:#fff" onclick="cambiarEstado('${r.id}','confirmada');closeModal('modal-detalle')">Confirmar</button>` : ''}
      ${r.estado !== 'cancelada' && r.estado !== 'completada' ? `<button class="btn btn-sm btn-danger" onclick="cambiarEstado('${r.id}','cancelada');closeModal('modal-detalle')">Cancelar</button>` : ''}
    </div>
  `;

  openModal('modal-detalle');
}

// ============================================================
// EXPORTAR CSV
// ============================================================
function exportarCSV() {
  if (!reservasCache.length) { showAdminToast('No hay datos para exportar', 'warning'); return; }

  const headers = ['Codigo','Fecha','Hora','Personas','Nombre','Email','Telefono','Mesa','Estado','Notas','Alergias'];
  const rows = reservasCache.map(r => [
    r.codigo, r.fecha, r.hora, r.personas, r.nombre, r.email,
    r.telefono, r.mesaNumero, r.estado,
    (r.notas || '').replace(/,/g, ';'), (r.alergias || '').replace(/,/g, ';')
  ]);

  const csv = [headers, ...rows].map(row => row.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reservas-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// MODAL NUEVA RESERVA (ADMIN)
// ============================================================
function openModalNuevaReserva() {
  const modal = document.getElementById('modal-nueva-reserva');
  if (modal) openModal('modal-nueva-reserva');
}

async function submitNuevaReserva(e) {
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
    telefono: form.telefono.value,
    notas: form.notas.value,
    alergias: form.alergias.value
  };

  try {
    const result = await crearReservaAdmin(datos);
    if (result.error) { showAdminToast(result.error, 'error'); btn.disabled = false; return; }
    showAdminToast(`Reserva creada — Código: ${result.codigo}`, 'success');
    closeModal('modal-nueva-reserva');
    form.reset();
    btn.disabled = false;
    await loadReservas();
  } catch (err) {
    showAdminToast('Error al crear reserva', 'error');
    btn.disabled = false;
  }
}

// ============================================================
// UTILS
// ============================================================
function openModal(id) {
  document.getElementById(id)?.classList.add('active');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('active');
}

function activateNavLink() {
  const path = window.location.pathname;
  document.querySelectorAll('.sidebar-nav a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') && path.endsWith(a.getAttribute('href').replace('../','/').replace('./','')));
  });
}

function showAdminError(msg) {
  const el = document.getElementById('admin-error');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); setTimeout(() => el.classList.add('hidden'), 5000); }
  else alert(msg);
}

function showAdminToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `alert alert-${type === 'error' ? 'error' : type === 'success' ? 'success' : 'info'}`;
  toast.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;z-index:500;min-width:240px;animation:fadeIn 0.3s ease;max-width:400px';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function formatDatetime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('es-UY', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

function toggleSidebar() {
  document.getElementById('admin-sidebar').classList.toggle('open');
}

// ============================================================
// INICIALIZACIÓN SEGÚN PÁGINA
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;

  const loginForm = document.getElementById('admin-login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
    return;
  }

  if (!checkAuth()) return;

  activateNavLink();

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  const sidebarToggle = document.querySelector('.sidebar-toggle');
  if (sidebarToggle) sidebarToggle.addEventListener('click', toggleSidebar);

  if (document.getElementById('dashboard-content')) loadDashboard();
  if (document.getElementById('reservas-content')) loadReservas();

  const nuevaReservaForm = document.getElementById('form-nueva-reserva');
  if (nuevaReservaForm) nuevaReservaForm.addEventListener('submit', submitNuevaReserva);

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('active');
    });
  });
});
