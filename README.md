# TableUy — Sistema de Reservas para Restaurantes

Sistema completo de reservas de mesa: frontend estático (GitHub Pages) + backend Google Apps Script + base de datos Google Sheets.

---

## Tabla de contenidos

1. [Arquitectura](#arquitectura)
2. [Crear el Google Sheet](#paso-1-crear-el-google-sheet)
3. [Configurar Google Apps Script](#paso-2-configurar-google-apps-script)
4. [Fork y configuración del repositorio](#paso-3-fork-del-repositorio)
5. [Poner la URL del Web App en el código](#paso-4-poner-la-url-en-el-código)
6. [Activar GitHub Pages](#paso-5-activar-github-pages)
7. [Configurar el restaurante](#paso-6-configurar-el-restaurante)
8. [Estructura de archivos](#estructura-de-archivos)
9. [Troubleshooting](#troubleshooting)

---

## Arquitectura

```
Cliente (browser)
      │
      │  HTTPS fetch()
      ▼
GitHub Pages (HTML + CSS + JS estático)
      │
      │  Llamadas a la API
      ▼
Google Apps Script (Web App pública)
      │
      │  SpreadsheetApp
      ▼
Google Sheets (base de datos)
```

- **Sin servidor propio**: todo corre en la infraestructura de Google y GitHub.
- **Sin build step**: los archivos HTML/CSS/JS se sirven tal cual.
- **Sin base de datos propia**: Google Sheets actúa como base de datos con 4 hojas.

---

## Paso 1: Crear el Google Sheet

### 1.1 Crear la hoja de cálculo

1. Ir a [sheets.google.com](https://sheets.google.com) e iniciar sesión con la cuenta de Google del restaurante.
2. Crear una nueva hoja en blanco.
3. Renombrarla, por ejemplo: **"TableUy - Reservas"**.

### 1.2 Crear las 4 hojas con la estructura exacta

El script inicializa las hojas automáticamente al ejecutar `inicializarSpreadsheet()`, pero también puedes crearlas manualmente.

#### Hoja "Reservas"
Columnas en la fila 1 (encabezados en negrita):

| A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ID | Codigo | Fecha | Hora | Personas | Nombre | Email | Telefono | Notas | Alergias | MesaID | MesaNumero | Estado | FechaCreacion | FechaConfirmacion | FechaCancelacion | RecordatorioEnviado |

#### Hoja "Mesas"
| A | B | C | D | E |
|---|---|---|---|---|
| ID | Numero | Capacidad | Descripcion | Activa |

Agregar algunas mesas de ejemplo:
```
[uuid]  1  2  Interior - Mesa para 2  TRUE
[uuid]  2  2  Interior - Mesa para 2  TRUE
[uuid]  3  4  Interior - Mesa para 4  TRUE
[uuid]  4  4  Ventana - Mesa para 4   TRUE
[uuid]  5  6  Terraza - Mesa para 6   TRUE
[uuid]  6  8  Sala privada            TRUE
```

#### Hoja "Configuracion"
| A (Clave) | B (Valor) | C (Descripcion) |
|---|---|---|
| nombreRestaurante | Mi Restaurante | Nombre del restaurante |
| direccion | Calle Principal 123 | Dirección |
| telefonoContacto | +598 99 000 000 | Teléfono |
| emailContacto | info@restaurante.com | Email |
| horarios | 12:30,13:00,13:30,20:00,20:30,21:00,21:30 | Horarios disponibles |
| diasCierre | lunes | Días de cierre |
| minAnticipacionHoras | 2 | Horas mínimas anticipación |
| maxDiasFuturos | 30 | Máximo días futuro |
| maxPersonasPorReserva | 10 | Máximo personas |
| minHorasCancelar | 4 | Horas mín. para cancelar |
| admin_password | **CambiaEsto123!** | Contraseña admin |
| admin_token | (vacío) | No tocar |
| admin_token_expiry | (vacío) | No tocar |

> ⚠️ **IMPORTANTE**: Cambia `admin_password` por una contraseña segura antes de desplegar.

#### Hoja "Bloqueados"
| A (Fecha) | B (Tipo) | C (Hora) | D (Motivo) | E (ID) |
|---|---|---|---|---|
| (vacío al inicio) | | | | |

---

## Paso 2: Configurar Google Apps Script

### 2.1 Crear el proyecto de Apps Script

**Opción A — Desde el Google Sheet (recomendado):**
1. En el Sheet, ir al menú: **Extensiones → Apps Script**
2. Se abrirá el editor de Apps Script vinculado al Spreadsheet
3. Borrar el contenido del archivo `Código.gs` que viene por defecto

**Opción B — Proyecto independiente:**
1. Ir a [script.google.com](https://script.google.com)
2. Crear nuevo proyecto
3. En el script, agregar al inicio: `const SPREADSHEET_ID = 'TU_ID_DEL_SHEET';`
4. Reemplazar `SpreadsheetApp.getActiveSpreadsheet()` por `SpreadsheetApp.openById(SPREADSHEET_ID)`

### 2.2 Pegar el código

1. Copiar todo el contenido de `google-apps-script/Code.gs`
2. Pegarlo en el editor de Apps Script (reemplazando el contenido existente)
3. Guardar con **Ctrl+S** (o el ícono de guardar)

### 2.3 Inicializar el Spreadsheet

1. En el editor, seleccionar la función `inicializarSpreadsheet` en el menú desplegable de funciones
2. Hacer click en **Ejecutar**
3. La primera vez pedirá permisos — Aceptar todos (necesita acceso al Sheet y a Gmail para enviar emails)
4. Verificar en el Sheet que se crearon las 4 hojas con los datos de ejemplo

### 2.4 Desplegar como Web App

1. En el editor de Apps Script, click en **Implementar → Nueva implementación**
2. En "Seleccionar tipo", elegir **Aplicación web**
3. Configurar:
   - **Descripción**: TableUy API v1
   - **Ejecutar como**: Yo (tu cuenta de Google)
   - **Quién tiene acceso**: Cualquier persona (Anyone)
4. Click en **Implementar**
5. **Copiar la URL** que aparece — se verá así:
   ```
   https://script.google.com/macros/s/AKfy...xyz/exec
   ```
   > Guarda esta URL, la necesitarás en el Paso 4.

### 2.5 Configurar el trigger de recordatorios

1. En el editor de Apps Script, seleccionar la función `setupTriggers`
2. Hacer click en **Ejecutar**
3. Verificar en **Activadores** (ícono de reloj en el sidebar) que se creó un trigger diario

---

## Paso 3: Fork del repositorio

1. Ir al repositorio en GitHub
2. Click en el botón **Fork** (arriba a la derecha)
3. Elegir tu cuenta como destino
4. El fork creará una copia completa en tu cuenta

---

## Paso 4: Poner la URL en el código

1. En tu fork, navegar al archivo `assets/js/api.js`
2. Buscar la línea:
   ```javascript
   const API_URL = 'TU_URL_DE_GOOGLE_APPS_SCRIPT_AQUI';
   ```
3. Reemplazar `TU_URL_DE_GOOGLE_APPS_SCRIPT_AQUI` por la URL copiada en el Paso 2.4:
   ```javascript
   const API_URL = 'https://script.google.com/macros/s/AKfy...xyz/exec';
   ```
4. Hacer commit del cambio (botón verde "Commit changes")

> **Nota sobre actualizaciones**: Cada vez que modifiques el `Code.gs`, debes crear una **nueva implementación** en Apps Script (no editar la existente) para que los cambios tomen efecto. La URL puede cambiar en cada nueva implementación — si cambia, actualiza `api.js`.

---

## Paso 5: Activar GitHub Pages

1. En tu repositorio en GitHub, ir a **Settings** (pestaña de configuración)
2. En el sidebar izquierdo, click en **Pages**
3. En "Source", seleccionar **GitHub Actions**
4. El workflow `deploy.yml` se ejecutará automáticamente con cada push a `main`
5. Después de unos minutos, tu sitio estará en:
   ```
   https://[tu-usuario].github.io/[nombre-repositorio]/
   ```

> **Alternativa manual**: En "Source" elegir "Deploy from a branch", seleccionar `main` y carpeta `/` (root). GitHub Pages servirá los archivos directamente.

---

## Paso 6: Configurar el restaurante

### Desde el Panel Admin

1. Ir a `https://tu-sitio.github.io/admin/`
2. Ingresar con la contraseña definida en el Sheet (`admin_password`)
3. Ir a **Configuración**:
   - **Restaurante**: nombre, dirección, teléfono, email
   - **Horarios**: franjas horarias, días de cierre, límites de reserva
   - **Mesas**: crear/editar/activar mesas
   - **Bloqueos**: bloquear fechas especiales
   - **Seguridad**: cambiar contraseña de administrador

### Configuración recomendada inicial

```
Horarios: 12:30,13:00,13:30,20:00,20:30,21:00,21:30
Días cierre: lunes
Anticipación mínima: 2 horas
Máximo días futuro: 30
Máximo personas: 10
Horas para cancelar: 4
```

---

## Estructura de archivos

```
/
├── index.html              → Landing page
├── reservar.html           → Wizard de reserva (4 pasos)
├── mis-reservas.html       → Consulta/cancelación para clientes
├── admin/
│   ├── index.html          → Dashboard + login admin
│   ├── reservas.html       → Tabla completa de reservas
│   ├── calendario.html     → Vista calendario
│   └── configuracion.html  → Configuración completa
├── assets/
│   ├── css/
│   │   ├── main.css        → Estilos globales
│   │   ├── reserva.css     → Wizard de reserva
│   │   └── admin.css       → Panel admin
│   └── js/
│       ├── api.js          → ⭐ Poner API_URL aquí
│       ├── reserva.js      → Lógica del wizard
│       ├── calendario.js   → Lógica del calendario
│       └── admin.js        → Lógica del panel admin
├── google-apps-script/
│   └── Code.gs             → Backend completo
├── .github/
│   └── workflows/
│       └── deploy.yml      → Deploy automático
└── README.md
```

---

## API Reference

Todos los endpoints usan la URL del Web App de Apps Script.

### GET Endpoints

| Parámetro `action` | Descripción | Parámetros adicionales |
|---|---|---|
| `getDisponibilidad` | Slots disponibles para una fecha | `fecha=YYYY-MM-DD` |
| `getReserva` | Buscar reserva de cliente | `email=X&codigo=X` |
| `getConfig` | Configuración pública | — |
| `adminLogin` | Autenticación admin | `password=X` |
| `getReservasAdmin` | Lista de reservas (admin) | `token=X` + filtros opcionales |
| `getDashboard` | Métricas del día (admin) | `token=X` |
| `getMesas` | Lista de mesas (admin) | `token=X` |
| `getBloqueados` | Fechas bloqueadas (admin) | `token=X` |

### POST Endpoints

Todos reciben un body JSON con `action` y los campos necesarios.

| `action` | Descripción |
|---|---|
| `crearReserva` | Nueva reserva de cliente |
| `cancelarReserva` | Cancelar reserva de cliente |
| `updateReserva` | Cambiar estado (admin) |
| `updateConfig` | Guardar configuración (admin) |
| `updateMesa` | Editar mesa (admin) |
| `crearMesa` | Nueva mesa (admin) |
| `bloquearFecha` | Bloquear fecha/franja (admin) |
| `desbloquearFecha` | Eliminar bloqueo (admin) |
| `crearReservaAdmin` | Reserva manual desde admin |

---

## Troubleshooting

### Error: "Failed to fetch" o "Network error"

**Causa**: CORS o la URL de la API es incorrecta.

**Solución**:
1. Verificar que la URL en `api.js` es exactamente la del Web App desplegado
2. Asegurarse de que el Web App tiene acceso "Anyone" (no "Anyone with Google account")
3. Si modificaste el script, crear una **nueva implementación** (no editar la existente)
4. Probar la URL directamente en el browser — debe devolver un JSON

### Error: "No autorizado" al hacer login

**Causa**: El password no coincide con el guardado en el Sheet.

**Solución**:
1. Abrir el Google Sheet → hoja "Configuracion"
2. Buscar la fila con clave `admin_password`
3. Verificar el valor exacto (distingue mayúsculas/minúsculas)
4. Desde el panel admin → Configuración → Seguridad, cambiar la contraseña

### Los emails de confirmación no llegan

**Causa**: MailApp requiere permisos o tiene cuota excedida.

**Solución**:
1. En Apps Script, ejecutar manualmente `inicializarSpreadsheet()` y aceptar permisos de Gmail
2. Verificar la carpeta de spam del cliente
3. Google Apps Script permite hasta 100 emails/día en cuentas gratuitas (500 en Workspace)

### Los slots de horario no aparecen

**Causa**: La hoja "Configuracion" no tiene el campo `horarios` o está vacío.

**Solución**:
1. En el Sheet → hoja "Configuracion"
2. Verificar que existe la fila `horarios` con valor como `12:30,13:00,20:00,20:30`
3. Sin espacios entre horarios, solo comas

### "Esta función no existe" en Apps Script

**Causa**: El código no se guardó correctamente.

**Solución**:
1. En el editor de Apps Script, verificar que el archivo tiene el código completo
2. Guardar con Ctrl+S
3. Crear una nueva implementación

### GitHub Pages muestra 404

**Causa**: GitHub Pages no está activado o el workflow no se ejecutó.

**Solución**:
1. Settings → Pages → verificar que el Source está configurado
2. Ir a la pestaña "Actions" del repositorio → verificar que el workflow se ejecutó sin errores
3. Esperar 2-5 minutos después del primer deploy

### Error "Quota exceeded" en Apps Script

**Causa**: Se superó el límite de ejecuciones de Apps Script (cuota gratuita).

**Límites relevantes**:
- Script runtime: 6 min/ejecución (30 min Workspace)
- Emails/día: 100 (500 Workspace)
- URL Fetch calls/día: 20,000
- Spreadsheet reads/day: sin límite práctico

**Solución**: Para restaurantes con alto volumen, considera Google Workspace.

---

## Seguridad

- La contraseña del admin **nunca** está en el código frontend — vive solo en Google Sheets
- El token de sesión admin expira en **4 horas**
- Los clientes solo pueden ver/cancelar sus propias reservas (validado por email + código)
- El código de reserva es alfanumérico de 8 caracteres, generado aleatoriamente
- El endpoint de admin requiere token válido en cada request

---

## Personalización

### Cambiar colores

Editar las variables CSS en `assets/css/main.css`:
```css
:root {
  --color-accent: #c9a96e;      /* Dorado — color principal */
  --color-bg: #0f0e0d;          /* Fondo oscuro */
  --color-text: #f0ebe3;        /* Texto claro */
}
```

### Cambiar tipografía

En `assets/css/main.css`, modificar el import de Google Fonts y las variables:
```css
@import url('https://fonts.googleapis.com/css2?family=TuFuenteSerif&family=TuFuenteSans&display=swap');

:root {
  --font-serif: 'TuFuenteSerif', Georgia, serif;
  --font-sans: 'TuFuenteSans', system-ui, sans-serif;
}
```

### Agregar logo

En `index.html`, reemplazar `.navbar-brand` con una imagen:
```html
<a href="index.html" class="navbar-brand">
  <img src="assets/img/logo.svg" alt="Mi Restaurante" height="36">
</a>
```

---

## Licencia

MIT — libre para uso personal y comercial.
