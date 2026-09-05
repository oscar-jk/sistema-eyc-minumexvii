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

1. Crea una Google Sheet nueva. Agrega estas 7 pestañas (el nombre debe
   ser EXACTO, Apps Script lo busca por nombre) con la fila 1 de cada una
   como encabezado:

   | Pestaña | Columnas (fila 1) |
   |---|---|
   | `Comisiones` | `id`, `nombre`, `sigla` |
   | `Miembros` | `id`, `comisionId`, `rolKey`, `nombre`, `activo`, `desde`, `hasta`, `continuidad` |
   | `Talleres` | `id`, `comisionId`, `nombre`, `tipo`, `fecha`, `oradores`, `cerrada` |
   | `Evaluaciones` | `id`, `comisionId`, `tallerId`, `miembroId`, `rol`, `nombreMiembro`, `respuestas`, `comentarios`, `puntosDim`, `puntajeA`, `puntajeTotal`, `actualizado` |
   | `Cortes` | `id`, `comisionId`, `miembroId`, `rolKey`, `corteKey`, `comentario`, `semaforoAlMomento`, `promedioAlMomento`, `requiereRevision`, `fecha`, `decisionEstado`, `decisionComentario`, `decisionFecha` |
   | `ConfigCortes` | `key`, `inicio` — 3 filas fijas: `corte1`, `corte2`, `final` (dejen `inicio` vacío, se llena desde el sitio) |
   | `Usuarios` | `usuario`, `contrasena`, `rol`, `comisionId` |

   Todas menos `Comisiones` y `Usuarios` pueden quedar con solo el
   encabezado — se llenan solas a medida que se usa el sitio.

2. En `Comisiones`, pega estas 15 filas debajo del encabezado (mismos datos
   que hoy están hardcodeados en `js/constants.js`, columna A=id, B=nombre,
   C=sigla):

   ```
   ctd	Comisión de Ciencia y Tecnología para el Desarrollo	CTD
   pnud	Programa de las Naciones Unidas para el Desarrollo	PNUD
   cop	Conferencia de las Partes	COP
   ams	Asamblea Mundial de la Salud	AMS
   csnu	Consejo de Seguridad de las Naciones Unidas	CSNU
   onudc	Oficina de las Naciones Unidas contra la Droga y el Delito	ONUDC
   cij	Corte Internacional de Justicia	CIJ
   foro-social-drdh	Foro Social del Consejo de Derechos Humanos	POR DEFINIR
   onudi	Organización de las Naciones Unidas para el Desarrollo Industrial	ONUDI
   unctad	Conferencia de las Naciones Unidas sobre Comercio y Desarrollo	UNCTAD
   omt	Organización Mundial del Turismo	OMT
   cime	Conferencia Iberoamericana de Ministros de Educación	CIME
   oma	Organización Mundial de Aduanas	OMA
   crpd	Comité sobre los Derechos de las Personas con Discapacidad	CRPD
   unesco-juventud-deporte	UNESCO sobre Juventud y Deporte	POR DEFINIR
   ```

   (Selecciona la celda A2 y pega — al ser texto separado por tabs, Sheets
   lo reparte solo en columnas A/B/C.)

3. En `Usuarios`, agrega al menos una cuenta por rol para poder entrar la
   primera vez — por ejemplo:

   ```
   sg1	cambiame	sg	
   subse1	cambiame	subse	
   ctd1	cambiame	eyc	ctd
   ```

   `comisionId` solo importa (y debe coincidir con un `id` de la pestaña
   `Comisiones`) cuando `rol` es `eyc`; para `subse`/`sg` déjenlo vacío.
   Cada persona con acceso EyC necesita su propia fila con el `comisionId`
   de SU comisión. Cambien `cambiame` por contraseñas reales antes de
   compartir el acceso — ver la advertencia de seguridad más abajo.

4. En la Sheet: **Extensiones → Apps Script**. Se abre un editor ya
   conectado a esa Sheet — no hace falta buscar el ID a mano.
5. Borra el `Code.gs` de ejemplo que trae por defecto y pega el contenido
   del `Code.gs` de este directorio.
6. Define el token compartido: en el editor de Apps Script, pega esto en
   cualquier parte del archivo, **ejecútalo una vez** (▶) con tu propio
   valor, y bórralo del archivo después:
   ```js
   function setToken(){ PropertiesService.getScriptProperties().setProperty('TOKEN', 'tu-valor-secreto-aca'); }
   ```
7. **Implementar → Nueva implementación → tipo "Aplicación web"**.
   - Ejecutar como: **Yo** (tu cuenta).
   - Quién tiene acceso: **Cualquier usuario** (necesario para que el sitio
     estático, sin login de Google, pueda llamarlo — ver riesgo #4).
8. Google va a pedir autorización la primera vez (permisos sobre la
   Sheet) — acéptalos, son tuyos, no de terceros.
9. Copia la URL que te da (`https://script.google.com/macros/s/.../exec`).
10. En `js/config.js`, pega esa URL en `APPS_SCRIPT_URL` y el mismo valor
    del paso 6 en `TOKEN`. Guarda, sube el cambio, listo — el sitio ya
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

Ver la tabla del paso 1 de arriba. Notas de formato:

- `oradores` (Talleres), `respuestas`/`comentarios`/`puntosDim`
  (Evaluaciones) son objetos/arrays del lado del sitio — en la Sheet viven
  como texto JSON en la celda (`JSON.stringify`/`JSON.parse` de un lado y
  otro).
- `activo`, `cerrada`, `requiereRevision` son booleanos reales de Sheets
  (TRUE/FALSE), no texto.
- `decisionSga.{estado,comentario,fecha}` de `state.cortes` se guarda
  aplanado en las 3 columnas `decisionEstado`/`decisionComentario`/
  `decisionFecha` porque Sheets es tabular, no anida objetos.
