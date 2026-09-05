'use strict';

/* ---------- Capa de acceso a datos ----------
   Fachada entre el resto de la app y la persistencia real. Dos modos, según
   si CONFIG.APPS_SCRIPT_URL (js/config.js) tiene valor:

   - LOCAL (por defecto, URL vacía): todo vive en localStorage vía state.js,
     igual que siempre. Así el sitio sigue funcionando mientras la Sheet
     todavía no está desplegada.
   - REMOTO (URL configurada): la Google Sheet es la fuente de verdad. Cada
     mutador actualiza `state` en memoria de inmediato (la UI no espera a la
     red) y ADEMÁS dispara el POST correspondiente al Apps Script en
     segundo plano — si ese POST falla, se avisa con un toast de error en
     vez de fallar en silencio, pero no se revierte el cambio local (ver
     riesgo de "sin transacciones reales" en apps-script/README.md).
     localStorage se seguiría llenando iabajo como respaldo (ver saveState
     en state.js) para no perder nada si falla la red a mitad de un evento.

   Los "getters" (state.talleres.filter(...), miembroActivo(...), etc.) NO
   pasan por acá — siguen leyendo `state` directo y síncrono, como siempre.
   Solo init() y los métodos mutadores de abajo hablan con el backend. */
var dataService = (function(){

  function isRemote_(){
    return typeof CONFIG !== 'undefined' && !!CONFIG.APPS_SCRIPT_URL;
  }

  // Copia superficial de `extra` sobre `base` — el equivalente ES5 de
  // Object.assign, para mantener el mismo estilo (var/function) del resto
  // del archivo.
  function extend_(base, extra){
    for(var k in extra){ if(extra.hasOwnProperty(k)) base[k] = extra[k]; }
    return base;
  }

  // POST con Content-Type text/plain (no application/json: dispara un
  // preflight OPTIONS que Apps Script Web Apps no responden, ver README) y
  // el token compartido de CONFIG en el body — mismo contrato que
  // checkToken_()/doPost() del lado del Apps Script.
  function postToSheet_(action, payload){
    var body = extend_({ action: action, token: CONFIG.TOKEN }, payload || {});
    return fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    }).then(function(r){ return r.json(); }).then(function(json){
      if(!json || !json.ok) throw new Error((json && json.error) || 'Error desconocido del backend');
      return json.data;
    });
  }

  // Dispara un POST "en segundo plano": la UI ya se actualizó de forma
  // optimista con el cambio local, esto solo confirma que también llegó a
  // la Sheet. Un fallo se avisa con un toast, no bloquea ni revierte nada.
  function fireAndWarn_(action, payload){
    if(!isRemote_()) return;
    postToSheet_(action, payload).catch(function(err){
      toast('No se pudo guardar "' + action + '" en la base de datos: ' + err.message, 'error');
    });
  }

  // Reconstruye com.roles para todas las comisiones a partir de
  // state.miembros — misma lógica que rederivarRoles() en state.js, pero
  // sobre un `comisiones`/`miembros` que todavía no son el `state` global
  // (init() los arma ANTES de asignarlos a `state`).
  function derivarRoles_(comisiones, miembros){
    comisiones.forEach(function(com){
      var roles = {};
      ROLES.forEach(function(r){
        var activo = miembros.find(function(m){ return m.comisionId === com.id && m.rolKey === r.key && m.activo; });
        roles[r.key] = activo ? activo.nombre : '';
      });
      com.roles = roles;
    });
    return comisiones;
  }

  // Punto de entrada de arranque. En modo local, `state` (armado de forma
  // síncrona por loadState() en state.js, antes de que esto corra) ya es
  // correcto tal cual. En modo remoto, se pisa con lo que devuelva la
  // Sheet — si el fetch falla (red caída, URL mal puesta, Sheet sin la
  // pestaña esperada...), se avisa y se sigue con el `state` local como
  // respaldo en vez de dejar la app en blanco.
  function init(){
    if(!isRemote_()) return Promise.resolve(state);
    return fetch(CONFIG.APPS_SCRIPT_URL + '?action=getAll')
      .then(function(r){ return r.json(); })
      .then(function(json){
        if(!json || !json.ok) throw new Error((json && json.error) || 'Error desconocido del backend');
        var data = json.data;
        return { comisiones: derivarRoles_(data.comisiones, data.miembros), miembros: data.miembros, talleres: data.talleres, evaluaciones: data.evaluaciones, cortes: data.cortes, configCortes: data.configCortes };
      })
      .catch(function(err){
        toast('No se pudo conectar con la base de datos (' + err.message + ') — usando los datos guardados en este navegador.', 'error');
        return state;
      });
  }

  // Autenticación por usuario/contraseña contra la pestaña Usuarios de la
  // Sheet — ver apps-script/Code.gs (login_). No tiene modo local: sin
  // Sheet desplegada no hay contra qué validar cuentas.
  function login(usuario, contrasena){
    if(!isRemote_()) return Promise.reject(new Error('El backend todavía no está configurado (falta CONFIG.APPS_SCRIPT_URL en js/config.js).'));
    return postToSheet_('login', { usuario: usuario, contrasena: contrasena });
  }

  // Sustituye al miembro activo de un cargo (Subsecretario). El anterior
  // queda inactivo con su historial intacto; el nuevo arranca sin evaluaciones.
  function sustituirMiembro(comisionId, rolKey, nombre){
    var actual = miembroActivo(comisionId, rolKey);
    if(actual){ actual.activo = false; actual.hasta = new Date().toISOString(); }
    var nuevo = {
      id: uid('mb'), comisionId: comisionId, rolKey: rolKey,
      nombre: nombre, activo:true, desde:new Date().toISOString(), hasta:'', continuidad:''
    };
    state.miembros.push(nuevo);
    rederivarRoles();
    saveState();
    fireAndWarn_('sustituirMiembro', { id: nuevo.id, comisionId: comisionId, rolKey: rolKey, nombre: nombre });
    return Promise.resolve();
  }

  // Aplica hasta 4 cambios de mesa directiva a la vez (uno por cargo):
  // renombrar, vaciar (da de baja al miembro actual) o asignar por primera
  // vez. `cambios` = [{ rolKey, nuevoNombre, miembro }], donde `miembro` es
  // el miembro activo actual de ese cargo (o null si estaba vacante).
  function guardarMesa(comisionId, cambios){
    var cambiosRemotos = [];
    cambios.forEach(function(c){
      if(c.miembro){
        if(!c.nuevoNombre){
          c.miembro.activo = false;
          c.miembro.hasta = new Date().toISOString();
        }else{
          c.miembro.nombre = c.nuevoNombre;
        }
        cambiosRemotos.push({ rolKey: c.rolKey, nuevoNombre: c.nuevoNombre, miembroId: c.miembro.id });
      }else if(c.nuevoNombre){
        var id = uid('mb');
        state.miembros.push({
          id: id, comisionId: comisionId, rolKey: c.rolKey, nombre: c.nuevoNombre,
          activo:true, desde:new Date().toISOString(), hasta:'', continuidad:''
        });
        cambiosRemotos.push({ rolKey: c.rolKey, nuevoNombre: c.nuevoNombre, id: id });
      }
    });
    rederivarRoles();
    saveState();
    fireAndWarn_('guardarMesa', { comisionId: comisionId, cambios: cambiosRemotos });
    return Promise.resolve();
  }

  // Upsert de nombre/tipo/fecha/oradores de una actividad ya existente.
  function saveTaller(tallerId, campos){
    var t = state.talleres.find(function(x){ return x.id === tallerId; });
    if(!t) return Promise.resolve(null);
    t.nombre = campos.nombre;
    t.tipo = campos.tipo;
    t.fecha = campos.fecha;
    t.oradores = campos.oradores;
    saveState();
    fireAndWarn_('saveTaller', { tallerId: tallerId, campos: campos });
    return Promise.resolve(t);
  }

  // Inserta una actividad en blanco para la comisión dada.
  function crearTaller(comisionId){
    var t = { id: uid('tal'), comisionId: comisionId, nombre:'Nueva actividad', fecha:'', oradores:[], tipo:'taller', cerrada:false };
    state.talleres.push(t);
    saveState();
    fireAndWarn_('crearTaller', { id: t.id, comisionId: comisionId });
    return Promise.resolve(t);
  }

  // Único hard-delete de toda la app: borra la actividad Y sus evaluaciones
  // (no tendría sentido dejar evaluaciones huérfanas de una actividad que
  // ya no existe).
  function eliminarTaller(tallerId){
    state.talleres = state.talleres.filter(function(x){ return x.id !== tallerId; });
    state.evaluaciones = state.evaluaciones.filter(function(ev){ return ev.tallerId !== tallerId; });
    saveState();
    fireAndWarn_('eliminarTaller', { tallerId: tallerId });
    return Promise.resolve();
  }

  // Alterna si una actividad admite más evaluaciones ("cerrada").
  function setTallerCerrada(tallerId, cerrada){
    var t = state.talleres.find(function(x){ return x.id === tallerId; });
    if(!t) return Promise.resolve(null);
    t.cerrada = cerrada;
    saveState();
    fireAndWarn_('setTallerCerrada', { tallerId: tallerId, cerrada: cerrada });
    return Promise.resolve(t);
  }

  // Upsert de una evaluación de rúbrica, identificada por (comisionId,
  // tallerId, miembroId) — a lo sumo una evaluación por esa combinación.
  function guardarEvaluacion(data){
    var existing = state.evaluaciones.find(function(e){
      return e.comisionId === data.comisionId && e.tallerId === data.tallerId && e.miembroId === data.miembroId;
    });
    if(existing){
      existing.respuestas = data.respuestas;
      existing.comentarios = data.comentarios;
      existing.puntosDim = data.puntosDim;
      existing.puntajeA = data.puntajeA;
      existing.puntajeTotal = data.puntajeTotal;
      existing.rol = data.rol;
      existing.nombreMiembro = data.nombreMiembro;
      existing.actualizado = new Date().toISOString();
    }else{
      existing = {
        id: uid('ev'), comisionId: data.comisionId, tallerId: data.tallerId, miembroId: data.miembroId,
        rol: data.rol, nombreMiembro: data.nombreMiembro,
        respuestas: data.respuestas, comentarios: data.comentarios, puntosDim: data.puntosDim,
        puntajeA: data.puntajeA, puntajeTotal: data.puntajeTotal,
        actualizado: new Date().toISOString()
      };
      state.evaluaciones.push(existing);
    }
    saveState();
    fireAndWarn_('guardarEvaluacion', extend_({ id: existing.id }, data));
    return Promise.resolve(existing);
  }

  // Upsert de un corte de seguimiento, identificado por (miembroId,
  // corteKey) — a lo sumo un corte por esa combinación. Guardar un corte
  // SIEMPRE reinicia decisionSga a "pendiente": es un checkpoint nuevo,
  // cualquier decisión anterior del SG queda obsoleta.
  function guardarCorte(data){
    var existing = state.cortes.find(function(c){ return c.miembroId === data.miembroId && c.corteKey === data.corteKey; });
    var ahora = new Date().toISOString();
    if(existing){
      existing.comentario = data.comentario;
      existing.semaforoAlMomento = data.semaforoAlMomento;
      existing.promedioAlMomento = data.promedioAlMomento;
      existing.requiereRevision = data.requiereRevision;
      existing.fecha = ahora;
      existing.decisionSga = { estado:'pendiente', comentario:'', fecha:'' };
    }else{
      existing = {
        id: uid('corte'), comisionId: data.comisionId, miembroId: data.miembroId, rolKey: data.rolKey, corteKey: data.corteKey,
        comentario: data.comentario,
        semaforoAlMomento: data.semaforoAlMomento, promedioAlMomento: data.promedioAlMomento,
        requiereRevision: data.requiereRevision, fecha: ahora,
        decisionSga: { estado:'pendiente', comentario:'', fecha:'' }
      };
      state.cortes.push(existing);
    }
    saveState();
    fireAndWarn_('guardarCorte', extend_({ id: existing.id }, data));
    return Promise.resolve(existing);
  }

  // Decisión del Secretario General sobre un corte — TOCA DOS REGISTROS A
  // LA VEZ (el corte y la continuidad del miembro). En modo remoto,
  // decidirCorte_() en Apps Script hace ambas escrituras bajo el mismo
  // lock — no es una transacción real, pero es la mejor aproximación
  // disponible (ver riesgos en README.md).
  function decidirCorte(corteId, estado){
    var rec = state.cortes.find(function(c){ return c.id === corteId; });
    if(!rec) return Promise.resolve(null);
    rec.decisionSga = { estado: estado, comentario:'', fecha: new Date().toISOString() };
    var miembro = miembroPorId(rec.miembroId);
    if(miembro) miembro.continuidad = estado;
    saveState();
    fireAndWarn_('decidirCorte', { corteId: corteId, estado: estado });
    return Promise.resolve(rec);
  }

  // Fecha de inicio de una fase de corte (configuración global, la fija la
  // Subsecretaría desde el modal "Fases de los cortes").
  function saveConfigCorte(corteKey, inicio){
    if(!state.configCortes[corteKey]) state.configCortes[corteKey] = { inicio:'' };
    state.configCortes[corteKey].inicio = inicio;
    saveState();
    fireAndWarn_('saveConfigCorte', { corteKey: corteKey, inicio: inicio });
    return Promise.resolve();
  }

  return {
    init: init,
    login: login,
    sustituirMiembro: sustituirMiembro,
    guardarMesa: guardarMesa,
    saveTaller: saveTaller,
    crearTaller: crearTaller,
    eliminarTaller: eliminarTaller,
    setTallerCerrada: setTallerCerrada,
    guardarEvaluacion: guardarEvaluacion,
    guardarCorte: guardarCorte,
    decidirCorte: decidirCorte,
    saveConfigCorte: saveConfigCorte
  };
})();
