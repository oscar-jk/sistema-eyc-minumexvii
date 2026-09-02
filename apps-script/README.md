# Apps Script para el Sistema EyC

Este directorio tiene el puente entre el sitio (estático, en `index.html` /
`rubrica-eyc.html` + `css/`/`js/`) y una Google Sheet que hace de base de
datos. **Nada de esto está desplegado todavía** — es el punto de partida
para cuando decidan conectarlo.

## Qué funciona hoy vs. qué es referencia

| Parte | Estado |
|---|---|
| `doGet` con `action=getComisiones` | **Listo para desplegar.** Es todo lo que el sitio necesita hoy: el roster de comisiones para el login (id/nombre/sigla), en vez de estar hardcodeado en `js/constants.js`. |
| Los 11 `doPost` (mesa directiva, actividades, evaluaciones, cortes...) | **Referencia, no probada.** Corresponden uno a uno con los métodos de `js/data-service.js` (mismo nombre de `action`, mismos campos). El día que haga falta guardar esos datos en la Sheet en vez de en `localStorage`, este es el punto de partida — pero lean los riesgos más abajo antes de activarlo de verdad. |

El propio `js/data-service.js` del sitio **no llama a esta URL todavía** —
sigue leyendo/escribiendo `localStorage` exactamente como antes. Conectar el
roster (el paso 1 de abajo) es el único cambio pendiente del lado del
sitio; todo lo demás requiere además decidir cuándo el sitio empieza a usar
los `doPost`, algo que no se hizo en esta pasada.

## Cómo desplegar solo el roster (lo que sí está listo)

1. Crea una Google Sheet nueva (o usa una existente). Agrega una pestaña
   llamada exactamente `Comisiones`, con esta fila de encabezados en la
   fila 1: `id | nombre | sigla`. Una fila por comisión — copia los 15
   `id`/`nombre`/`sigla` que hoy están en `FIXED_COMISIONES` dentro de
   `js/constants.js` (los `rolesDemo` NO van acá, son solo datos de prueba
   local).
2. En la Sheet: **Extensiones → Apps Script**. Se abre un editor ya
   conectado a esa Sheet — no hace falta buscar el ID a mano.
3. Borra el `Code.gs` de ejemplo que trae por defecto y pega el contenido
   de este `Code.gs`.
4. **Implementar → Nueva implementación → tipo "Aplicación web"**.
   - Ejecutar como: **Yo** (tu cuenta).
   - Quién tiene acceso: **Cualquier usuario** (necesario para que el sitio
     estático, sin login de Google, pueda llamarlo — ver riesgo #4).
5. Google va a pedir autorización la primera vez (permisos sobre la
   Sheet) — acéptalos, son tuyos, no de terceros.
6. Copia la URL que te da (`https://script.google.com/macros/s/.../exec`).
7. Del lado del sitio: hoy no hay ningún archivo de config esperando esa
   URL — hay que agregar uno (por ejemplo `js/config.js`, cargado antes de
   `js/data-service.js`) con la URL, y cambiar `dataService.init()` en
   `js/data-service.js` para hacer `fetch(CONFIG.APPS_SCRIPT_URL + '?action=getComisiones')`
   en vez de `Promise.resolve(state)`. Ese cambio no se hizo en esta
   pasada — es el siguiente paso real cuando decidan activarlo.
8. Actualiza también el texto del footer (`Los datos se guardan solo en
   este navegador... No se envían a ningún servidor`) — deja de ser cierto
   en cuanto el roster se lea de la Sheet, aunque sea de solo lectura.

## Riesgos a tener en cuenta (antes de activar los `doPost`)

1. **CORS / preflight.** Un `POST` con `Content-Type: application/json`
   dispara un preflight `OPTIONS` que Apps Script Web Apps no responden
   (la llamada falla en el navegador, sin que el problema sea obvio desde
   la consola). Por eso `doPost` acá espera
   `Content-Type: text/plain;charset=utf-8` con el JSON como texto plano
   en el body — hagan lo mismo del lado del `fetch()`:
   ```js
   fetch(url, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify({...}) })
   ```
2. **Latencia.** Cada llamada puede tardar de 1 a 5+ segundos (arranque en
   frío del script + lectura/escritura de la Sheet), peor si el script
   estuvo inactivo un rato. A esta escala de datos (15 comisiones, ~60
   personas, unos cientos de filas) no es un problema de rendimiento real,
   pero sí de percepción durante un evento en vivo — cualquier escritura
   futura necesita un indicador de "guardando..." y un aviso de error, el
   mismo patrón que `saveState()` ya usa hoy para errores de cuota local.
3. **Sin transacciones reales.** `LockService.getScriptLock()` serializa
   las escrituras (evita que dos lleguen a la vez y se pisen), pero no es
   una transacción de base de datos — si el script se cae a mitad de
   `decidirCorte_` después de escribir el corte pero antes de escribir el
   miembro, quedan desincronizados. Aceptable a esta escala, pero no es
   una garantía real.
4. **La URL pública + token compartido NO es seguridad de verdad.** El
   token viaja en el JavaScript del cliente — cualquiera que abra las
   herramientas de desarrollador del navegador lo puede ver. Sirve para
   frenar a alguien que encuentre la URL por casualidad, no para proteger
   datos sensibles de un atacante decidido. Los nombres y evaluaciones de
   los voluntarios son datos reales de personas — tenerlo presente antes
   de decidir qué tan público dejar el despliegue.
5. **Idea para más adelante (no implementada):** que la versión "remota"
   de `data-service.js` siga escribiendo a `localStorage` como respaldo
   local además de mandar al Apps Script, para no perder una evaluación
   si el wifi falla a mitad de un corte durante el evento.

## Esquema de las pestañas (para cuando se activen los `doPost`)

| Pestaña | Columnas (fila 1 = encabezados) |
|---|---|
| `Comisiones` | `id`, `nombre`, `sigla` |
| `Miembros` | `id`, `comisionId`, `rolKey`, `nombre`, `activo`, `desde`, `hasta`, `continuidad` |
| `Talleres` | `id`, `comisionId`, `nombre`, `tipo`, `fecha`, `oradores` (JSON string), `cerrada` |
| `Evaluaciones` | `id`, `comisionId`, `tallerId`, `miembroId`, `rol`, `nombreMiembro`, `respuestas` (JSON), `comentarios` (JSON), `puntosDim` (JSON), `puntajeA`, `puntajeTotal`, `actualizado` |
| `Cortes` | `id`, `comisionId`, `miembroId`, `rolKey`, `corteKey`, `comentario`, `semaforoAlMomento`, `promedioAlMomento`, `requiereRevision`, `fecha`, `decisionEstado`, `decisionComentario`, `decisionFecha` |
| `ConfigCortes` | `key`, `inicio` — 3 filas fijas: `corte1`, `corte2`, `final` |

`decisionSga.{estado,comentario,fecha}` de `state.cortes` en el sitio se
guarda aplanado en 3 columnas (`decisionEstado`/`decisionComentario`/
`decisionFecha`) porque Sheets es tabular, no anida objetos.
