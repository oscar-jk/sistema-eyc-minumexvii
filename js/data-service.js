'use strict';

/* ---------- Capa de acceso a datos ----------
   Fachada entre el resto de la app y la persistencia real. Dos modos, según
   si CONFIG.SUPABASE_URL/SUPABASE_ANON_KEY (js/config.js) tienen valor:

   - LOCAL (URL/llave vacías): todo vive en localStorage vía state.js.
   - REMOTO (con valores, el caso normal desde que existe SUPABASE.md):
     Supabase (Postgres) es la fuente de verdad. Cada mutador actualiza
     `state` en memoria de inmediato (la UI no espera a la red) y ADEMÁS
     dispara la escritura correspondiente en Supabase en segundo plano —
     si esa escritura falla, se avisa con un toast de error en vez de
     fallar en silencio, pero no se revierte el cambio local (ver
     SUPABASE.md, "sin transacciones reales"). localStorage se sigue
     llenando igual como respaldo, por si falla la red a mitad de un corte
     durante el evento.

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

  // Dispara una escritura "en segundo plano": la UI ya se actualizó de
  // forma optimista con el cambio local, esto solo confirma que también
  // llegó a Supabase. Un fallo se avisa con un toast, no bloquea ni
  // revierte nada. `accion` es solo para logging interno — el usuario ve un
  // mensaje genérico y amigable, nunca el nombre técnico ni el error crudo.
  function fireAndWarn_(accion, promise){
    if(!isRemote_()) return;
    promise.then(function(res){
      if(res && res.error) throw res.error;
    }).catch(function(err){
      console.error('[dataService] ' + accion + ':', err);
      toast('No se pudo guardar este cambio en el servidor. Quedó guardado en este dispositivo — revisa tu conexión e inténtalo de nuevo.', 'error');
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
  // Supabase — si falla (red caída, credenciales mal puestas...), se avisa
  // y se sigue con el `state` local como respaldo en vez de dejar la app
  // en blanco.
  function init(){
    if(!isRemote_()) return Promise.resolve(state);
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
      console.error('[dataService] init:', err);
      toast('No se pudo conectar con el servidor. Se están mostrando los datos guardados en este dispositivo.', 'error');
      return state;
    });
  }

  // Autenticación por usuario/contraseña vía la función login() de
  // Postgres (SECURITY DEFINER — valida contra usuarios.contrasena_hash
  // sin exponer esa tabla directo, ver SUPABASE.md). Sin Supabase
  // configurado no hay contra qué validar cuentas.
  function login(usuario, contrasena){
    if(!isRemote_()){
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
    if(actual){ actual.activo = false; actual.hasta = new Date().toISOString(); }
    var nuevo = {
      id: uid('mb'), comisionId: comisionId, rolKey: rolKey,
      nombre: nombre, activo:true, desde:new Date().toISOString(), hasta:'', continuidad:''
    };
    state.miembros.push(nuevo);
    rederivarRoles();
    saveState();
    if(isRemote_()){
      var p = actual
        ? supa.from('miembros').update({ activo:false, hasta:nuevo.desde }).eq('id', actual.id)
            .then(function(){ return supa.from('miembros').insert({ id:nuevo.id, comision_id:comisionId, rol_key:rolKey, nombre:nombre, desde:nuevo.desde }); })
        : supa.from('miembros').insert({ id:nuevo.id, comision_id:comisionId, rol_key:rolKey, nombre:nombre, desde:nuevo.desde });
      fireAndWarn_('sustituirMiembro', p);
    }
    return Promise.resolve();
  }

  // Aplica hasta 4 cambios de mesa directiva a la vez (uno por cargo):
  // renombrar, vaciar (da de baja al miembro actual) o asignar por primera
  // vez. `cambios` = [{ rolKey, nuevoNombre, miembro }], donde `miembro` es
  // el miembro activo actual de ese cargo (o null si estaba vacante).
  function guardarMesa(comisionId, cambios){
    var writes = [];
    cambios.forEach(function(c){
      if(c.miembro){
        if(!c.nuevoNombre){
          c.miembro.activo = false;
          c.miembro.hasta = new Date().toISOString();
          if(isRemote_()) writes.push(supa.from('miembros').update({ activo:false, hasta:c.miembro.hasta }).eq('id', c.miembro.id));
        }else{
          c.miembro.nombre = c.nuevoNombre;
          if(isRemote_()) writes.push(supa.from('miembros').update({ nombre:c.nuevoNombre }).eq('id', c.miembro.id));
        }
      }else if(c.nuevoNombre){
        var id = uid('mb');
        var desde = new Date().toISOString();
        state.miembros.push({ id: id, comisionId: comisionId, rolKey: c.rolKey, nombre: c.nuevoNombre, activo:true, desde:desde, hasta:'', continuidad:'' });
        if(isRemote_()) writes.push(supa.from('miembros').insert({ id:id, comision_id:comisionId, rol_key:c.rolKey, nombre:c.nuevoNombre, desde:desde }));
      }
    });
    rederivarRoles();
    saveState();
    if(isRemote_()) fireAndWarn_('guardarMesa', Promise.all(writes));
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
    if(isRemote_()) fireAndWarn_('saveTaller', supa.from('talleres').update({ nombre:campos.nombre, tipo:campos.tipo, fecha:campos.fecha, oradores:campos.oradores }).eq('id', tallerId));
    return Promise.resolve(t);
  }

  // Inserta una actividad en blanco para la comisión dada.
  function crearTaller(comisionId){
    var t = { id: uid('tal'), comisionId: comisionId, nombre:'Nueva actividad', fecha:'', oradores:[], tipo:'taller', cerrada:false };
    state.talleres.push(t);
    saveState();
    if(isRemote_()) fireAndWarn_('crearTaller', supa.from('talleres').insert({ id:t.id, comision_id:comisionId, nombre:t.nombre, tipo:t.tipo, fecha:'', oradores:[] }));
    return Promise.resolve(t);
  }

  // Único hard-delete de toda la app: borra la actividad Y sus evaluaciones
  // (no tendría sentido dejar evaluaciones huérfanas de una actividad que
  // ya no existe). En Supabase esto lo hace solo el "on delete cascade" de
  // evaluaciones.taller_id — basta con borrar el taller.
  function eliminarTaller(tallerId){
    state.talleres = state.talleres.filter(function(x){ return x.id !== tallerId; });
    state.evaluaciones = state.evaluaciones.filter(function(ev){ return ev.tallerId !== tallerId; });
    saveState();
    if(isRemote_()) fireAndWarn_('eliminarTaller', supa.from('talleres').delete().eq('id', tallerId));
    return Promise.resolve();
  }

  // Alterna si una actividad admite más evaluaciones ("cerrada").
  function setTallerCerrada(tallerId, cerrada){
    var t = state.talleres.find(function(x){ return x.id === tallerId; });
    if(!t) return Promise.resolve(null);
    t.cerrada = cerrada;
    saveState();
    if(isRemote_()) fireAndWarn_('setTallerCerrada', supa.from('talleres').update({ cerrada:cerrada }).eq('id', tallerId));
    return Promise.resolve(t);
  }

  // Upsert de una evaluación de rúbrica, identificada por (comisionId,
  // tallerId, miembroId) — a lo sumo una evaluación por esa combinación
  // (mismo unique constraint del lado de Postgres).
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
    if(isRemote_()){
      fireAndWarn_('guardarEvaluacion', supa.from('evaluaciones').upsert({
        id: existing.id, comision_id: data.comisionId, taller_id: data.tallerId, miembro_id: data.miembroId,
        rol: data.rol, nombre_miembro: data.nombreMiembro,
        respuestas: data.respuestas, comentarios: data.comentarios, puntos_dim: data.puntosDim,
        puntaje_a: data.puntajeA, puntaje_total: data.puntajeTotal, actualizado: existing.actualizado
      }, { onConflict: 'comision_id,taller_id,miembro_id' }));
    }
    return Promise.resolve(existing);
  }

  // Upsert de un corte de seguimiento, identificado por (miembroId,
  // corteKey) — a lo sumo un corte por esa combinación (mismo unique
  // constraint del lado de Postgres). Guardar un corte SIEMPRE reinicia
  // decisionSga a "pendiente": es un checkpoint nuevo, cualquier decisión
  // anterior del SG queda obsoleta.
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
    if(isRemote_()){
      fireAndWarn_('guardarCorte', supa.from('cortes').upsert({
        id: existing.id, comision_id: data.comisionId, miembro_id: data.miembroId, rol_key: data.rolKey, corte_key: data.corteKey,
        comentario: data.comentario, semaforo_al_momento: data.semaforoAlMomento, promedio_al_momento: data.promedioAlMomento,
        requiere_revision: data.requiereRevision, fecha: ahora,
        decision_estado: 'pendiente', decision_comentario: '', decision_fecha: null
      }, { onConflict: 'miembro_id,corte_key' }));
    }
    return Promise.resolve(existing);
  }

  // Decisión del Secretario General sobre un corte — TOCA DOS REGISTROS A
  // LA VEZ (el corte y la continuidad del miembro); no es una transacción
  // real (ver SUPABASE.md), pero las dos escrituras se disparan juntas.
  function decidirCorte(corteId, estado){
    var rec = state.cortes.find(function(c){ return c.id === corteId; });
    if(!rec) return Promise.resolve(null);
    rec.decisionSga = { estado: estado, comentario:'', fecha: new Date().toISOString() };
    var miembro = miembroPorId(rec.miembroId);
    if(miembro) miembro.continuidad = estado;
    saveState();
    if(isRemote_()){
      var p = supa.from('cortes').update({ decision_estado: estado, decision_comentario:'', decision_fecha: rec.decisionSga.fecha }).eq('id', corteId)
        .then(function(){ return miembro ? supa.from('miembros').update({ continuidad: estado }).eq('id', miembro.id) : null; });
      fireAndWarn_('decidirCorte', p);
    }
    return Promise.resolve(rec);
  }

  // Fecha de inicio de una fase de corte (configuración global, la fija la
  // Subsecretaría desde el modal "Fases de los cortes").
  function saveConfigCorte(corteKey, inicio){
    if(!state.configCortes[corteKey]) state.configCortes[corteKey] = { inicio:'' };
    state.configCortes[corteKey].inicio = inicio;
    saveState();
    if(isRemote_()) fireAndWarn_('saveConfigCorte', supa.from('config_cortes').update({ inicio:inicio }).eq('key', corteKey));
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
