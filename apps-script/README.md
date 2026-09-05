# Apps Script para el Sistema EyC

Este directorio es el puente entre el sitio (estático, en `index.html` /
`eyc.html` / `subse.html` / `sga.html` + `css/`/`js/`) y una Google Sheet que
hace de base de datos completa: roster, mesa directiva, actividades,
evaluaciones, cortes **y las cuentas de acceso** (login por usuario y
contraseña, ya no hay selección libre de rol). **Nada de esto está
desplegado todavía** — es el punto de partida para cuando decidan
conectarlo.

## Qué hace el sitio hoy

`js/config.js` trae `CONFIG.APPS_SCRIPT_URL` y `CONFIG.TOKEN`, los dos
vacíos por defecto. Mientras estén vacíos, el sitio sigue funcionando
100% local (localStorage) como antes — pueden desplegar esto con calma, sin
romper nada, y activar recién cuando `Code.gs` ya esté desplegado y
probado.

En cuanto le pongan un valor a `APPS_SCRIPT_URL`:

- El login dejó de ser "elige tu rol" — ahora pide usuario y contraseña
  (`index.html`), valida contra la pestaña `Usuarios` de la Sheet, y esa
  fila ya dice a qué rol (y, si es EyC, a qué comisión) entra esa cuenta.
- `dataService.init()` carga TODO desde la Sheet (`action=getAll`) en vez
  de leer localStorage.
- Cada acción que antes solo tocaba localStorage (asignar mesa directiva,
  crear/editar actividades, guardar evaluaciones, registrar cortes,
  decidir continuidad, configurar fechas de corte) ahora además manda un
  `POST` a la Sheet. La UI no espera esa red — actualiza al instante y, si
  el `POST` falla, avisa con un toast de error (ver "Riesgos" abajo).
- localStorage se sigue llenando igual, como respaldo — si la red falla a
  mitad de un corte durante el evento, no se pierde lo que ya se escribió
  localmente.

## Cómo desplegar

`Code.gs` trae una función `setup()` que arma toda la Sheet sola — no hace
falta crear pestañas ni pegar datos a mano.

1. Crea una Google Sheet nueva (en blanco, el nombre no importa).
2. **Extensiones → Apps Script**. Se abre un editor ya conectado a esa
   Sheet — no hace falta buscar el ID a mano.
3. Borra el `Code.gs` de ejemplo que trae por defecto y pega el contenido
   completo del `Code.gs` de este directorio. Guarda (Ctrl/Cmd+S).
4. Arriba del editor hay un desplegable de funciones (dice algo como
   "doGet" por defecto) — selecciona **`setup`** y presiona **▶ Ejecutar**.
5. Primera vez: Google va a pedir autorización ("Se requiere autorización" →
   **Revisar permisos** → elige tu cuenta → **Avanzado** → **Ir a [nombre
   del proyecto] (no seguro)** → **Permitir**). Son permisos sobre TU
   propia Sheet, no de terceros — el aviso de "no seguro" es solo porque el
   script no está publicado/verificado por Google, no porque haga algo raro.
6. Cuando termina, aparece un cuadro con el resumen de lo que hizo (y si no
   aparece el cuadro, **Ver → Registros de ejecución** muestra lo mismo).
   `setup()`:
   - Crea las 7 pestañas (`Comisiones`, `Miembros`, `Talleres`,
     `Evaluaciones`, `Cortes`, `ConfigCortes`, `Usuarios`) con sus
     encabezados.
   - Siembra `Comisiones` con las 15 comisiones fijas (mismos datos que
     `js/constants.js`).
   - Siembra `ConfigCortes` con las 3 fases (`corte1`, `corte2`, `final`).
   - Siembra `Usuarios` con 17 cuentas de arranque, todas con contraseña
     `cambiame`: `sg` / `subse` (los roles globales) y una por comisión de
     EyC, con el usuario igual al id de su comisión (`ctd`, `pnud`, `cop`,
     etc.). **Cambien esa contraseña antes de repartir el acceso** — ver
     la advertencia de seguridad más abajo. Se puede editar/agregar/borrar
     filas de `Usuarios` directamente en la Sheet en cualquier momento.
   - Genera un `TOKEN` al azar (si no había uno todavía) y lo muestra en el
     resumen — cópialo, hace falta en el paso 9.
   - Es seguro volver a correrla después (por ejemplo si se agrega una
     pestaña nueva a mano sin querer y hay que recrearla): nunca borra ni
     duplica datos que ya existan, solo completa lo que falte.
7. **Implementar → Nueva implementación → tipo "Aplicación web"**.
   - Ejecutar como: **Yo** (tu cuenta).
   - Quién tiene acceso: **Cualquier usuario** (necesario para que el sitio
     estático, sin login de Google, pueda llamarlo — ver riesgo #4).
8. Copia la URL que te da (`https://script.google.com/macros/s/.../exec`).
9. En `js/config.js`, pega esa URL en `APPS_SCRIPT_URL` y el TOKEN del
   paso 6 en `TOKEN`. Guarda, sube el cambio, listo — el sitio ya
   lee/escribe todo en la Sheet.

## Riesgos a tener en cuenta

1. **CORS / preflight.** Un `POST` con `Content-Type: application/json`
   dispara un preflight `OPTIONS` que Apps Script Web Apps no responden
   (la llamada falla en el navegador, sin que el problema sea obvio desde
   la consola). Por eso `doPost` acá espera
   `Content-Type: text/plain;charset=utf-8` con el JSON como texto plano
   en el body — `js/data-service.js` ya lo hace así (`postToSheet_`).
2. **Latencia.** Cada llamada puede tardar de 1 a 5+ segundos (arranque en
   frío del script + lectura/escritura de la Sheet), peor si el script
   estuvo inactivo un rato. `dataService.init()` (carga inicial de toda la
   base) es lo único que la UI espera de verdad — el resto de las
   escrituras son optimistas (la UI no espera, solo avisa si falló).
3. **Sin transacciones reales.** `LockService.getScriptLock()` serializa
   las escrituras (evita que dos lleguen a la vez y se pisen), pero no es
   una transacción de base de datos — si el script se cae a mitad de
   `decidirCorte_` después de escribir el corte pero antes de escribir el
   miembro, quedan desincronizados. Aceptable a esta escala, pero no es
   una garantía real.
4. **La URL pública + token compartido NO es seguridad de verdad.** El
   token viaja en el JavaScript del cliente (`js/config.js`) — cualquiera
   que abra las herramientas de desarrollador del navegador lo puede ver.
   Sirve para frenar a alguien que encuentre la URL por casualidad, no
   para proteger datos sensibles de un atacante decidido.
5. **Las contraseñas de `Usuarios` se guardan en texto plano.** `login_()`
   las compara tal cual, sin hash. Mismo nivel de "seguridad" que el token
   — bien para gatear el acceso a esta herramienta interna durante el
   evento, mal para reutilizar contraseñas de otros lados. Pídanle a cada
   persona una contraseña que no use en ningún otro sitio.
6. **Los nombres y evaluaciones son datos reales de personas.** Tenerlo
   presente antes de decidir qué tan público dejar el despliegue y quién
   más tiene acceso de edición a la Sheet (cualquiera con acceso de editor
   a la Sheet puede leer/cambiar todo, sin pasar por el sitio ni por login).

## Esquema de las pestañas

`setup()` las crea solas (ver arriba) — esta tabla es solo referencia de
qué columna es cada cosa, por si hace falta mirar la Sheet a mano.

| Pestaña | Columnas (fila 1) |
|---|---|
| `Comisiones` | `id`, `nombre`, `sigla` |
| `Miembros` | `id`, `comisionId`, `rolKey`, `nombre`, `activo`, `desde`, `hasta`, `continuidad` |
| `Talleres` | `id`, `comisionId`, `nombre`, `tipo`, `fecha`, `oradores`, `cerrada` |
| `Evaluaciones` | `id`, `comisionId`, `tallerId`, `miembroId`, `rol`, `nombreMiembro`, `respuestas`, `comentarios`, `puntosDim`, `puntajeA`, `puntajeTotal`, `actualizado` |
| `Cortes` | `id`, `comisionId`, `miembroId`, `rolKey`, `corteKey`, `comentario`, `semaforoAlMomento`, `promedioAlMomento`, `requiereRevision`, `fecha`, `decisionEstado`, `decisionComentario`, `decisionFecha` |
| `ConfigCortes` | `key`, `inicio` — 3 filas fijas: `corte1`, `corte2`, `final` |
| `Usuarios` | `usuario`, `contrasena`, `rol`, `comisionId` — `comisionId` solo se usa cuando `rol` es `eyc` |

Notas de formato:

- `oradores` (Talleres), `respuestas`/`comentarios`/`puntosDim`
  (Evaluaciones) son objetos/arrays del lado del sitio — en la Sheet viven
  como texto JSON en la celda (`JSON.stringify`/`JSON.parse` de un lado y
  otro).
- `activo`, `cerrada`, `requiereRevision` son booleanos reales de Sheets
  (TRUE/FALSE), no texto.
- `decisionSga.{estado,comentario,fecha}` de `state.cortes` se guarda
  aplanado en las 3 columnas `decisionEstado`/`decisionComentario`/
  `decisionFecha` porque Sheets es tabular, no anida objetos.
