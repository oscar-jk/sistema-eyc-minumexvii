'use strict';

  var state = loadState();

  var session = loadSession();

  // Cambios sin guardar por formulario (mesa directiva, una actividad puntual,
  // evaluar, cortes...) — bloquean la navegación hasta confirmar.
  var dirtyForms = {};

  // Navegación dentro de "Comisiones": qué comisión está abierta y en qué sub-pestaña.
  var comisionDetailId = null;
  var comisionDetailTab = 'mesa';
  // Sub-pestaña activa dentro de Monitoreo — 'casos' (default) | 'panel'
  // (solo SG) | 'rendimiento' | 'evaluaciones'.
  var adminDetailTab = 'casos';
  var selTaller = '';
  // Identifica a la PERSONA (miembro.id), no el cargo — un rolKey puede
  // apuntar a alguien distinto después de una sustitución, así que ya no
  // sirve para saber a quién se está evaluando.
  var selMiembroId = '';
  var selCorteTipo = '';
  var currentRespuestas = {};
  var currentComentarios = {};
  var currentPuntosDim = {};

  // Filtro de la sección "Rendimiento" en Admin (persiste mientras dura la
  // sesión). Un solo select por semáforo — "Puntaje" quedaría redundante,
  // son las mismas bandas.
  var adminBusqueda = '';
  var adminFiltroSemaforo = 'todos';

  // Filtro del Histórico de la comisión abierta — se reinicia al entrar a
  // otra comisión. Las filas son evaluaciones individuales (no el promedio
  // de una persona), así que se filtran por su propio puntaje, no por un
  // semáforo que no les aplica.
  var historicoBusqueda = '';
  var historicoFiltroPuntaje = 'todos';
  function loadState(){
    var saved = { comisiones:[], talleres:[], evaluaciones:[], cortes:[], configCortes:{}, miembros:[] };
    var raw = null;
    try{
      raw = localStorage.getItem(STORAGE_KEY);
      if(raw){
        var parsed = JSON.parse(raw);
        saved.comisiones = parsed.comisiones || [];
        saved.talleres = parsed.talleres || [];
        saved.evaluaciones = parsed.evaluaciones || [];
        saved.cortes = parsed.cortes || [];
        saved.configCortes = parsed.configCortes || {};
        saved.miembros = parsed.miembros || [];
      }
    }catch(e){
      console.warn('No se pudo leer el almacenamiento local', e);
    }
    // Primer arranque (nada guardado todavía): se precargan los miembros de
    // prueba, uno por cargo y comisión, con id determinista (no uid() — esto
    // nunca llama a saveState, así que un id aleatorio cambiaría en cada
    // recarga hasta el primer guardado real). En cuanto se guarda cualquier
    // cambio, dejan de usarse — a partir de ahí manda siempre lo guardado.
    var isFirstRun = !raw;
    var miembros = saved.miembros;
    if(isFirstRun){
      miembros = [];
      FIXED_COMISIONES.forEach(function(fc){
        ROLES.forEach(function(r){
          miembros.push({
            id: 'mb_' + fc.id + '_' + r.key,
            comisionId: fc.id,
            rolKey: r.key,
            nombre: (fc.rolesDemo && fc.rolesDemo[r.key]) || '',
            activo: true,
            desde: new Date().toISOString(),
            hasta: '',
            continuidad: ''
          });
        });
      });
    }
    // com.roles ya no se guarda directamente — se deriva del miembro activo
    // de cada cargo, así que el resto del código (que lee com.roles[key] en
    // ~20 sitios) sigue funcionando sin cambios.
    var comisiones = FIXED_COMISIONES.map(function(fc){
      var roles = {};
      ROLES.forEach(function(r){
        var activo = miembros.find(function(m){ return m.comisionId === fc.id && m.rolKey === r.key && m.activo; });
        roles[r.key] = activo ? activo.nombre : '';
      });
      return { id: fc.id, nombre: fc.nombre, sigla: fc.sigla, roles: roles };
    });
    var configCortes = {};
    CORTES.forEach(function(c){
      configCortes[c.key] = saved.configCortes[c.key] || { inicio: '' };
    });
    return { comisiones: comisiones, talleres: saved.talleres, evaluaciones: saved.evaluaciones, cortes: saved.cortes, configCortes: configCortes, miembros: miembros };
  }

  /* ---------- Miembros (personas en un cargo de mesa directiva) ---------- */
  // Miembro activo de un cargo — la fuente de verdad detrás de com.roles[rolKey].
  function miembroActivo(comisionId, rolKey){
    return state.miembros.find(function(m){ return m.comisionId === comisionId && m.rolKey === rolKey && m.activo; });
  }
  function miembroPorId(miembroId){
    return state.miembros.find(function(m){ return m.id === miembroId; });
  }
  function nombreDeMiembro(miembroId){
    var m = miembroPorId(miembroId);
    return m ? m.nombre : '';
  }
  // Reconstruye com.roles para TODAS las comisiones a partir de state.miembros.
  // Se llama después de cualquier cambio a state.miembros (alta, baja, rename).
  function rederivarRoles(){
    state.comisiones.forEach(function(com){
      ROLES.forEach(function(r){
        var activo = miembroActivo(com.id, r.key);
        com.roles[r.key] = activo ? activo.nombre : '';
      });
    });
  }
  function miembroTieneHistorial(miembroId){
    return state.evaluaciones.some(function(e){ return e.miembroId === miembroId; }) ||
      state.cortes.some(function(c){ return c.miembroId === miembroId; });
  }

  function saveState(){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }catch(e){
      toast('No se pudo guardar. Verifica el espacio de almacenamiento del navegador.', 'error');
    }
  }

  function uid(prefix){
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
  }

  /* ---------- Sesión / roles ---------- */
  function loadSession(){
    try{
      var raw = localStorage.getItem(SESSION_KEY);
      if(raw) return JSON.parse(raw);
    }catch(e){}
    return null;
  }
  function saveSession(){
    try{ localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }catch(e){}
  }
  function currentComision(){
    return state.comisiones.find(function(c){ return c.id === comisionDetailId; });
  }

