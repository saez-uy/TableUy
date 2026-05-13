// ============================================================
// TableUy - Google Apps Script Backend
// REST API para sistema de reservas de restaurante
// ============================================================

const SHEET_RESERVAS = 'Reservas';
const SHEET_MESAS = 'Mesas';
const SHEET_CONFIG = 'Configuracion';
const SHEET_BLOQUEADOS = 'Bloqueados';
const TOKEN_EXPIRY_HOURS = 4;

// ============================================================
// ROUTER PRINCIPAL - GET
// ============================================================
function doGet(e) {
  try {
    const action = e.parameter.action;
    let result;

    switch (action) {
      case 'getDisponibilidad':
        result = getDisponibilidad(e.parameter.fecha);
        break;
      case 'getReserva':
        result = getReservaCliente(e.parameter.email, e.parameter.codigo);
        break;
      case 'getConfig':
        result = getConfigPublica();
        break;
      case 'adminLogin':
        result = adminLogin(e.parameter.password);
        break;
      case 'getReservasAdmin':
        result = getReservasAdmin(e.parameter.token, e.parameter);
        break;
      case 'getDashboard':
        result = getDashboard(e.parameter.token);
        break;
      case 'getMesas':
        result = getMesas(e.parameter.token);
        break;
      case 'getBloqueados':
        result = getBloqueados(e.parameter.token);
        break;
      default:
        result = { error: 'Acción no reconocida' };
    }

    return buildResponse(result);
  } catch (err) {
    return buildResponse({ error: err.message });
  }
}

// ============================================================
// ROUTER PRINCIPAL - POST
// ============================================================
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    let result;

    switch (action) {
      case 'crearReserva':
        result = crearReserva(data);
        break;
      case 'cancelarReserva':
        result = cancelarReservaCliente(data);
        break;
      case 'updateReserva':
        result = updateReserva(data);
        break;
      case 'updateConfig':
        result = updateConfig(data);
        break;
      case 'updateMesa':
        result = updateMesa(data);
        break;
      case 'crearMesa':
        result = crearMesa(data);
        break;
      case 'bloquearFecha':
        result = bloquearFecha(data);
        break;
      case 'desbloquearFecha':
        result = desbloquearFecha(data);
        break;
      case 'crearReservaAdmin':
        result = crearReservaAdmin(data);
        break;
      default:
        result = { error: 'Acción no reconocida' };
    }

    return buildResponse(result);
  } catch (err) {
    return buildResponse({ error: err.message });
  }
}

// ============================================================
// HELPERS DE RESPUESTA
// ============================================================
function buildResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ============================================================
// AUTENTICACIÓN ADMIN
// ============================================================
function adminLogin(password) {
  if (!password) return { error: 'Password requerido' };

  const config = getConfigSheet();
  const storedPassword = getConfigValue(config, 'admin_password');

  if (password !== storedPassword) {
    return { success: false, error: 'Password incorrecto' };
  }

  const token = Utilities.getUuid();
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + TOKEN_EXPIRY_HOURS);

  setConfigValue(config, 'admin_token', token);
  setConfigValue(config, 'admin_token_expiry', expiry.toISOString());

  return { success: true, token: token, expiry: expiry.toISOString() };
}

function verificarToken(token) {
  if (!token) return false;

  const config = getConfigSheet();
  const storedToken = getConfigValue(config, 'admin_token');
  const expiryStr = getConfigValue(config, 'admin_token_expiry');

  if (token !== storedToken) return false;
  if (!expiryStr) return false;

  const expiry = new Date(expiryStr);
  return new Date() < expiry;
}

// ============================================================
// DISPONIBILIDAD
// ============================================================
function getDisponibilidad(fecha) {
  if (!fecha) return { error: 'Fecha requerida' };

  const config = getConfigPublica();
  const hoy = new Date();
  const fechaObj = new Date(fecha + 'T12:00:00');

  // Validar rango de fechas
  const minAnticipacion = parseInt(config.minAnticipacionHoras || 2);
  const maxDiasFuturos = parseInt(config.maxDiasFuturos || 30);

  const minFecha = new Date(hoy.getTime() + minAnticipacion * 3600000);
  const maxFecha = new Date(hoy.getTime() + maxDiasFuturos * 86400000);

  if (fechaObj < minFecha && fechaObj.toDateString() !== hoy.toDateString()) {
    // permitir mismo día si pasa la validación por hora
  }

  // Verificar día de cierre semanal
  const diasCierre = (config.diasCierre || '').split(',').map(d => d.trim()).filter(Boolean);
  const diasSemana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const diaSemana = diasSemana[fechaObj.getDay()];

  if (diasCierre.includes(diaSemana)) {
    return { disponible: false, mensaje: 'El restaurante está cerrado ese día', slots: [] };
  }

  // Verificar fecha bloqueada
  const bloqueado = isFechaBloqueada(fecha);
  if (bloqueado.bloqueado) {
    return { disponible: false, mensaje: bloqueado.motivo || 'Fecha no disponible', slots: [] };
  }

  // Obtener slots de horario
  const horarios = (config.horarios || '').split(',').map(h => h.trim()).filter(Boolean);
  const mesas = getMesasActivas();
  const reservasDelDia = getReservasPorFecha(fecha);

  const slots = horarios.map(hora => {
    // Verificar franja bloqueada
    const franjaBloqueada = isFranjaBloqueada(fecha, hora);
    if (franjaBloqueada) {
      return { hora, disponible: false, capacidadMaxima: 0 };
    }

    // Verificar anticipación mínima para el slot
    const slotDateTime = new Date(fecha + 'T' + hora + ':00');
    if (slotDateTime < minFecha) {
      return { hora, disponible: false, capacidadMaxima: 0 };
    }

    // Calcular mesas disponibles para esa hora
    const mesasOcupadas = reservasDelDia
      .filter(r => r.hora === hora && r.estado !== 'cancelada')
      .map(r => r.mesaId);

    const mesasLibres = mesas.filter(m => !mesasOcupadas.includes(m.id));
    const capacidadMax = mesasLibres.reduce((acc, m) => Math.max(acc, parseInt(m.capacidad || 0)), 0);

    return {
      hora,
      disponible: mesasLibres.length > 0,
      mesasDisponibles: mesasLibres.length,
      capacidadMaxima: capacidadMax
    };
  });

  return {
    fecha,
    disponible: slots.some(s => s.disponible),
    slots,
    maxPersonasPorReserva: parseInt(config.maxPersonasPorReserva || 10)
  };
}

function isFechaBloqueada(fecha) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_BLOQUEADOS);
  if (!sheet) return { bloqueado: false };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    const fechaBloq = formatDate(row[0]);
    const tipo = row[1]; // 'dia' o 'franja'
    if (fechaBloq === fecha && tipo === 'dia') {
      return { bloqueado: true, motivo: row[3] || 'Fecha no disponible' };
    }
  }
  return { bloqueado: false };
}

function isFranjaBloqueada(fecha, hora) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_BLOQUEADOS);
  if (!sheet) return false;

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    const fechaBloq = formatDate(row[0]);
    const tipo = row[1];
    const horaBloq = row[2];
    if (fechaBloq === fecha && tipo === 'franja' && horaBloq === hora) {
      return true;
    }
  }
  return false;
}

// ============================================================
// CREAR RESERVA (CLIENTE)
// ============================================================
function crearReserva(data) {
  const { fecha, hora, personas, nombre, email, telefono, notas, alergias } = data;

  // Validaciones básicas
  if (!fecha || !hora || !personas || !nombre || !email) {
    return { error: 'Faltan campos obligatorios' };
  }

  const config = getConfigPublica();
  const maxPersonas = parseInt(config.maxPersonasPorReserva || 10);
  if (parseInt(personas) > maxPersonas) {
    return { error: `Máximo ${maxPersonas} personas por reserva` };
  }

  // Verificar disponibilidad
  const disponibilidad = getDisponibilidad(fecha);
  const slot = disponibilidad.slots.find(s => s.hora === hora);
  if (!slot || !slot.disponible) {
    return { error: 'El horario seleccionado ya no está disponible' };
  }

  // Asignar mesa
  const mesa = asignarMesa(fecha, hora, parseInt(personas));
  if (!mesa) {
    return { error: 'No hay mesas disponibles para esa cantidad de personas en ese horario' };
  }

  // Generar código único
  const codigo = generarCodigo();
  const id = Utilities.getUuid();
  const ahora = new Date();

  // Guardar reserva
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_RESERVAS);

  sheet.appendRow([
    id,
    codigo,
    fecha,
    hora,
    parseInt(personas),
    nombre,
    email,
    telefono || '',
    notas || '',
    alergias || '',
    mesa.id,
    mesa.numero,
    'pendiente',
    ahora.toISOString(),
    '', // fecha confirmacion
    '', // fecha cancelacion
    'no' // recordatorio enviado
  ]);

  // Enviar email de confirmación
  try {
    enviarEmailConfirmacion({
      nombre, email, fecha, hora, personas,
      codigo, mesaNumero: mesa.numero,
      notas, config
    });
  } catch (emailErr) {
    Logger.log('Error enviando email: ' + emailErr.message);
  }

  return {
    success: true,
    codigo,
    mesaNumero: mesa.numero,
    mensaje: 'Reserva creada exitosamente. Revisa tu email para la confirmación.'
  };
}

// ============================================================
// CANCELAR RESERVA (CLIENTE)
// ============================================================
function cancelarReservaCliente(data) {
  const { email, codigo } = data;
  if (!email || !codigo) return { error: 'Email y código son requeridos' };

  const reserva = findReserva(email, codigo);
  if (!reserva) return { error: 'Reserva no encontrada' };
  if (reserva.estado === 'cancelada') return { error: 'La reserva ya está cancelada' };
  if (reserva.estado === 'completada') return { error: 'No se puede cancelar una reserva completada' };

  // Verificar horas mínimas para cancelar
  const config = getConfigPublica();
  const minHorasCancelar = parseInt(config.minHorasCancelar || 2);
  const fechaHoraReserva = new Date(reserva.fecha + 'T' + reserva.hora + ':00');
  const ahora = new Date();
  const horasRestantes = (fechaHoraReserva - ahora) / 3600000;

  if (horasRestantes < minHorasCancelar) {
    return { error: `Solo puedes cancelar con al menos ${minHorasCancelar} horas de anticipación` };
  }

  // Actualizar estado
  updateReservaRow(reserva.rowIndex, 'cancelada', 'fecha_cancelacion', new Date().toISOString());

  // Enviar email de cancelación
  try {
    enviarEmailCancelacion({ nombre: reserva.nombre, email, fecha: reserva.fecha, hora: reserva.hora, codigo });
  } catch (e) {
    Logger.log('Error email cancelacion: ' + e.message);
  }

  return { success: true, mensaje: 'Reserva cancelada exitosamente' };
}

// ============================================================
// CONSULTA DE RESERVA (CLIENTE)
// ============================================================
function getReservaCliente(email, codigo) {
  if (!email || !codigo) return { error: 'Email y código requeridos' };

  const reserva = findReserva(email, codigo);
  if (!reserva) return { error: 'Reserva no encontrada. Verifica el email y código.' };

  return {
    success: true,
    reserva: {
      codigo: reserva.codigo,
      fecha: reserva.fecha,
      hora: reserva.hora,
      personas: reserva.personas,
      nombre: reserva.nombre,
      mesaNumero: reserva.mesaNumero,
      estado: reserva.estado,
      notas: reserva.notas,
      alergias: reserva.alergias
    }
  };
}

// ============================================================
// ADMIN - DASHBOARD
// ============================================================
function getDashboard(token) {
  if (!verificarToken(token)) return { error: 'No autorizado' };

  const hoy = formatDate(new Date());
  const reservasHoy = getReservasPorFecha(hoy);
  const todasReservas = getAllReservas();

  const inicioSemana = getInicioSemana();
  const reservasSemana = todasReservas.filter(r => r.fecha >= inicioSemana && r.fecha <= hoy);

  const config = getConfigPublica();
  const mesas = getMesasActivas();
  const capacidadTotal = mesas.reduce((acc, m) => acc + parseInt(m.capacidad || 0), 0);

  const personasHoy = reservasHoy
    .filter(r => r.estado !== 'cancelada')
    .reduce((acc, r) => acc + parseInt(r.personas || 0), 0);

  return {
    hoy: {
      fecha: hoy,
      totalReservas: reservasHoy.filter(r => r.estado !== 'cancelada').length,
      pendientes: reservasHoy.filter(r => r.estado === 'pendiente').length,
      confirmadas: reservasHoy.filter(r => r.estado === 'confirmada').length,
      personas: personasHoy,
      ocupacion: capacidadTotal > 0 ? Math.round((personasHoy / capacidadTotal) * 100) : 0,
      reservas: reservasHoy.filter(r => r.estado !== 'cancelada').sort((a, b) => a.hora.localeCompare(b.hora))
    },
    semana: {
      totalReservas: reservasSemana.filter(r => r.estado !== 'cancelada').length,
      cancelaciones: reservasSemana.filter(r => r.estado === 'cancelada').length,
      personas: reservasSemana.filter(r => r.estado !== 'cancelada').reduce((acc, r) => acc + parseInt(r.personas || 0), 0)
    }
  };
}

// ============================================================
// ADMIN - RESERVAS
// ============================================================
function getReservasAdmin(token, params) {
  if (!verificarToken(token)) return { error: 'No autorizado' };

  let reservas = getAllReservas();

  if (params.fecha) reservas = reservas.filter(r => r.fecha === params.fecha);
  if (params.estado) reservas = reservas.filter(r => r.estado === params.estado);
  if (params.busqueda) {
    const b = params.busqueda.toLowerCase();
    reservas = reservas.filter(r =>
      r.nombre.toLowerCase().includes(b) ||
      r.email.toLowerCase().includes(b) ||
      r.codigo.toLowerCase().includes(b)
    );
  }
  if (params.desde) reservas = reservas.filter(r => r.fecha >= params.desde);
  if (params.hasta) reservas = reservas.filter(r => r.fecha <= params.hasta);

  reservas.sort((a, b) => {
    if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
    return a.hora.localeCompare(b.hora);
  });

  return { success: true, reservas };
}

function updateReserva(data) {
  if (!verificarToken(data.token)) return { error: 'No autorizado' };

  const { id, estado } = data;
  if (!id || !estado) return { error: 'ID y estado requeridos' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_RESERVAS);
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) {
      sheet.getRange(i + 1, 13).setValue(estado);
      if (estado === 'confirmada') {
        sheet.getRange(i + 1, 15).setValue(new Date().toISOString());
      }
      if (estado === 'cancelada') {
        sheet.getRange(i + 1, 16).setValue(new Date().toISOString());
        try {
          const reservaData = rowToReserva(rows[i], i);
          enviarEmailCancelacion({
            nombre: reservaData.nombre,
            email: reservaData.email,
            fecha: reservaData.fecha,
            hora: reservaData.hora,
            codigo: reservaData.codigo
          });
        } catch (e) {
          Logger.log('Error email: ' + e.message);
        }
      }
      return { success: true };
    }
  }

  return { error: 'Reserva no encontrada' };
}

function crearReservaAdmin(data) {
  if (!verificarToken(data.token)) return { error: 'No autorizado' };

  const { fecha, hora, personas, nombre, email, telefono, notas, alergias, mesaId } = data;

  if (!fecha || !hora || !personas || !nombre || !email) {
    return { error: 'Faltan campos obligatorios' };
  }

  let mesa;
  if (mesaId) {
    const mesas = getMesasActivas();
    mesa = mesas.find(m => m.id === mesaId);
    if (!mesa) return { error: 'Mesa no encontrada' };
  } else {
    mesa = asignarMesa(fecha, hora, parseInt(personas));
    if (!mesa) return { error: 'No hay mesas disponibles' };
  }

  const codigo = generarCodigo();
  const id = Utilities.getUuid();
  const ahora = new Date();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_RESERVAS);

  sheet.appendRow([
    id, codigo, fecha, hora, parseInt(personas),
    nombre, email, telefono || '', notas || '', alergias || '',
    mesa.id, mesa.numero, 'confirmada',
    ahora.toISOString(), ahora.toISOString(), '', 'no'
  ]);

  return { success: true, codigo, mesaNumero: mesa.numero };
}

// ============================================================
// ADMIN - MESAS
// ============================================================
function getMesas(token) {
  if (!verificarToken(token)) return { error: 'No autorizado' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_MESAS);
  if (!sheet) return { success: true, mesas: [] };

  const data = sheet.getDataRange().getValues();
  const mesas = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    mesas.push({
      id: row[0],
      numero: row[1],
      capacidad: row[2],
      descripcion: row[3],
      activa: row[4] === true || row[4] === 'true' || row[4] === 'TRUE'
    });
  }

  return { success: true, mesas };
}

function updateMesa(data) {
  if (!verificarToken(data.token)) return { error: 'No autorizado' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_MESAS);
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.id) {
      if (data.numero !== undefined) sheet.getRange(i + 1, 2).setValue(data.numero);
      if (data.capacidad !== undefined) sheet.getRange(i + 1, 3).setValue(data.capacidad);
      if (data.descripcion !== undefined) sheet.getRange(i + 1, 4).setValue(data.descripcion);
      if (data.activa !== undefined) sheet.getRange(i + 1, 5).setValue(data.activa);
      return { success: true };
    }
  }

  return { error: 'Mesa no encontrada' };
}

function crearMesa(data) {
  if (!verificarToken(data.token)) return { error: 'No autorizado' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_MESAS);

  if (!sheet) return { error: 'Hoja Mesas no encontrada' };

  const id = Utilities.getUuid();
  sheet.appendRow([id, data.numero, data.capacidad, data.descripcion || '', true]);

  return { success: true, id };
}

// ============================================================
// ADMIN - CONFIGURACIÓN
// ============================================================
function getConfigPublica() {
  const config = getConfigSheet();
  const data = config.getDataRange().getValues();
  const result = {};

  for (let i = 1; i < data.length; i++) {
    const key = data[i][0];
    const value = data[i][1];
    // No exponer datos sensibles
    if (key && key !== 'admin_password' && key !== 'admin_token' && key !== 'admin_token_expiry') {
      result[key] = value;
    }
  }

  return result;
}

function updateConfig(data) {
  if (!verificarToken(data.token)) return { error: 'No autorizado' };

  const config = getConfigSheet();
  const updates = data.config;

  for (const key in updates) {
    setConfigValue(config, key, updates[key]);
  }

  return { success: true };
}

// ============================================================
// ADMIN - FECHAS BLOQUEADAS
// ============================================================
function getBloqueados(token) {
  if (!verificarToken(token)) return { error: 'No autorizado' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_BLOQUEADOS);
  if (!sheet) return { success: true, bloqueados: [] };

  const data = sheet.getDataRange().getValues();
  const bloqueados = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    bloqueados.push({
      id: row[4] || String(i),
      fecha: formatDate(row[0]),
      tipo: row[1],
      hora: row[2] || '',
      motivo: row[3] || ''
    });
  }

  return { success: true, bloqueados };
}

function bloquearFecha(data) {
  if (!verificarToken(data.token)) return { error: 'No autorizado' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_BLOQUEADOS);
  if (!sheet) return { error: 'Hoja Bloqueados no encontrada' };

  const id = Utilities.getUuid();
  sheet.appendRow([data.fecha, data.tipo || 'dia', data.hora || '', data.motivo || '', id]);

  return { success: true, id };
}

function desbloquearFecha(data) {
  if (!verificarToken(data.token)) return { error: 'No autorizado' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_BLOQUEADOS);
  if (!sheet) return { error: 'Hoja no encontrada' };

  const rows = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (rows[i][4] === data.id) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }

  return { error: 'Bloqueo no encontrado' };
}

// ============================================================
// FUNCIONES INTERNAS
// ============================================================
function generarCodigo() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let codigo = '';
  for (let i = 0; i < 8; i++) {
    codigo += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return codigo;
}

function asignarMesa(fecha, hora, personas) {
  const mesas = getMesasActivas();
  const reservasDelDia = getReservasPorFecha(fecha);
  const mesasOcupadas = reservasDelDia
    .filter(r => r.hora === hora && r.estado !== 'cancelada')
    .map(r => r.mesaId);

  const mesasLibres = mesas
    .filter(m => !mesasOcupadas.includes(m.id) && parseInt(m.capacidad) >= personas)
    .sort((a, b) => parseInt(a.capacidad) - parseInt(b.capacidad));

  return mesasLibres.length > 0 ? mesasLibres[0] : null;
}

function getMesasActivas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_MESAS);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const mesas = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    const activa = row[4] === true || row[4] === 'true' || row[4] === 'TRUE';
    if (activa) {
      mesas.push({ id: row[0], numero: row[1], capacidad: row[2], descripcion: row[3] });
    }
  }

  return mesas;
}

function getReservasPorFecha(fecha) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_RESERVAS);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const reservas = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    if (formatDate(row[2]) === fecha) {
      reservas.push(rowToReserva(row, i));
    }
  }

  return reservas;
}

function getAllReservas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_RESERVAS);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const reservas = [];

  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    reservas.push(rowToReserva(data[i], i));
  }

  return reservas;
}

function rowToReserva(row, index) {
  return {
    id: row[0],
    codigo: row[1],
    fecha: formatDate(row[2]),
    hora: row[3],
    personas: row[4],
    nombre: row[5],
    email: row[6],
    telefono: row[7],
    notas: row[8],
    alergias: row[9],
    mesaId: row[10],
    mesaNumero: row[11],
    estado: row[12],
    fechaCreacion: row[13],
    fechaConfirmacion: row[14],
    fechaCancelacion: row[15],
    rowIndex: index
  };
}

function findReserva(email, codigo) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_RESERVAS);
  if (!sheet) return null;

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    if (row[6] === email && row[1] === codigo) {
      return rowToReserva(row, i);
    }
  }

  return null;
}

function updateReservaRow(rowIndex, estado, campoFecha, valorFecha) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_RESERVAS);
  sheet.getRange(rowIndex + 1, 13).setValue(estado);
  if (campoFecha === 'fecha_confirmacion') {
    sheet.getRange(rowIndex + 1, 15).setValue(valorFecha);
  } else if (campoFecha === 'fecha_cancelacion') {
    sheet.getRange(rowIndex + 1, 16).setValue(valorFecha);
  }
}

function getConfigSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_CONFIG);
}

function getConfigValue(sheet, key) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) return data[i][1];
  }
  return null;
}

function setConfigValue(sheet, key, value) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

function formatDate(date) {
  if (!date) return '';
  if (typeof date === 'string') return date.split('T')[0];
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getInicioSemana() {
  const hoy = new Date();
  const diaSemana = hoy.getDay();
  const inicio = new Date(hoy);
  inicio.setDate(hoy.getDate() - diaSemana);
  return formatDate(inicio);
}

// ============================================================
// EMAILS
// ============================================================
function enviarEmailConfirmacion(datos) {
  const { nombre, email, fecha, hora, personas, codigo, mesaNumero, notas, config } = datos;
  const nombreRestaurante = config.nombreRestaurante || 'El Restaurante';
  const direccion = config.direccion || '';
  const telefono = config.telefonoContacto || '';

  const fechaFormateada = formatearFechaLegible(fecha);

  const asunto = `✅ Reserva confirmada - ${nombreRestaurante} - ${fechaFormateada}`;

  const cuerpo = `
Estimado/a ${nombre},

Su reserva en ${nombreRestaurante} ha sido registrada exitosamente.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DETALLES DE SU RESERVA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Código de reserva: ${codigo}
Fecha: ${fechaFormateada}
Hora: ${hora}
Personas: ${personas}
Mesa: #${mesaNumero}
${notas ? 'Notas: ' + notas : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INFORMACIÓN DEL RESTAURANTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${nombreRestaurante}
${direccion}
${telefono}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
¿NECESITA CANCELAR?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Puede consultar o cancelar su reserva ingresando su email y código de reserva en nuestra página web.

Código para presentar: ${codigo}

Gracias por elegirnos. ¡Lo esperamos!

${nombreRestaurante}
  `.trim();

  MailApp.sendEmail({ to: email, subject: asunto, body: cuerpo });
}

function enviarEmailCancelacion(datos) {
  const { nombre, email, fecha, hora, codigo } = datos;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName(SHEET_CONFIG);
  const nombreRestaurante = getConfigValue(configSheet, 'nombreRestaurante') || 'El Restaurante';

  const fechaFormateada = formatearFechaLegible(fecha);

  const asunto = `❌ Reserva cancelada - ${nombreRestaurante}`;
  const cuerpo = `
Estimado/a ${nombre},

Su reserva ha sido cancelada.

Detalles de la reserva cancelada:
- Código: ${codigo}
- Fecha: ${fechaFormateada}
- Hora: ${hora}

Si desea hacer una nueva reserva, visítenos en nuestra página web.

${nombreRestaurante}
  `.trim();

  MailApp.sendEmail({ to: email, subject: asunto, body: cuerpo });
}

function formatearFechaLegible(fechaStr) {
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const d = new Date(fechaStr + 'T12:00:00');
  return `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

// ============================================================
// TRIGGER DE RECORDATORIO 24HS
// ============================================================
function setupTriggers() {
  // Eliminar triggers existentes
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'enviarRecordatorios') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Crear trigger diario a las 10:00
  ScriptApp.newTrigger('enviarRecordatorios')
    .timeBased()
    .everyDays(1)
    .atHour(10)
    .create();

  Logger.log('Trigger de recordatorios configurado correctamente');
}

function enviarRecordatorios() {
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  const fechaManana = formatDate(manana);

  const reservas = getReservasPorFecha(fechaManana);
  const configSheet = getConfigSheet();
  const nombreRestaurante = getConfigValue(configSheet, 'nombreRestaurante') || 'El Restaurante';
  const direccion = getConfigValue(configSheet, 'direccion') || '';

  reservas.forEach(r => {
    if (r.estado !== 'cancelada' && r.recordatorioEnviado !== 'si') {
      try {
        const asunto = `🔔 Recordatorio: Su reserva es mañana - ${nombreRestaurante}`;
        const cuerpo = `
Estimado/a ${r.nombre},

Le recordamos que tiene una reserva mañana.

Código: ${r.codigo}
Fecha: ${formatearFechaLegible(r.fecha)}
Hora: ${r.hora}
Personas: ${r.personas}

${direccion ? 'Dirección: ' + direccion : ''}

¡Lo esperamos!
${nombreRestaurante}
        `.trim();

        MailApp.sendEmail({ to: r.email, subject: asunto, body: cuerpo });

        // Marcar recordatorio enviado
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheet = ss.getSheetByName(SHEET_RESERVAS);
        sheet.getRange(r.rowIndex + 1, 17).setValue('si');
      } catch (e) {
        Logger.log('Error recordatorio: ' + e.message);
      }
    }
  });
}

// ============================================================
// INICIALIZACIÓN DEL SPREADSHEET
// ============================================================
function inicializarSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Hoja Reservas
  let reservas = ss.getSheetByName(SHEET_RESERVAS);
  if (!reservas) {
    reservas = ss.insertSheet(SHEET_RESERVAS);
    reservas.appendRow([
      'ID', 'Codigo', 'Fecha', 'Hora', 'Personas', 'Nombre', 'Email', 'Telefono',
      'Notas', 'Alergias', 'MesaID', 'MesaNumero', 'Estado',
      'FechaCreacion', 'FechaConfirmacion', 'FechaCancelacion', 'RecordatorioEnviado'
    ]);
    reservas.getRange(1, 1, 1, 17).setFontWeight('bold');
  }

  // Hoja Mesas
  let mesas = ss.getSheetByName(SHEET_MESAS);
  if (!mesas) {
    mesas = ss.insertSheet(SHEET_MESAS);
    mesas.appendRow(['ID', 'Numero', 'Capacidad', 'Descripcion', 'Activa']);
    mesas.getRange(1, 1, 1, 5).setFontWeight('bold');
    // Mesas de ejemplo
    mesas.appendRow([Utilities.getUuid(), 1, 2, 'Interior - Mesa para 2', true]);
    mesas.appendRow([Utilities.getUuid(), 2, 2, 'Interior - Mesa para 2', true]);
    mesas.appendRow([Utilities.getUuid(), 3, 4, 'Interior - Mesa para 4', true]);
    mesas.appendRow([Utilities.getUuid(), 4, 4, 'Ventana - Mesa para 4', true]);
    mesas.appendRow([Utilities.getUuid(), 5, 6, 'Terraza - Mesa para 6', true]);
    mesas.appendRow([Utilities.getUuid(), 6, 8, 'Sala privada - Mesa para 8', true]);
  }

  // Hoja Configuracion
  let config = ss.getSheetByName(SHEET_CONFIG);
  if (!config) {
    config = ss.insertSheet(SHEET_CONFIG);
    config.appendRow(['Clave', 'Valor', 'Descripcion']);
    config.getRange(1, 1, 1, 3).setFontWeight('bold');
    const configDefaults = [
      ['nombreRestaurante', 'Mi Restaurante', 'Nombre del restaurante'],
      ['direccion', 'Calle Principal 123, Ciudad', 'Dirección del restaurante'],
      ['telefonoContacto', '+598 99 000 000', 'Teléfono de contacto'],
      ['emailContacto', 'info@mirestaurante.com', 'Email de contacto'],
      ['horarios', '12:30,13:00,13:30,20:00,20:30,21:00,21:30', 'Horarios disponibles separados por coma'],
      ['diasCierre', 'lunes', 'Días de cierre semanales separados por coma'],
      ['minAnticipacionHoras', '2', 'Horas mínimas de anticipación para reservar'],
      ['maxDiasFuturos', '30', 'Días máximos en el futuro para reservar'],
      ['maxPersonasPorReserva', '10', 'Máximo de personas por reserva'],
      ['minHorasCancelar', '4', 'Horas mínimas de anticipación para cancelar'],
      ['admin_password', 'admin123', 'Password del administrador'],
      ['admin_token', '', 'Token de sesión admin (no modificar)'],
      ['admin_token_expiry', '', 'Expiración del token admin (no modificar)'],
    ];
    configDefaults.forEach(row => config.appendRow(row));
  }

  // Hoja Bloqueados
  let bloqueados = ss.getSheetByName(SHEET_BLOQUEADOS);
  if (!bloqueados) {
    bloqueados = ss.insertSheet(SHEET_BLOQUEADOS);
    bloqueados.appendRow(['Fecha', 'Tipo', 'Hora', 'Motivo', 'ID']);
    bloqueados.getRange(1, 1, 1, 5).setFontWeight('bold');
  }

  Logger.log('Spreadsheet inicializado correctamente');
  return 'OK';
}
