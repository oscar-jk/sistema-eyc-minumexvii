'use strict';

/* ---------- Capa de acceso a datos ----------
   Fachada entre el resto de la app y la persistencia real. Hoy TODO es
   local (localStorage vía state.js) — mañana, con la Sheet ya desplegada,
   solo el CUERPO de estas funciones cambia (agregar el fetch() al Apps
   Script); ningún sitio que las llama necesita tocarse.

   Los "getters" (state.talleres.filter(...), miembroActivo(...), etc.) NO
   pasan por acá — siguen leyendo `state` directo y síncrono, como siempre.
   Solo dos cosas están pensadas para volverse asíncronas cuando haya un
   backend remoto: init() (la carga inicial) y los métodos mutadores de
   abajo. Cada mutador ya actualiza `state` en memoria de forma síncrona
   (la UI puede re-renderizar inmediatamente después, sin esperar nada) y
   solo la persistencia de fondo (hoy: saveState(); mañana: POST al Apps
   Script) es la parte que eventualmente será real-async — por eso ya
   devuelven una Promise, aunque hoy se resuelva de inmediato. */
var dataService = (function(){

  // Reemplaza `var state = loadState()` como punto de entrada — hoy no hace
  // nada nuevo (state.js ya lo cargó de forma síncrona antes de que esto
  // corra), pero deja el sitio exacto donde un fetch() del roster remoto
  // reemplazará la carga local el día que exista.
  function init(){
    return Promise.resolve(state);
  }

  // Sustituye al miembro activo de un cargo (Subsecretario). El anterior
  // queda inactivo con su historial intacto; el nuevo arranca sin evaluaciones.
  function sustituirMiembro(comisionId, rolKey, nombre){
    var actual = miembroActivo(comisionId, rolKey);
    if(actual){ actual.activo = false; actual.hasta = new Date().toISOString(); }
    state.miembros.push({
      id: uid('mb'), comisionId: comisionId, rolKey: rolKey,
      nombre: nombre, activo:true, desde:new Date().toISOString(), hasta:'', continuidad:''
    });
    rederivarRoles();
    saveState();
    return Promise.resolve();
  }

  // Aplica hasta 4 cambios de mesa directiva a la vez (uno por cargo):
  // renombrar, vaciar (da de baja al miembro actual) o asignar por primera
  // vez. `cambios` = [{ rolKey, nuevoNombre, miembro }], donde `miembro` es
  // el miembro activo actual de ese cargo (o null si estaba vacante).
  function guardarMesa(comisionId, cambios){
    cambios.forEach(function(c){
      if(c.miembro){
        if(!c.nuevoNombre){
          c.miembro.activo = false;
          c.miembro.hasta = new Date().toISOString();
        }else{
          c.miembro.nombre = c.nuevoNombre;
        }
      }else if(c.nuevoNombre){
        state.miembros.push({
          id: uid('mb'), comisionId: comisionId, rolKey: c.rolKey, nombre: c.nuevoNombre,
          activo:true, desde:new Date().toISOString(), hasta:'', continuidad:''
        });
      }
    });
    rederivarRoles();
    saveState();
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
    return Promise.resolve(t);
  }

  // Inserta una actividad en blanco para la comisión dada.
  function crearTaller(comisionId){
    var t = { id: uid('tal'), comisionId: comisionId, nombre:'Nueva actividad', fecha:'', oradores:[], tipo:'taller', cerrada:false };
    state.talleres.push(t);
    saveState();
    return Promise.resolve(t);
  }

  // Único hard-delete de toda la app: borra la actividad Y sus evaluaciones
  // (no tendría sentido dejar evaluaciones huérfanas de una actividad que
  // ya no existe).
  function eliminarTaller(tallerId){
    state.talleres = state.talleres.filter(function(x){ return x.id !== tallerId; });
    state.evaluaciones = state.evaluaciones.filter(function(ev){ return ev.tallerId !== tallerId; });
    saveState();
    return Promise.resolve();
  }

  // Alterna si una actividad admite más evaluaciones ("cerrada").
  function setTallerCerrada(tallerId, cerrada){
    var t = state.talleres.find(function(x){ return x.id === tallerId; });
    if(!t) return Promise.resolve(null);
    t.cerrada = cerrada;
    saveState();
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
    return Promise.resolve(existing);
  }

  // Decisión del Secretario General sobre un corte — TOCA DOS REGISTROS A
  // LA VEZ (el corte y la continuidad del miembro) y debe quedar como una
  // sola operación atómica: con un backend remoto, un fallo de red a mitad
  // de camino no debe poder dejar uno actualizado y el otro no.
  function decidirCorte(corteId, estado){
    var rec = state.cortes.find(function(c){ return c.id === corteId; });
    if(!rec) return Promise.resolve(null);
    rec.decisionSga = { estado: estado, comentario:'', fecha: new Date().toISOString() };
    var miembro = miembroPorId(rec.miembroId);
    if(miembro) miembro.continuidad = estado;
    saveState();
    return Promise.resolve(rec);
  }

  // Fecha de inicio de una fase de corte (configuración global, la fija la
  // Subsecretaría desde el modal "Fases de los cortes").
  function saveConfigCorte(corteKey, inicio){
    if(!state.configCortes[corteKey]) state.configCortes[corteKey] = { inicio:'' };
    state.configCortes[corteKey].inicio = inicio;
    saveState();
    return Promise.resolve();
  }

  return {
    init: init,
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
