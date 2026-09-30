'use strict';

/* ---------- Capa de acceso a datos ----------
   Fachada entre el resto de la app y la persistencia real. Dos modos, según
   si CONFIG.SUPABASE_URL/SUPABASE_ANON_KEY (js/config.js) tienen valor:

   - LOCAL (URL/llave vacías): todo vive en localStorage vía state.js.
   - REMOTO (con valores, el caso normal desde que existe SUPABASE.md):
     Supabase (Postgres) es la fuente de verdad. Cada mutador escribe
     PRIMERO en Supabase y devuelve una promesa: solo si el servidor
     confirma se actualiza `state` (y el respaldo en localStorage). Si la
     escritura falla, la promesa se rechaza con un mensaje listo para
     mostrar y NO se toca `state` — quien llama debe mantener el formulario
     con sus cambios y avisar (ver conGuardado_ en helpers.js).

   Los "getters" (state.talleres.filter(...), miembroActivo(...), etc.) NO
   pasan por acá — siguen leyendo `state` directo y síncrono, como siempre.
   Solo init(), login() y los métodos mutadores de abajo hablan con el
   backend.

   Nombres de columna: Postgres usa snake_case (comision_id, rol_key...),
   el resto del sitio usa camelCase (comisionId, rolKey...) — las funciones
   mapXFromDb_ de acá abajo son la única frontera entre los dos mundos. */
var dataService = (function(){

  var supa = null;
  function isRemote_(){
    if(typeof CONFIG === 'undefined' || !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) return false;
    if(!supa) supa = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    return true;
  }

  var MSG_ERROR_GUARDADO = 'No se pudo guardar en el servidor. Tus cambios siguen en pantalla — revisa tu conexión e inténtalo de nuevo.';

  // Ejecuta una escritura contra Supabase y espera la confirmación. `fn`
  // devuelve una promesa de supabase-js (o un arreglo/cadena de ellas
  // resueltas). supabase-js NO rechaza ante errores de la base: los deja en
  // res.error, por eso se revisan aquí. Sin Supabase configurado (modo
  // local) no hay nada que confirmar y resuelve de inmediato. `accion` es
  // solo para el log interno; el usuario ve un mensaje genérico.
  function escribir_(accion, fn){
    if(!isRemote_()) return Promise.resolve();
    return Promise.resolve().then(fn).then(function(res){
      var lista = Array.isArray(res) ? res : [res];
      lista.forEach(function(r){ if(r && r.error) throw r.error; });
    }).catch(function(err){
      console.error('[dataService] ' + accion + ':', err);
      throw new Error(MSG_ERROR_GUARDADO);
    });
  }

  function mapMiembroFromDb_(r){
    return { id:r.id, comisionId:r.comision_id, rolKey:r.rol_key, nombre:r.nombre, activo:r.activo, desde:r.desde||'', hasta:r.hasta||'', continuidad:r.continuidad||'' };
  }
  function mapTallerFromDb_(r){
    return { id:r.id, comisionId:r.comision_id, nombre:r.nombre, tipo:r.tipo, fecha:r.fecha||'', oradores:r.oradores||[], cerrada:!!r.cerrada };
  }
  function mapEvaluacionFromDb_(r){
    return {
      id:r.id, comisionId:r.comision_id, tallerId:r.taller_id, miembroId:r.miembro_id,
      rol:r.rol, nombreMiembro:r.nombre_miembro,
      respuestas:r.respuestas||{}, comentarios:r.comentarios||{}, puntosDim:r.puntos_dim||{},
      puntajeA:Number(r.puntaje_a)||0, puntajeTotal:Number(r.puntaje_total)||0, actualizado:r.actualizado||''
    };
  }
  function mapCorteFromDb_(r){
    return {
      id:r.id, comisionId:r.comision_id, miembroId:r.miembro_id, rolKey:r.rol_key, corteKey:r.corte_key,
      comentario:r.comentario||'', semaforoAlMomento:r.semaforo_al_momento||'',
      promedioAlMomento: r.promedio_al_momento === null ? null : Number(r.promedio_al_momento),
      requiereRevision:!!r.requiere_revision, fecha:r.fecha||'',
      decisionSga:{ estado:r.decision_estado||'pendiente', comentario:r.decision_comentario||'', fecha:r.decision_fecha||'' }
    };
  }

  // Reconstruye com.roles para todas las comisiones a partir de miembros —
  // misma lógica que rederivarRoles() en state.js, pero sobre datos que
  // todavía no son el `state` global (init() los arma ANTES de asignarlos).
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
  // correcto tal cual. En modo remoto, se pisa con lo que devuelva
  // Supabase — si falla, la promesa se rechaza (ver el catch de abajo).
  function init(){
    // Promise.resolve().then(): si supabase-js no cargó (CDN caído), el
    // ReferenceError de isRemote_() termina como rechazo y no como
    // excepción síncrona — así main.js muestra la pantalla de error igual.
    return Promise.resolve().then(function(){
      if(!isRemote_()) return state;
      return cargarRemoto_();
    });
  }
  function cargarRemoto_(){
    return Promise.all([
      supa.from('comisiones').select('*'),
      supa.from('miembros').select('*'),
      supa.from('talleres').select('*'),
      supa.from('evaluaciones').select('*'),
      supa.from('cortes').select('*'),
      supa.from('config_cortes').select('*')
    ]).then(function(results){
      for(var i=0;i<results.length;i++){ if(results[i].error) throw results[i].error; }
      var comisiones = results[0].data.map(function(r){ return { id:r.id, nombre:r.nombre, sigla:r.sigla }; });
      var miembros = results[1].data.map(mapMiembroFromDb_);
      var talleres = results[2].data.map(mapTallerFromDb_);
      var evaluaciones = results[3].data.map(mapEvaluacionFromDb_);
      var cortes = results[4].data.map(mapCorteFromDb_);
      var configCortes = {};
      results[5].data.forEach(function(r){ configCortes[r.key] = { inicio: r.inicio || '' }; });
      return { comisiones: derivarRoles_(comisiones, miembros), miembros: miembros, talleres: talleres, evaluaciones: evaluaciones, cortes: cortes, configCortes: configCortes };
    }).catch(function(err){
      // Sin respaldo silencioso: mostrar datos viejos de localStorage como
      // si fueran los reales llevaría a evaluar sobre información obsoleta.
      // main.js muestra una pantalla de error con "Reintentar".
      console.error('[dataService] init:', err);
      throw new Error('No se pudo conectar con el servidor.');
    });
  }

  // Autenticación por usuario/contraseña vía la función login() de
  // Postgres (SECURITY DEFINER — valida contra usuarios.contrasena_hash
  // sin exponer esa tabla directo, ver SUPABASE.md). Sin Supabase
  // configurado no hay contra qué validar cuentas.
  function login(usuario, contrasena){
    var remoto;
    try{ remoto = isRemote_(); }catch(e){
      console.error('[dataService] login: supabase-js no cargó', e);
      return Promise.reject(new Error('No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.'));
    }
    if(!remoto){
      console.error('[dataService] login: falta CONFIG.SUPABASE_URL/SUPABASE_ANON_KEY en js/config.js.');
      return Promise.reject(new Error('No se pudo conectar con el sistema. Contacta al administrador.'));
    }
    return supa.rpc('login', { p_usuario: usuario, p_contrasena: contrasena }).then(function(res){
      if(res.error){
        console.error('[dataService] login:', res.error);
        throw new Error('No se pudo iniciar sesión. Inténtalo de nuevo en unos minutos.');
      }
      var row = res.data && res.data[0];
      if(!row) throw new Error('Usuario o contraseña incorrectos.');
      return { rol: row.rol, comisionId: row.comision_id };
    }, function(err){
      console.error('[dataService] login (red):', err);
      throw new Error('No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
    });
  }

  // Sustituye al miembro activo de un cargo (Subsecretario). El anterior
  // queda inactivo con su historial intacto; el nuevo arranca sin evaluaciones.
  function sustituirMiembro(comisionId, rolKey, nombre){
    var actual = miembroActivo(comisionId, rolKey);
    var ahora = new Date().toISOString();
    var nuevo = {
      id: uid('mb'), comisionId: comisionId, rolKey: rolKey,
      nombre: nombre, activo:true, desde:ahora, hasta:'', continuidad:''
    };
    return escribir_('sustituirMiembro', function(){
      var alta = function(){ return supa.from('miembros').insert({ id:nuevo.id, comision_id:comisionId, rol_key:rolKey, nombre:nombre, desde:ahora }); };
      if(!actual) return alta();
      return supa.from('miembros').update({ activo:false, hasta:ahora }).eq('id', actual.id).then(function(r){
        if(r.error) return r; // no se da de alta al nuevo si la baja falló
        return alta();
      });
    }).then(function(){
      if(actual){ actual.activo = false; actual.hasta = ahora; }
      state.miembros.push(nuevo);
      rederivarRoles();
      saveState();
    });
  }

  // Aplica hasta 4 cambios de mesa directiva a la vez (uno por cargo):
  // renombrar, vaciar (da de baja al miembro actual) o asignar por primera
  // vez. `cambios` = [{ rolKey, nuevoNombre, miembro }], donde `miembro` es
  // el miembro activo actual de ese cargo (o null si estaba vacante).
  function guardarMesa(comisionId, cambios){
    var ahora = new Date().toISOString();
    var altas = [];
    return escribir_('guardarMesa', function(){
      return Promise.all(cambios.map(function(c){
        if(c.miembro){
          if(!c.nuevoNombre) return supa.from('miembros').update({ activo:false, hasta:ahora }).eq('id', c.miembro.id);
          return supa.from('miembros').update({ nombre:c.nuevoNombre }).eq('id', c.miembro.id);
        }
        if(c.nuevoNombre){
          var id = uid('mb');
          altas.push({ c:c, id:id });
          return supa.from('miembros').insert({ id:id, comision_id:comisionId, rol_key:c.rolKey, nombre:c.nuevoNombre, desde:ahora });
        }
        return null;
      }));
    }).then(function(){
      cambios.forEach(function(c){
        if(c.miembro){
          if(!c.nuevoNombre){ c.miembro.activo = false; c.miembro.hasta = ahora; }
          else c.miembro.nombre = c.nuevoNombre;
        }else if(c.nuevoNombre){
          var alta = altas.find(function(x){ return x.c === c; });
          state.miembros.push({ id: alta ? alta.id : uid('mb'), comisionId: comisionId, rolKey: c.rolKey, nombre: c.nuevoNombre, activo:true, desde:ahora, hasta:'', continuidad:'' });
        }
      });
      rederivarRoles();
      saveState();
    });
  }

  // Upsert de nombre/tipo/fecha/oradores de una actividad ya existente.
  function saveTaller(tallerId, campos){
    var t = state.talleres.find(function(x){ return x.id === tallerId; });
    if(!t) return Promise.reject(new Error('La actividad ya no existe.'));
    return escribir_('saveTaller', function(){
      return supa.from('talleres').update({ nombre:campos.nombre, tipo:campos.tipo, fecha:campos.fecha, oradores:campos.oradores }).eq('id', tallerId);
    }).then(function(){
      t.nombre = campos.nombre;
      t.tipo = campos.tipo;
      t.fecha = campos.fecha;
      t.oradores = campos.oradores;
      saveState();
      return t;
    });
  }

  // Inserta una actividad en blanco para la comisión dada.
  function crearTaller(comisionId){
    var t = { id: uid('tal'), comisionId: comisionId, nombre:'Nueva actividad', fecha:'', oradores:[], tipo:'taller', cerrada:false };
    return escribir_('crearTaller', function(){
      return supa.from('talleres').insert({ id:t.id, comision_id:comisionId, nombre:t.nombre, tipo:t.tipo, fecha:'', oradores:[] });
    }).then(function(){
      state.talleres.push(t);
      saveState();
      return t;
    });
  }

  // Único hard-delete de toda la app: borra la actividad Y sus evaluaciones
  // (no tendría sentido dejar evaluaciones huérfanas de una actividad que
  // ya no existe). En Supabase esto lo hace solo el "on delete cascade" de
  // evaluaciones.taller_id — basta con borrar el taller.
  function eliminarTaller(tallerId){
    return escribir_('eliminarTaller', function(){
      return supa.from('talleres').delete().eq('id', tallerId);
    }).then(function(){
      state.talleres = state.talleres.filter(function(x){ return x.id !== tallerId; });
      state.evaluaciones = state.evaluaciones.filter(function(ev){ return ev.tallerId !== tallerId; });
      saveState();
    });
  }

  // Alterna si una actividad admite más evaluaciones ("cerrada").
  function setTallerCerrada(tallerId, cerrada){
    var t = state.talleres.find(function(x){ return x.id === tallerId; });
    if(!t) return Promise.reject(new Error('La actividad ya no existe.'));
    return escribir_('setTallerCerrada', function(){
      return supa.from('talleres').update({ cerrada:cerrada }).eq('id', tallerId);
    }).then(function(){
      t.cerrada = cerrada;
      saveState();
      return t;
    });
  }

  // Upsert de una evaluación de rúbrica, identificada por (comisionId,
  // tallerId, miembroId) — a lo sumo una evaluación por esa combinación
  // (mismo unique constraint del lado de Postgres).
  function guardarEvaluacion(data){
    var existing = state.evaluaciones.find(function(e){
      return e.comisionId === data.comisionId && e.tallerId === data.tallerId && e.miembroId === data.miembroId;
    });
    var id = existing ? existing.id : uid('ev');
    var actualizado = new Date().toISOString();
    return escribir_('guardarEvaluacion', function(){
      return supa.from('evaluaciones').upsert({
        id: id, comision_id: data.comisionId, taller_id: data.tallerId, miembro_id: data.miembroId,
        rol: data.rol, nombre_miembro: data.nombreMiembro,
        respuestas: data.respuestas, comentarios: data.comentarios, puntos_dim: data.puntosDim,
        puntaje_a: data.puntajeA, puntaje_total: data.puntajeTotal, actualizado: actualizado
      }, { onConflict: 'comision_id,taller_id,miembro_id' });
    }).then(function(){
      if(existing){
        existing.respuestas = data.respuestas;
        existing.comentarios = data.comentarios;
        existing.puntosDim = data.puntosDim;
        existing.puntajeA = data.puntajeA;
        existing.puntajeTotal = data.puntajeTotal;
        existing.rol = data.rol;
        existing.nombreMiembro = data.nombreMiembro;
        existing.actualizado = actualizado;
      }else{
        existing = {
          id: id, comisionId: data.comisionId, tallerId: data.tallerId, miembroId: data.miembroId,
          rol: data.rol, nombreMiembro: data.nombreMiembro,
          respuestas: data.respuestas, comentarios: data.comentarios, puntosDim: data.puntosDim,
          puntajeA: data.puntajeA, puntajeTotal: data.puntajeTotal, actualizado: actualizado
        };
        state.evaluaciones.push(existing);
      }
      saveState();
      return existing;
    });
  }

  // Upsert de un corte de seguimiento, identificado por (miembroId,
  // corteKey) — a lo sumo un corte por esa combinación (mismo unique
  // constraint del lado de Postgres). Guardar un corte SIEMPRE reinicia
  // decisionSga a "pendiente": es un checkpoint nuevo, cualquier decisión
  // anterior del SG queda obsoleta.
  function guardarCorte(data){
    var existing = state.cortes.find(function(c){ return c.miembroId === data.miembroId && c.corteKey === data.corteKey; });
    var id = existing ? existing.id : uid('corte');
    var ahora = new Date().toISOString();
    return escribir_('guardarCorte', function(){
      return supa.from('cortes').upsert({
        id: id, comision_id: data.comisionId, miembro_id: data.miembroId, rol_key: data.rolKey, corte_key: data.corteKey,
        comentario: data.comentario, semaforo_al_momento: data.semaforoAlMomento, promedio_al_momento: data.promedioAlMomento,
        requiere_revision: data.requiereRevision, fecha: ahora,
        decision_estado: 'pendiente', decision_comentario: '', decision_fecha: null
      }, { onConflict: 'miembro_id,corte_key' });
    }).then(function(){
      if(existing){
        existing.comentario = data.comentario;
        existing.semaforoAlMomento = data.semaforoAlMomento;
        existing.promedioAlMomento = data.promedioAlMomento;
        existing.requiereRevision = data.requiereRevision;
        existing.fecha = ahora;
        existing.decisionSga = { estado:'pendiente', comentario:'', fecha:'' };
      }else{
        existing = {
          id: id, comisionId: data.comisionId, miembroId: data.miembroId, rolKey: data.rolKey, corteKey: data.corteKey,
          comentario: data.comentario,
          semaforoAlMomento: data.semaforoAlMomento, promedioAlMomento: data.promedioAlMomento,
          requiereRevision: data.requiereRevision, fecha: ahora,
          decisionSga: { estado:'pendiente', comentario:'', fecha:'' }
        };
        state.cortes.push(existing);
      }
      saveState();
      return existing;
    });
  }

  // Decisión del Secretario General sobre un corte — TOCA DOS REGISTROS A
  // LA VEZ (el corte y la continuidad del miembro); no es una transacción
  // real (ver SUPABASE.md). Si la segunda escritura falla, el corte ya
  // quedó decidido en el servidor: el error se reporta igual y reintentar
  // es seguro (ambas son idempotentes).
  function decidirCorte(corteId, estado){
    var rec = state.cortes.find(function(c){ return c.id === corteId; });
    if(!rec) return Promise.reject(new Error('El corte ya no existe.'));
    var miembro = miembroPorId(rec.miembroId);
    var fecha = new Date().toISOString();
    return escribir_('decidirCorte', function(){
      return supa.from('cortes').update({ decision_estado: estado, decision_comentario:'', decision_fecha: fecha }).eq('id', corteId).then(function(r){
        if(r.error || !miembro) return r;
        return supa.from('miembros').update({ continuidad: estado }).eq('id', miembro.id);
      });
    }).then(function(){
      rec.decisionSga = { estado: estado, comentario:'', fecha: fecha };
      if(miembro) miembro.continuidad = estado;
      saveState();
      return rec;
    });
  }

  // Fecha de inicio de una fase de corte (configuración global, la fija la
  // Subsecretaría desde el modal "Fases de los cortes").
  function saveConfigCorte(corteKey, inicio){
    return escribir_('saveConfigCorte', function(){
      return supa.from('config_cortes').update({ inicio:inicio }).eq('key', corteKey);
    }).then(function(){
      if(!state.configCortes[corteKey]) state.configCortes[corteKey] = { inicio:'' };
      state.configCortes[corteKey].inicio = inicio;
      saveState();
    });
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
