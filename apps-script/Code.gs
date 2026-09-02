/**
 * Sistema EyC — puente entre el sitio estático y una Google Sheet.
 *
 * ESTADO DE ESTE ARCHIVO (léelo antes de tocar nada):
 *
 *   - `doGet` con `action=getComisiones` está LISTO PARA DESPLEGAR — es todo
 *     lo que la app necesita hoy (el roster de comisiones para el login).
 *     Léelo, pruébalo, listo.
 *
 *   - Todo lo demás (los 11 `doPost` de más abajo, uno por cada método de
 *     js/data-service.js) es REFERENCIA / FUTURO, no probado en un
 *     despliegue real. El día que el sitio necesite guardar mesa
 *     directiva / actividades / evaluaciones / cortes en la Sheet en vez
 *     de en localStorage, ese es el punto de partida — pero antes de
 *     activarlo de verdad, lee los riesgos en README.md (CORS, sin
 *     transacciones reales, la URL pública no es seguridad de verdad).
 *
 * No fue desplegado ni probado por Claude — no hay acceso a la cuenta de
 * Google del usuario. Cada función se escribió leyendo exactamente qué
 * hace su contraparte en js/data-service.js, para que el contrato
 * (nombres de campos, qué se actualiza) coincida.
 */

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

// Token compartido — NO lo pongas literal acá. Ejecuta una vez, a mano,
// desde el editor de Apps Script (Ejecutar > setToken), con tu propio
// valor, y bórralo de este archivo después:
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
    return errorResponse_('action desconocida: ' + action);
  }catch(err){
    return errorResponse_(err);
  }
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

function pushMiembro_(sh, comisionId, rolKey, nombre){
  var id = 'mb_' + Utilities.getUuid();
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
  return pushMiembro_(sh, body.comisionId, body.rolKey, body.nombre);
}

// body.cambios = [{ rolKey, nuevoNombre, miembroId }] — a diferencia de
// data-service.js (que recibe el objeto miembro completo), acá el cliente
// manda el id: la Sheet es la fuente de verdad, no conviene confiar en un
// objeto miembro que el cliente pudo haber cacheado desactualizado.
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
      pushMiembro_(sh, body.comisionId, c.rolKey, c.nuevoNombre);
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
