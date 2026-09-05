/**
 * Sistema EyC — puente entre el sitio estático y una Google Sheet.
 * Es la base de datos completa: roster, mesa directiva, actividades,
 * evaluaciones, cortes Y las cuentas de acceso (login por usuario/contraseña).
 *
 * PARA EMPEZAR: pega este archivo en una Sheet nueva (Extensiones > Apps
 * Script) y ejecuta `setup()` UNA VEZ (desplegable de funciones, arriba del
 * editor > selecciona "setup" > ▶). Crea las 7 pestañas con encabezados,
 * las siembra con las 15 comisiones y unas cuentas de arranque, y genera el
 * TOKEN — ver el paso a paso completo en README.md.
 *
 * ESTADO DE ESTE ARCHIVO (léelo antes de tocar nada):
 *
 *   - `setup()`, `doGet` con `action=getComisiones`/`action=getAll`, están
 *     listos para desplegar.
 *   - Los `doPost` (uno por cada método de js/data-service.js, más `login`
 *     para autenticación) están escritos y con el mismo contrato que su
 *     contraparte del lado del sitio, pero no probados en un despliegue
 *     real — antes de confiar en ellos con datos reales, lee los riesgos en
 *     README.md (CORS, sin transacciones reales, la URL pública + el token
 *     compartido no son seguridad de verdad, y las contraseñas de Usuarios
 *     se guardan en texto plano).
 *
 * No fue desplegado ni probado por Claude — no hay acceso a la cuenta de
 * Google del usuario. Cada función se escribió leyendo exactamente qué
 * hace su contraparte en js/data-service.js, para que el contrato
 * (nombres de campos, qué se actualiza) coincida.
 */

// ---------- setup — crea/ordena todo de un solo click ----------
//
// Seguro de volver a correr: revisa cada pestaña/fila antes de escribir,
// nunca borra ni duplica datos que ya existan. Así que también sirve para
// "reparar" una Sheet a la que le falte una pestaña o el TOKEN.
function setup(){
  var resumen = [];

  var comisionesSh = getOrCreateSheet_('Comisiones', ['id','nombre','sigla']);
  var comisionesNuevas = seedIfEmpty_(comisionesSh, COMISIONES_SEED_.map(function(c){ return [c.id, c.nombre, c.sigla]; }));
  resumen.push('Comisiones: ' + (comisionesNuevas ? COMISIONES_SEED_.length + ' filas cargadas.' : 'ya tenía datos, no se tocó.'));

  getOrCreateSheet_('Miembros', ['id','comisionId','rolKey','nombre','activo','desde','hasta','continuidad']);
  resumen.push('Miembros: pestaña lista (se llena sola desde el sitio).');

  getOrCreateSheet_('Talleres', ['id','comisionId','nombre','tipo','fecha','oradores','cerrada']);
  resumen.push('Talleres: pestaña lista (se llena sola desde el sitio).');

  getOrCreateSheet_('Evaluaciones', ['id','comisionId','tallerId','miembroId','rol','nombreMiembro','respuestas','comentarios','puntosDim','puntajeA','puntajeTotal','actualizado']);
  resumen.push('Evaluaciones: pestaña lista (se llena sola desde el sitio).');

  getOrCreateSheet_('Cortes', ['id','comisionId','miembroId','rolKey','corteKey','comentario','semaforoAlMomento','promedioAlMomento','requiereRevision','fecha','decisionEstado','decisionComentario','decisionFecha']);
  resumen.push('Cortes: pestaña lista (se llena sola desde el sitio).');

  var configSh = getOrCreateSheet_('ConfigCortes', ['key','inicio']);
  var configNuevo = seedIfEmpty_(configSh, [['corte1',''],['corte2',''],['final','']]);
  resumen.push('ConfigCortes: ' + (configNuevo ? '3 filas cargadas.' : 'ya tenía datos, no se tocó.'));

  // Una cuenta de arranque por rol global + una por cada comisión de EyC
  // (usuario = el id de la comisión, ej. "ctd") — así no hay que dar de
  // alta 15 cuentas de EyC a mano. Contraseña "cambiame" en todas: hay que
  // reemplazarla antes de repartir el acceso de verdad (ver README).
  var usuariosSh = getOrCreateSheet_('Usuarios', ['usuario','contrasena','rol','comisionId']);
  var usuariosSeed = [['sg','cambiame','sg',''],['subse','cambiame','subse','']].concat(
    COMISIONES_SEED_.map(function(c){ return [c.id, 'cambiame', 'eyc', c.id]; })
  );
  var usuariosNuevos = seedIfEmpty_(usuariosSh, usuariosSeed);
  resumen.push('Usuarios: ' + (usuariosNuevos
    ? (usuariosSeed.length + ' cuentas creadas, todas con contraseña "cambiame" — cámbialas antes de repartir el acceso.')
    : 'ya tenía datos, no se tocó.'));

  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TOKEN');
  if(!token){
    token = Utilities.getUuid();
    props.setProperty('TOKEN', token);
    resumen.push('TOKEN generado: ' + token + '  <-- cópialo en js/config.js (CONFIG.TOKEN).');
  }else{
    resumen.push('TOKEN: ya había uno guardado, no se tocó. (' + token + ')');
  }

  var mensaje = 'Setup del Sistema EyC\n\n' + resumen.join('\n');
  Logger.log(mensaje);
  try{ SpreadsheetApp.getUi().alert(mensaje); }catch(e){} // no siempre hay UI disponible (p.ej. corriendo desde un trigger) — no pasa nada si falla
  return mensaje;
}

function getOrCreateSheet_(name, headers){
  var sh = ss_().getSheetByName(name);
  if(!sh) sh = ss_().insertSheet(name);
  var fila1 = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  var yaTieneEncabezado = headers.every(function(h, i){ return fila1[i] === h; });
  if(!yaTieneEncabezado) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sh;
}

// Escribe `filas` a partir de la fila 2 SOLO si la pestaña no tiene ninguna
// fila de datos todavía (para no duplicar si se vuelve a correr setup()).
function seedIfEmpty_(sh, filas){
  if(sh.getLastRow() > 1) return false; // ya hay algo más que el encabezado
  sh.getRange(2, 1, filas.length, filas[0].length).setValues(filas);
  return true;
}

// Las mismas 15 comisiones que hoy están hardcodeadas en js/constants.js
// (FIXED_COMISIONES) — la única lista real, usada tanto para sembrar
// Comisiones como para las cuentas de arranque de Usuarios.
var COMISIONES_SEED_ = [
  { id:'ctd', nombre:'Comisión de Ciencia y Tecnología para el Desarrollo', sigla:'CTD' },
  { id:'pnud', nombre:'Programa de las Naciones Unidas para el Desarrollo', sigla:'PNUD' },
  { id:'cop', nombre:'Conferencia de las Partes', sigla:'COP' },
  { id:'ams', nombre:'Asamblea Mundial de la Salud', sigla:'AMS' },
  { id:'csnu', nombre:'Consejo de Seguridad de las Naciones Unidas', sigla:'CSNU' },
  { id:'onudc', nombre:'Oficina de las Naciones Unidas contra la Droga y el Delito', sigla:'ONUDC' },
  { id:'cij', nombre:'Corte Internacional de Justicia', sigla:'CIJ' },
  { id:'foro-social-drdh', nombre:'Foro Social del Consejo de Derechos Humanos', sigla:'POR DEFINIR' },
  { id:'onudi', nombre:'Organización de las Naciones Unidas para el Desarrollo Industrial', sigla:'ONUDI' },
  { id:'unctad', nombre:'Conferencia de las Naciones Unidas sobre Comercio y Desarrollo', sigla:'UNCTAD' },
  { id:'omt', nombre:'Organización Mundial del Turismo', sigla:'OMT' },
  { id:'cime', nombre:'Conferencia Iberoamericana de Ministros de Educación', sigla:'CIME' },
  { id:'oma', nombre:'Organización Mundial de Aduanas', sigla:'OMA' },
  { id:'crpd', nombre:'Comité sobre los Derechos de las Personas con Discapacidad', sigla:'CRPD' },
  { id:'unesco-juventud-deporte', nombre:'UNESCO sobre Juventud y Deporte', sigla:'POR DEFINIR' }
];

// ---------- Configuración ----------

// El id de esta Sheet (Archivo > Ver detalles del archivo, o simplemente
// SpreadsheetApp.getActiveSpreadsheet() si el script vive DENTRO de la
// Sheet vía Extensiones > Apps Script — recomendado, evita openById).
function ss_(){
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name){
  var sh = ss_().getSheetByName(name);
  if(!sh) throw new Error('Falta la pestaña "' + name + '" en la Sheet.');
  return sh;
}

// Token compartido — setup() ya genera uno al azar la primera vez que se
// corre (ver más abajo) y lo deja en Propiedades del script. Si preferís
// poner tu propio valor en vez del generado, corré esto una sola vez a
// mano (desplegable de funciones > pega esta función > ▶) y borrala después:
//   function setToken(){ PropertiesService.getScriptProperties().setProperty('TOKEN', 'tu-valor-secreto-aca'); }
function checkToken_(e){
  var expected = PropertiesService.getScriptProperties().getProperty('TOKEN');
  var got = (e.parameter && e.parameter.token) || '';
  if(!expected) throw new Error('No hay TOKEN configurado en Propiedades del script — ver setToken() en este archivo.');
  if(got !== expected) throw new Error('Token inválido.');
}

// Apps Script Web Apps no ofrecen "solo lectura garantizada" real: cualquiera
// con la URL puede llamar doGet. Para getComisiones (dato público, no
// sensible) no se exige token — para todo doPost sí, porque ahí se
// escriben datos.
function respond_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function errorResponse_(err){
  return respond_({ ok:false, error: String(err && err.message || err) });
}

// ---------- doGet — LISTO PARA DESPLEGAR ----------

function doGet(e){
  try{
    var action = e.parameter.action;
    if(action === 'getComisiones') return respond_({ ok:true, data: getComisiones_() });
    if(action === 'getAll') return respond_({ ok:true, data: getAll_() });
    return errorResponse_('action desconocida: ' + action);
  }catch(err){
    return errorResponse_(err);
  }
}

// ---------- getAll — toda la base en una sola llamada, para dataService.init() ----------
//
// Lee las 6 pestañas y las devuelve con la misma forma que espera el sitio
// (mismos nombres de campo que state.js), desaplanando lo que en la Sheet
// vive como texto: oradores/respuestas/comentarios/puntosDim (JSON string
// -> array/objeto), activo/cerrada/requiereRevision (TRUE/FALSE de Sheets
// -> boolean real), y decisionEstado/decisionComentario/decisionFecha
// (3 columnas planas -> el objeto decisionSga anidado que usa el sitio).
// com.roles queda vacío a propósito: el cliente ya sabe derivarlo de
// miembros (rederivarRoles() en state.js) y así no se calcula dos veces.

function sheetToObjects_(name){
  var sh = sheet_(name);
  var rows = sh.getDataRange().getValues();
  if(rows.length < 2) return [];
  var header = rows[0];
  var out = [];
  for(var i=1;i<rows.length;i++){
    var row = rows[i];
    var vacia = row.every(function(v){ return v === '' || v === null; });
    if(vacia) continue;
    var obj = {};
    for(var c=0;c<header.length;c++) obj[header[c]] = row[c];
    out.push(obj);
  }
  return out;
}

function bool_(v){ return v === true || v === 'TRUE' || v === 'true'; }
function str_(v){ return (v === '' || v === null || typeof v === 'undefined') ? '' : String(v); }
function parseJSON_(v, fallback){
  if(!v) return fallback;
  try{ return JSON.parse(v); }catch(e){ return fallback; }
}

function getAll_(){
  var miembros = sheetToObjects_('Miembros').map(function(m){
    return {
      id: str_(m.id), comisionId: str_(m.comisionId), rolKey: str_(m.rolKey), nombre: str_(m.nombre),
      activo: bool_(m.activo), desde: str_(m.desde), hasta: str_(m.hasta), continuidad: str_(m.continuidad)
    };
  });
  var talleres = sheetToObjects_('Talleres').map(function(t){
    return {
      id: str_(t.id), comisionId: str_(t.comisionId), nombre: str_(t.nombre), tipo: str_(t.tipo) || 'taller',
      fecha: str_(t.fecha), oradores: parseJSON_(t.oradores, []), cerrada: bool_(t.cerrada)
    };
  });
  var evaluaciones = sheetToObjects_('Evaluaciones').map(function(ev){
    return {
      id: str_(ev.id), comisionId: str_(ev.comisionId), tallerId: str_(ev.tallerId), miembroId: str_(ev.miembroId),
      rol: str_(ev.rol), nombreMiembro: str_(ev.nombreMiembro),
      respuestas: parseJSON_(ev.respuestas, {}), comentarios: parseJSON_(ev.comentarios, {}), puntosDim: parseJSON_(ev.puntosDim, {}),
      puntajeA: Number(ev.puntajeA) || 0, puntajeTotal: Number(ev.puntajeTotal) || 0, actualizado: str_(ev.actualizado)
    };
  });
  var cortes = sheetToObjects_('Cortes').map(function(c){
    return {
      id: str_(c.id), comisionId: str_(c.comisionId), miembroId: str_(c.miembroId), rolKey: str_(c.rolKey), corteKey: str_(c.corteKey),
      comentario: str_(c.comentario), semaforoAlMomento: str_(c.semaforoAlMomento),
      promedioAlMomento: c.promedioAlMomento === '' || c.promedioAlMomento === null ? null : Number(c.promedioAlMomento),
      requiereRevision: bool_(c.requiereRevision), fecha: str_(c.fecha),
      decisionSga: { estado: str_(c.decisionEstado) || 'pendiente', comentario: str_(c.decisionComentario), fecha: str_(c.decisionFecha) }
    };
  });
  var configCortes = {};
  sheetToObjects_('ConfigCortes').forEach(function(row){
    configCortes[str_(row.key)] = { inicio: str_(row.inicio) };
  });
  return {
    comisiones: getComisiones_(),
    miembros: miembros,
    talleres: talleres,
    evaluaciones: evaluaciones,
    cortes: cortes,
    configCortes: configCortes
  };
}

// Pestaña "Comisiones": columnas id | nombre | sigla (fila 1 = encabezados).
// rolesDemo NO va acá — es dato de prueba local, ver constants.js del sitio.
function getComisiones_(){
  var sh = sheet_('Comisiones');
  var rows = sh.getDataRange().getValues();
  var header = rows[0];
  var idxId = header.indexOf('id'), idxNombre = header.indexOf('nombre'), idxSigla = header.indexOf('sigla');
  var out = [];
  for(var i=1;i<rows.length;i++){
    if(!rows[i][idxId]) continue;
    out.push({ id: String(rows[i][idxId]), nombre: String(rows[i][idxNombre]), sigla: String(rows[i][idxSigla]) });
  }
  return out;
}

// ---------- doPost — REFERENCIA / FUTURO, no desplegado ----------
//
// Convención de request: POST con Content-Type: text/plain;charset=utf-8
// (NO application/json — dispara un preflight OPTIONS que Apps Script no
// responde, ver README) y body JSON: { action, token, ...datos }.
//
// Cada handler hace lo mismo que su función gemela en data-service.js,
// pero contra filas de Sheet en vez de contra `state` en memoria.

function doPost(e){
  var body;
  try{
    body = JSON.parse(e.postData.contents);
  }catch(err){
    return errorResponse_('Body inválido, se esperaba JSON: ' + err);
  }
  try{
    checkToken_({ parameter: { token: body.token } });
  }catch(err){
    return errorResponse_(err);
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000); // hasta 10s esperando el lock antes de fallar
  try{
    switch(body.action){
      case 'sustituirMiembro':  return respond_({ ok:true, data: sustituirMiembro_(body) });
      case 'guardarMesa':       return respond_({ ok:true, data: guardarMesa_(body) });
      case 'saveTaller':        return respond_({ ok:true, data: saveTaller_(body) });
      case 'crearTaller':       return respond_({ ok:true, data: crearTaller_(body) });
      case 'eliminarTaller':    return respond_({ ok:true, data: eliminarTaller_(body) });
      case 'setTallerCerrada':  return respond_({ ok:true, data: setTallerCerrada_(body) });
      case 'guardarEvaluacion': return respond_({ ok:true, data: guardarEvaluacion_(body) });
      case 'guardarCorte':      return respond_({ ok:true, data: guardarCorte_(body) });
      case 'decidirCorte':      return respond_({ ok:true, data: decidirCorte_(body) });
      case 'saveConfigCorte':   return respond_({ ok:true, data: saveConfigCorte_(body) });
      case 'login':             return respond_({ ok:true, data: login_(body) });
      default: return errorResponse_('action desconocida: ' + body.action);
    }
  }catch(err){
    return errorResponse_(err);
  }finally{
    lock.releaseLock();
  }
}

// ---- helpers genéricos de fila-por-id (misma idea para Miembros/Talleres/Cortes) ----

function findRowById_(sh, idColName, id){
  var rows = sh.getDataRange().getValues();
  var header = rows[0];
  var idx = header.indexOf(idColName);
  for(var i=1;i<rows.length;i++){
    if(String(rows[i][idx]) === String(id)) return { rowNum: i+1, header: header, values: rows[i] };
  }
  return null;
}

function rowObjectToValues_(header, obj){
  return header.map(function(col){ return obj.hasOwnProperty(col) ? obj[col] : ''; });
}

// ---- Miembros: id | comisionId | rolKey | nombre | activo | desde | hasta | continuidad ----

function miembroActivo_(comisionId, rolKey){
  var sh = sheet_('Miembros');
  var rows = sh.getDataRange().getValues();
  var h = rows[0];
  var iCom=h.indexOf('comisionId'), iRol=h.indexOf('rolKey'), iActivo=h.indexOf('activo');
  for(var i=1;i<rows.length;i++){
    if(rows[i][iCom]===comisionId && rows[i][iRol]===rolKey && rows[i][iActivo]===true) return { rowNum:i+1, header:h, values:rows[i] };
  }
  return null;
}

// id: el cliente ya lo generó (uid('mb') en data-service.js) y lo manda en
// el body — se usa tal cual en vez de generar uno nuevo acá, para que el
// registro que ya quedó en el `state` en memoria del cliente y la fila de
// la Sheet sean el mismo id. Solo se genera uno propio si por lo que sea
// no llegó (llamada directa a la API sin pasar por el cliente).
function pushMiembro_(sh, comisionId, rolKey, nombre, id){
  id = id || ('mb_' + Utilities.getUuid());
  var now = new Date().toISOString();
  sh.appendRow([id, comisionId, rolKey, nombre, true, now, '', '']);
  return { id: id, comisionId: comisionId, rolKey: rolKey, nombre: nombre, activo:true, desde: now, hasta:'', continuidad:'' };
}

function desactivarMiembro_(sh, rowNum, header){
  var iActivo = header.indexOf('activo'), iHasta = header.indexOf('hasta');
  sh.getRange(rowNum, iActivo+1).setValue(false);
  sh.getRange(rowNum, iHasta+1).setValue(new Date().toISOString());
}

function sustituirMiembro_(body){
  var sh = sheet_('Miembros');
  var actual = miembroActivo_(body.comisionId, body.rolKey);
  if(actual) desactivarMiembro_(sh, actual.rowNum, actual.header);
  return pushMiembro_(sh, body.comisionId, body.rolKey, body.nombre, body.id);
}

// body.cambios = [{ rolKey, nuevoNombre, miembroId, id }] — a diferencia de
// data-service.js (que recibe el objeto miembro completo), acá el cliente
// manda el id: la Sheet es la fuente de verdad, no conviene confiar en un
// objeto miembro que el cliente pudo haber cacheado desactualizado. `id` es
// el id ya asignado localmente cuando el cambio es un alta nueva (ver
// pushMiembro_) — sin miembroId todavía porque el cargo estaba vacante.
function guardarMesa_(body){
  var sh = sheet_('Miembros');
  body.cambios.forEach(function(c){
    if(c.miembroId){
      if(!c.nuevoNombre){
        var row = findRowById_(sh, 'id', c.miembroId);
        if(row) desactivarMiembro_(sh, row.rowNum, row.header);
      }else{
        var row2 = findRowById_(sh, 'id', c.miembroId);
        if(row2) sh.getRange(row2.rowNum, row2.header.indexOf('nombre')+1).setValue(c.nuevoNombre);
      }
    }else if(c.nuevoNombre){
      pushMiembro_(sh, body.comisionId, c.rolKey, c.nuevoNombre, c.id);
    }
  });
  return { ok:true };
}

// ---- Talleres: id | comisionId | nombre | tipo | fecha | oradores | cerrada ----
// oradores (array de miembroId) se guarda como JSON string en la celda.

function saveTaller_(body){
  var sh = sheet_('Talleres');
  var row = findRowById_(sh, 'id', body.tallerId);
  if(!row) throw new Error('Taller no encontrado: ' + body.tallerId);
  var h = row.header;
  sh.getRange(row.rowNum, h.indexOf('nombre')+1).setValue(body.campos.nombre);
  sh.getRange(row.rowNum, h.indexOf('tipo')+1).setValue(body.campos.tipo);
  sh.getRange(row.rowNum, h.indexOf('fecha')+1).setValue(body.campos.fecha);
  sh.getRange(row.rowNum, h.indexOf('oradores')+1).setValue(JSON.stringify(body.campos.oradores));
  return { id: body.tallerId };
}

function crearTaller_(body){
  var sh = sheet_('Talleres');
  var id = 'tal_' + Utilities.getUuid();
  sh.appendRow([id, body.comisionId, 'Nueva actividad', 'taller', '', '[]', false]);
  return { id: id, comisionId: body.comisionId, nombre:'Nueva actividad', tipo:'taller', fecha:'', oradores:[], cerrada:false };
}

// Único hard-delete de la app: borra la fila del taller Y todas las filas
// de Evaluaciones con ese tallerId (recorre de abajo hacia arriba para que
// borrar una fila no corra los índices de las siguientes).
function eliminarTaller_(body){
  var shT = sheet_('Talleres');
  var rowT = findRowById_(shT, 'id', body.tallerId);
  if(rowT) shT.deleteRow(rowT.rowNum);

  var shE = sheet_('Evaluaciones');
  var rows = shE.getDataRange().getValues();
  var h = rows[0];
  var iTaller = h.indexOf('tallerId');
  for(var i=rows.length-1;i>=1;i--){
    if(rows[i][iTaller] === body.tallerId) shE.deleteRow(i+1);
  }
  return { ok:true };
}

function setTallerCerrada_(body){
  var sh = sheet_('Talleres');
  var row = findRowById_(sh, 'id', body.tallerId);
  if(!row) throw new Error('Taller no encontrado: ' + body.tallerId);
  sh.getRange(row.rowNum, row.header.indexOf('cerrada')+1).setValue(body.cerrada);
  return { id: body.tallerId, cerrada: body.cerrada };
}

// ---- Evaluaciones: id | comisionId | tallerId | miembroId | rol | nombreMiembro
//                   | respuestas | comentarios | puntosDim | puntajeA | puntajeTotal | actualizado ----
// respuestas/comentarios/puntosDim son objetos -> JSON string en la celda.

function guardarEvaluacion_(body){
  var sh = sheet_('Evaluaciones');
  var rows = sh.getDataRange().getValues();
  var h = rows[0];
  var iCom=h.indexOf('comisionId'), iTaller=h.indexOf('tallerId'), iMiembro=h.indexOf('miembroId');
  var foundRow = -1;
  for(var i=1;i<rows.length;i++){
    if(rows[i][iCom]===body.comisionId && rows[i][iTaller]===body.tallerId && rows[i][iMiembro]===body.miembroId){ foundRow = i+1; break; }
  }
  var now = new Date().toISOString();
  var values = {
    comisionId: body.comisionId, tallerId: body.tallerId, miembroId: body.miembroId,
    rol: body.rol, nombreMiembro: body.nombreMiembro,
    respuestas: JSON.stringify(body.respuestas), comentarios: JSON.stringify(body.comentarios), puntosDim: JSON.stringify(body.puntosDim),
    puntajeA: body.puntajeA, puntajeTotal: body.puntajeTotal, actualizado: now
  };
  if(foundRow > 0){
    values.id = rows[foundRow-1][h.indexOf('id')];
    sh.getRange(foundRow, 1, 1, h.length).setValues([rowObjectToValues_(h, values)]);
  }else{
    values.id = 'ev_' + Utilities.getUuid();
    sh.appendRow(rowObjectToValues_(h, values));
  }
  return { id: values.id, puntajeTotal: body.puntajeTotal };
}

// ---- Cortes: id | comisionId | miembroId | rolKey | corteKey | comentario
//             | semaforoAlMomento | promedioAlMomento | requiereRevision | fecha
//             | decisionEstado | decisionComentario | decisionFecha ----
// decisionSga.{estado,comentario,fecha} llega aplanado en 3 columnas -- Sheets
// es tabular, no anida objetos.

function guardarCorte_(body){
  var sh = sheet_('Cortes');
  var rows = sh.getDataRange().getValues();
  var h = rows[0];
  var iMiembro=h.indexOf('miembroId'), iCorte=h.indexOf('corteKey');
  var foundRow = -1;
  for(var i=1;i<rows.length;i++){
    if(rows[i][iMiembro]===body.miembroId && rows[i][iCorte]===body.corteKey){ foundRow = i+1; break; }
  }
  var now = new Date().toISOString();
  var values = {
    comisionId: body.comisionId, miembroId: body.miembroId, rolKey: body.rolKey, corteKey: body.corteKey,
    comentario: body.comentario, semaforoAlMomento: body.semaforoAlMomento, promedioAlMomento: body.promedioAlMomento,
    requiereRevision: body.requiereRevision, fecha: now,
    // Guardar un corte SIEMPRE reinicia la decisión a pendiente — es un
    // checkpoint nuevo, cualquier decisión anterior del SG queda obsoleta.
    decisionEstado: 'pendiente', decisionComentario: '', decisionFecha: ''
  };
  var id;
  if(foundRow > 0){
    id = rows[foundRow-1][h.indexOf('id')];
    values.id = id;
    sh.getRange(foundRow, 1, 1, h.length).setValues([rowObjectToValues_(h, values)]);
  }else{
    id = 'corte_' + Utilities.getUuid();
    values.id = id;
    sh.appendRow(rowObjectToValues_(h, values));
  }
  return { id: id };
}

// Toca Cortes Y Miembros a la vez -- por eso está dentro del mismo
// withLock() que ya envuelve todo doPost, para que ambas escrituras
// queden juntas bajo un solo lock (no es una transacción real, pero es
// la mejor aproximación disponible en Apps Script -- ver riesgos en
// README.md).
function decidirCorte_(body){
  var shC = sheet_('Cortes');
  var rowC = findRowById_(shC, 'id', body.corteId);
  if(!rowC) throw new Error('Corte no encontrado: ' + body.corteId);
  var now = new Date().toISOString();
  var hC = rowC.header;
  sh_setCell_(shC, rowC.rowNum, hC, 'decisionEstado', body.estado);
  sh_setCell_(shC, rowC.rowNum, hC, 'decisionComentario', '');
  sh_setCell_(shC, rowC.rowNum, hC, 'decisionFecha', now);

  var miembroId = rowC.values[hC.indexOf('miembroId')];
  var shM = sheet_('Miembros');
  var rowM = findRowById_(shM, 'id', miembroId);
  if(rowM) sh_setCell_(shM, rowM.rowNum, rowM.header, 'continuidad', body.estado);

  return { corteId: body.corteId, estado: body.estado };
}

function sh_setCell_(sh, rowNum, header, colName, value){
  sh.getRange(rowNum, header.indexOf(colName)+1).setValue(value);
}

// ---- ConfigCortes: key | inicio (3 filas fijas: corte1, corte2, final) ----

function saveConfigCorte_(body){
  var sh = sheet_('ConfigCortes');
  var row = findRowById_(sh, 'key', body.corteKey);
  if(!row) throw new Error('Fase de corte no encontrada: ' + body.corteKey);
  sh.getRange(row.rowNum, row.header.indexOf('inicio')+1).setValue(body.inicio);
  return { key: body.corteKey, inicio: body.inicio };
}

// ---- Usuarios: usuario | contrasena | rol | comisionId ----
// Cuenta individual por persona (no una clave compartida por rol). `rol` es
// 'eyc' | 'subse' | 'sg'; comisionId solo importa para 'eyc' (a qué
// comisión entra esa cuenta) y se ignora para subse/sg.
//
// ADVERTENCIA: la contraseña se guarda y compara en texto plano — es el
// mismo nivel de "seguridad" que ya tiene el TOKEN compartido (ver riesgo
// #4 en README.md), no algo apto para contraseñas que la gente reutilice
// en otros lados. Bien para gatear el acceso a esta herramienta interna
// durante el evento; no para datos que de verdad necesiten protegerse.
function login_(body){
  var sh = sheet_('Usuarios');
  var rows = sh.getDataRange().getValues();
  var h = rows[0];
  var iUser = h.indexOf('usuario'), iPass = h.indexOf('contrasena'), iRol = h.indexOf('rol'), iCom = h.indexOf('comisionId');
  for(var i=1;i<rows.length;i++){
    if(String(rows[i][iUser]) === String(body.usuario) && String(rows[i][iPass]) === String(body.contrasena)){
      var rol = String(rows[i][iRol]);
      return { rol: rol, comisionId: rol === 'eyc' ? String(rows[i][iCom] || '') : null };
    }
  }
  throw new Error('Usuario o contraseña incorrectos.');
}
