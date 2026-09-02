'use strict';

  function renderAdmin(){
    var el = document.getElementById('admin-content');
    var desc = document.getElementById('admin-view-desc');
    if(desc) desc.textContent = isSg()
      ? 'Decide la continuidad de los casos que llegan de Subsecretaría y consulta el panel general de todas las comisiones.'
      : 'Monitoreo por semáforo de todos los voluntarios y rendimiento de todas las comisiones.';
    var cortesBtn = document.getElementById('btn-cortes-config');
    if(cortesBtn) cortesBtn.hidden = isSg();
    var validos = ['casos','rendimiento','evaluaciones'].concat(isSg() ? ['panel'] : []);
    if(validos.indexOf(adminDetailTab) === -1) adminDetailTab = 'casos';
    el.innerHTML = adminDashboardStatsHTML() + adminSubtabsHTML() + '<div id="admin-subtab-content">' + renderAdminSubtabContent() + '</div>';
    bindAdminEvents();
    bindAdminSubtabsClick();
  }

  // Pestañas de Monitoreo — mismo patrón .subtabs/.subtab-btn que ya se usa
  // dentro de una comisión (Mesa/Actividades/Evaluar/Histórico), en vez de
  // apilar 5 secciones distintas bajo el mismo scroll continuo.
  function adminSubtabsHTML(){
    var tabs = isSg()
      ? [['casos','Casos'],['panel','Panel general'],['rendimiento','Rendimiento'],['evaluaciones','Evaluaciones']]
      : [['casos','Casos'],['rendimiento','Rendimiento'],['evaluaciones','Evaluaciones']];
    return '<nav class="subtabs" role="tablist" aria-label="Secciones de Monitoreo">' +
      tabs.map(function(tb){
        return '<button type="button" class="subtab-btn' + (adminDetailTab === tb[0] ? ' is-active' : '') + '" data-admin-subtab="' + tb[0] + '" role="tab" aria-selected="' + (adminDetailTab === tb[0]) + '">' + tb[1] + '</button>';
      }).join('') +
    '</nav>';
  }

  function renderAdminSubtabContent(){
    if(adminDetailTab === 'casos') return isSg() ? (adminSgaColaHTML() + adminCasosCTAProgresoHTML()) : renderAdminCasosSubseHTML();
    if(adminDetailTab === 'panel' && isSg()) return adminPanelGeneralHTML();
    if(adminDetailTab === 'rendimiento') return adminRendimientoHTML();
    if(adminDetailTab === 'evaluaciones') return adminTablaHTML();
    return '';
  }

  function bindAdminSubtabsClick(){
    var btns = document.querySelectorAll('[data-admin-subtab]');
    for(var i=0;i<btns.length;i++){
      btns[i].addEventListener('click', function(e){
        pushNavSnapshot_();
        adminDetailTab = e.currentTarget.dataset.adminSubtab;
        renderAdmin();
      });
    }
  }

  // La sección "Progreso de actividades por comisión" que existía dentro de
  // Monitoreo se quitó por completo: es 100% redundante con la pestaña de
  // navegación superior "Progreso", que para Subse/SG ya muestra las 15
  // comisiones completas (no solo la propia, como le pasa al EyC). Este es
  // el enlace que la reemplaza.
  function adminCasosCTAProgresoHTML(){
    return '<div class="card" style="margin-top:1.4rem;"><p class="hint-text">Para ver el avance de actividades de todas las comisiones, usa la pestaña Progreso.</p>' +
      '<button type="button" class="btn btn-secondary" data-goto="progreso" style="margin-top:.6rem;">Ver progreso de actividades →</button></div>';
  }

  // Resumen tipo dashboard — pensado para que Subse/SG vean el estado
  // general del evento de un vistazo al entrar a Monitoreo.
  function adminDashboardStatsHTML(){
    var comisionesConMesa = state.comisiones.filter(function(c){ return ROLES.some(function(r){ return (c.roles[r.key] || '').trim(); }); }).length;
    var actividadesEvaluadas = state.evaluaciones.filter(function(e){ return typeof e.puntajeTotal === 'number'; }).length;
    var casosPendientes = state.cortes.filter(function(c){ return c.requiereRevision && c.decisionSga.estado === 'pendiente'; }).length;
    var casosDecididos = state.cortes.filter(function(c){ return c.decisionSga.estado !== 'pendiente'; }).length;
    return '<div class="dash-stats">' +
      '<div class="dash-stat"><div class="dash-stat-value">' + state.comisiones.length + '</div><div class="dash-stat-label">Comisiones totales</div></div>' +
      '<div class="dash-stat"><div class="dash-stat-value">' + comisionesConMesa + '</div><div class="dash-stat-label">Con mesa asignada</div></div>' +
      '<div class="dash-stat"><div class="dash-stat-value">' + actividadesEvaluadas + '</div><div class="dash-stat-label">Evaluaciones de actividad</div></div>' +
      '<div class="dash-stat"><div class="dash-stat-value">' + casosPendientes + '</div><div class="dash-stat-label">Casos pendientes del SG</div></div>' +
      '<div class="dash-stat"><div class="dash-stat-value">' + casosDecididos + '</div><div class="dash-stat-label">Casos decididos</div></div>' +
    '</div>';
  }

  function bindAdminEvents(){
    bindAdminSgaEvents();
    bindAdminRendimientoEvents();
    // OJO: bindAdminConfigCortesEvents() NO va aquí. #cortes-config-modal
    // vive fuera de #admin-content (renderAdmin() nunca lo toca), así que
    // se enlaza únicamente desde renderCortesConfigModalContent() — cada
    // vez que esa función reconstruye el contenido del modal. Si también se
    // enlazara acá, cada cambio de fecha terminaría con dos listeners sobre
    // los mismos inputs (uno por cada punto que los re-enlaza) y el guardado
    // se dispararía dos veces por cambio.
  }

  function todosLosVoluntarios(){
    var lista = [];
    state.comisiones.forEach(function(com){
      ROLES.forEach(function(r){
        var m = miembroActivo(com.id, r.key);
        if(m && m.nombre.trim()) lista.push({ miembro:m, com:com, rol:r });
      });
    });
    return lista;
  }

  // Contenido de la pestaña "Casos" para el Subsecretario: agrupado por
  // semáforo en vez de una lista plana de las 15 comisiones — rojo/amarillo
  // quedan expandidos (son los casos que necesitan atención), verde/gris
  // colapsados.
  function renderAdminCasosSubseHTML(){
    var voluntarios = todosLosVoluntarios();
    if(voluntarios.length === 0){
      return emptyState('Aún no hay mesas directivas asignadas', 'Asigna nombres en al menos una comisión para monitorear su progreso aquí.');
    }
    var grupos = { rojo:[], amarillo:[], verde:[], gris:[] };
    voluntarios.forEach(function(v){
      var estado = semaforoDeMiembro(v.miembro.id);
      grupos[estado.key].push({ v:v, estado:estado });
    });
    var orden = [['rojo','En riesgo'], ['amarillo','Seguimiento'], ['verde','Cumple'], ['gris','Sin evaluaciones']];
    var secciones = orden.map(function(o){
      var key = o[0], lista = grupos[key];
      if(lista.length === 0) return '';
      var abierto = key === 'rojo' || key === 'amarillo';
      return '<details class="grupo-semaforo acc-box"' + (abierto ? ' open' : '') + '>' +
        '<summary class="grupo-semaforo-head"><span class="semaforo-dot semaforo-' + key + '"></span>' + o[1] + ' <span class="grupo-semaforo-count">(' + lista.length + ')</span></summary>' +
        lista.map(function(x){ return personaCardHTML(x.v, x.estado); }).join('') +
        '</details>';
    }).join('');
    return secciones + adminCasosCTAProgresoHTML();
  }

  function personaCardHTML(v, estado){
    var pendientesCorte = CORTES.filter(function(c){
      return corteFaseActiva(c.key) && !state.cortes.some(function(x){ return x.miembroId === v.miembro.id && x.corteKey === c.key; });
    });
    var accionesCorte = pendientesCorte.map(function(c){
      return '<button type="button" class="btn btn-secondary btn-sm" data-corte-miembro="' + v.miembro.id + '" data-corte-key="' + c.key + '" data-corte-com="' + v.com.id + '">Evaluar ' + escapeHTML(c.label) + '</button>';
    }).join('');
    return '<div class="persona-card">' +
      '<div class="persona-card-head">' +
        '<span><button type="button" class="hist-link" data-hist-miembro="' + v.miembro.id + '"><strong>' + escapeHTML(v.miembro.nombre) + '</strong></button> <span class="historico-meta">— ' + escapeHTML(v.rol.label) + ', ' + escapeHTML(v.com.sigla) + '</span></span>' +
        '<span class="historico-meta">' + (estado.n === 0 ? 'sin evaluaciones' : estado.promedio + '% (' + estado.n + ')') + '</span>' +
      '</div>' +
      '<div class="persona-card-actions">' +
        accionesCorte +
        '<button type="button" class="btn btn-secondary btn-sm" data-action="sustituir-miembro" data-com="' + v.com.id + '" data-rol="' + v.rol.key + '">Sustituir</button>' +
      '</div>' +
      '</div>';
  }

  // Pestaña "Casos" del Secretario General: la cola de casos que la
  // Subsecretaría marcó en amarillo/rojo (verde nunca llega aquí).
  var sgaFiltroChip = 'todos'; // 'todos' | 'rojo' | 'amarillo'

  function adminSgaColaHTML(){
    var pendientes = state.cortes.filter(function(c){ return c.requiereRevision && c.decisionSga.estado === 'pendiente'; })
      .sort(function(a,b){ return new Date(b.fecha) - new Date(a.fecha); });
    var chips = [['todos','Todos'], ['rojo','Rojo'], ['amarillo','Amarillo']].map(function(o){
      return '<button type="button" class="chip-filtro' + (sgaFiltroChip === o[0] ? ' is-active' : '') + '" data-sga-chip="' + o[0] + '">' +
        (o[0] !== 'todos' ? '<span class="semaforo-dot semaforo-' + o[0] + '"></span>' : '') + o[1] + '</button>';
    }).join('');
    var chipsHTML = '<div class="admin-filters" style="gap:.5rem;">' + chips + '</div>';
    var filtrados = sgaFiltroChip === 'todos' ? pendientes : pendientes.filter(function(c){ return c.semaforoAlMomento === sgaFiltroChip; });
    if(filtrados.length === 0){
      return chipsHTML + emptyState('No hay casos pendientes', 'Cuando la Subsecretaría registre un corte en amarillo o rojo, aparecerá aquí para tu decisión.');
    }
    var rows = filtrados.map(function(c){
      var com = state.comisiones.find(function(x){ return x.id === c.comisionId; });
      var corteInfo = CORTES.find(function(x){ return x.key === c.corteKey; });
      var rolInfo = ROLES.find(function(x){ return x.key === c.rolKey; });
      var miembro = miembroPorId(c.miembroId);
      return '<div class="persona-card">' +
        '<div class="persona-card-head">' +
          '<span><button type="button" class="hist-link" data-hist-miembro="' + c.miembroId + '"><strong>' + escapeHTML(miembro ? miembro.nombre : '—') + '</strong></button> <span class="historico-meta">— ' + escapeHTML(rolInfo ? rolInfo.label : c.rolKey) + ', ' + escapeHTML(com ? com.sigla : '—') + '</span></span>' +
          '<span class="semaforo-dot semaforo-' + c.semaforoAlMomento + '" title="' + escapeHTML(semaforoLabel(c.semaforoAlMomento)) + '"></span>' +
        '</div>' +
        '<p class="hint-text">' + escapeHTML(corteInfo ? corteInfo.label : c.corteKey) + ' — ' + formatFecha(c.fecha) + (c.promedioAlMomento != null ? ' · Promedio en ese momento: ' + c.promedioAlMomento + '%' : '') + '</p>' +
        (c.comentario ? '<p class="hint-text">' + escapeHTML(c.comentario) + '</p>' : '') +
        '<div class="persona-card-actions">' +
          '<button type="button" class="btn btn-approve btn-sm" data-decidir-corte="' + c.id + '" data-decidir-estado="continua">Continúa</button>' +
          '<button type="button" class="btn btn-reject btn-sm" data-decidir-corte="' + c.id + '" data-decidir-estado="no-continua">No continúa</button>' +
        '</div>' +
        '</div>';
    }).join('');
    return chipsHTML + rows;
  }

  // Por comisión: promedio general + barra de distribución de semáforo —
  // permite comparar comisiones de un vistazo sin que un promedio general
  // esconda casos rojos aislados (la barra los muestra igual aunque sean
  // pocos).
  function adminPanelGeneralHTML(){
    var rows = state.comisiones.map(function(com){
      var voluntarios = ROLES.map(function(r){ return miembroActivo(com.id, r.key); }).filter(function(m){ return m && m.nombre.trim(); });
      if(voluntarios.length === 0) return '';
      var estados = voluntarios.map(function(m){ return semaforoDeMiembro(m.id); });
      var conPromedio = estados.filter(function(e){ return e.promedio != null; });
      var promedioComision = conPromedio.length ? Math.round((conPromedio.reduce(function(s,e){ return s + e.promedio; }, 0) / conPromedio.length) * 10) / 10 : null;
      var counts = { verde:0, amarillo:0, rojo:0, gris:0 };
      estados.forEach(function(e){ counts[e.key]++; });
      var total = voluntarios.length;
      var barra = ['verde','amarillo','rojo','gris'].map(function(k){
        var pct = total ? (counts[k] / total * 100) : 0;
        return pct > 0 ? '<span class="semaforo-bar-' + k + '" style="width:' + pct + '%"></span>' : '';
      }).join('');
      return '<div class="persona-card">' +
        '<div class="persona-card-head"><span><strong>' + escapeHTML(com.sigla) + '</strong> <span class="historico-meta">' + escapeHTML(com.nombre) + '</span></span>' +
          '<span class="historico-meta">' + (promedioComision == null ? 'sin evaluaciones' : promedioComision + '%') + '</span></div>' +
        '<div class="semaforo-bar">' + barra + '</div>' +
        '<div class="semaforo-legend">' +
          '<span><span class="semaforo-dot semaforo-verde"></span>Verde ' + counts.verde + '</span>' +
          '<span><span class="semaforo-dot semaforo-amarillo"></span>Amarillo ' + counts.amarillo + '</span>' +
          '<span><span class="semaforo-dot semaforo-rojo"></span>Rojo ' + counts.rojo + '</span>' +
          '<span><span class="semaforo-dot semaforo-gris"></span>Gris ' + counts.gris + '</span>' +
        '</div>' +
        '</div>';
    }).join('');
    if(!rows) return emptyState('Aún no hay mesas directivas asignadas', 'Asigna nombres en al menos una comisión para ver el panel general aquí.');
    return rows;
  }

  function bindAdminSgaEvents(){
    var chips = document.querySelectorAll('[data-sga-chip]');
    for(var i=0;i<chips.length;i++){
      chips[i].addEventListener('click', function(e){ sgaFiltroChip = e.currentTarget.dataset.sgaChip; renderAdmin(); });
    }
    var decidirBtns = document.querySelectorAll('[data-decidir-corte]');
    for(var j=0;j<decidirBtns.length;j++){
      decidirBtns[j].addEventListener('click', function(e){ adminDecidirCorte(e.currentTarget.dataset.decidirCorte, e.currentTarget.dataset.decidirEstado); });
    }
  }

  // "No continúa" deja al voluntario marcado — eso es lo que habilita al
  // Subsecretario a sustituirlo desde su panel; sin esto la decisión del SG
  // no cambiaría ningún estado real.
  function adminDecidirCorte(corteId, estado){
    var rec = state.cortes.find(function(c){ return c.id === corteId; });
    if(!rec) return;
    dataService.decidirCorte(corteId, estado);
    toast(estado === 'continua' ? 'Marcado como "Continúa"' : 'Marcado como "No continúa"');
    renderAdmin();
  }

  function adminConfigCortesHTML(){
    var campos = CORTES.map(function(c){
      var val = (state.configCortes && state.configCortes[c.key] && state.configCortes[c.key].inicio) || '';
      var activa = corteFaseActiva(c.key);
      return '<label class="select-field admin-filter-select">' + escapeHTML(c.label) + ' — inicio de fase' +
        '<input type="date" class="admin-date-input" data-corte-config="' + c.key + '" value="' + escapeHTML(val) + '">' +
        '<span class="admin-fase-estado">' + (val ? (activa ? 'Fase activa' : 'Aún no inicia') : 'Sin fecha — siempre activa') + '</span>' +
      '</label>';
    }).join('');
    return '<div class="admin-filters">' + campos + '</div>' +
      '<p class="hint-text">Antes de la fecha de inicio, el formulario de ese corte queda deshabilitado para la Subsecretaría.</p>';
  }

  function bindAdminConfigCortesEvents(){
    var inputs = document.querySelectorAll('#cortes-config-modal [data-corte-config]');
    for(var i=0;i<inputs.length;i++){
      inputs[i].addEventListener('change', function(e){
        var key = e.target.dataset.corteConfig;
        dataService.saveConfigCorte(key, e.target.value);
        // El modal vive fuera de #admin-content, así que sobrevive al
        // refresco de abajo — pero su propio contenido (qué fase está
        // activa) hay que actualizarlo aparte. renderAdmin() es necesario
        // además, porque las tarjetas de "Casos" ofrecen botones "Evaluar
        // CorteX" según corteFaseActiva(), y sin esto quedarían obsoletos
        // hasta la próxima navegación.
        renderCortesConfigModalContent();
        renderAdmin();
      });
    }
  }

  function abrirCortesConfigModal(){
    renderCortesConfigModalContent();
    document.getElementById('cortes-config-modal').classList.add('is-open');
  }
  function cerrarCortesConfigModal(){
    document.getElementById('cortes-config-modal').classList.remove('is-open');
  }
  function renderCortesConfigModalContent(){
    var content = document.getElementById('cortes-config-modal-content');
    if(!content) return;
    content.innerHTML = adminConfigCortesHTML();
    bindAdminConfigCortesEvents();
  }

  // Una fila por persona con nombre asignado: su semáforo acumulado y el
  // promedio detrás de él — reemplaza la tabla vieja de puntaje por corte
  // (los cortes ya no puntúan, ver semaforoDeMiembro).
  function computeRendimientoRows(){
    var rows = [];
    state.comisiones.forEach(function(com){
      ROLES.forEach(function(r){
        var m = miembroActivo(com.id, r.key);
        if(!m || !m.nombre.trim()) return;
        var estado = semaforoDeMiembro(m.id);
        rows.push({
          miembroId: m.id, comisionSigla: com.sigla, comisionNombre: com.nombre,
          rolLabel: r.label, persona: m.nombre,
          promedio: estado.promedio, n: estado.n, semaforo: estado.key, semaforoLabel: estado.label
        });
      });
    });
    return rows;
  }

  function renderRendimientoRowsHTML(){
    var rows = computeRendimientoRows();
    if(rows.length === 0){
      return emptyState('Aún no hay mesas directivas asignadas', 'Asigna nombres en al menos una comisión para ver su rendimiento aquí.');
    }
    var q = adminBusqueda.trim().toLowerCase();
    var filtered = rows.filter(function(row){
      if(q){
        var haystack = (row.persona + ' ' + row.comisionSigla + ' ' + row.comisionNombre).toLowerCase();
        if(haystack.indexOf(q) === -1) return false;
      }
      if(adminFiltroSemaforo !== 'todos' && row.semaforo !== adminFiltroSemaforo) return false;
      return true;
    });
    if(filtered.length === 0){
      return emptyState('Sin resultados', 'Ningún miembro coincide con los filtros actuales.');
    }
    var rowsHTML = filtered.map(function(row){
      return '<tr>' +
        '<td>' + escapeHTML(row.comisionSigla) + '</td>' +
        '<td><button type="button" class="hist-link" data-hist-miembro="' + row.miembroId + '">' + escapeHTML(row.persona) + '</button> <span class="historico-meta">— ' + escapeHTML(row.rolLabel) + '</span></td>' +
        '<td><span class="semaforo-dot semaforo-' + row.semaforo + '"></span> ' + escapeHTML(row.semaforoLabel) + '</td>' +
        '<td>' + (row.promedio == null ? '—' : row.promedio + '%') + '</td>' +
        '<td>' + row.n + '</td>' +
        '</tr>';
    }).join('');
    return '<div class="admin-table-wrap"><table class="admin-table">' +
      '<thead><tr><th>Comisión</th><th>Persona</th><th>Semáforo</th><th>Promedio</th><th>Evaluaciones</th></tr></thead>' +
      '<tbody>' + rowsHTML + '</tbody></table></div>';
  }

  function adminRendimientoHTML(){
    // Un solo select: "Puntaje" quedaría redundante con "Semáforo", son las
    // mismas bandas ahora que el puntaje es el promedio detrás del semáforo.
    var semaforoOptions = [['todos','Todos'],['verde','Verde'],['amarillo','Amarillo'],['rojo','Rojo'],['gris','Sin evaluaciones']];
    return '<div class="admin-filters">' +
      '<label class="select-field admin-filter-search">Buscar' +
        '<input type="text" id="admin-buscador" class="admin-search-input" placeholder="Persona o comisión…" value="' + escapeHTML(adminBusqueda) + '">' +
      '</label>' +
      '<label class="select-field admin-filter-select">Semáforo<div class="select-wrap"><select id="admin-filtro-semaforo">' +
        semaforoOptions.map(function(o){ return '<option value="' + o[0] + '"' + (adminFiltroSemaforo === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
      '</select></div></label>' +
    '</div>' +
    '<div id="admin-rendimiento-rows">' + renderRendimientoRowsHTML() + '</div>';
  }

  function bindAdminRendimientoEvents(){
    var refreshRows = function(){
      var container = document.getElementById('admin-rendimiento-rows');
      if(container) container.innerHTML = renderRendimientoRowsHTML();
    };
    var search = document.getElementById('admin-buscador');
    if(search) search.addEventListener('input', function(e){ adminBusqueda = e.target.value; refreshRows(); });
    var selSemaforo = document.getElementById('admin-filtro-semaforo');
    if(selSemaforo) selSemaforo.addEventListener('change', function(e){ adminFiltroSemaforo = e.target.value; refreshRows(); });
  }

  function adminTablaHTML(){
    var regs = state.evaluaciones.filter(function(e){ return typeof e.puntajeTotal === 'number'; })
      .slice().sort(function(a,b){ return new Date(b.actualizado) - new Date(a.actualizado); });
    if(regs.length === 0){
      return emptyState('Aún no hay datos', 'Cuando se guarden evaluaciones en cualquier comisión, aparecerán aquí.');
    }
    var rows = regs.map(function(ev){
      var com = state.comisiones.find(function(c){ return c.id === ev.comisionId; });
      var taller = state.talleres.find(function(t){ return t.id === ev.tallerId; });
      var rolInfo = ROLES.find(function(r){ return r.key === ev.rol; });
      return '<tr>' +
        '<td>' + escapeHTML(com ? com.sigla : '—') + '</td>' +
        '<td>' + escapeHTML(taller ? (tipoLabel(taller.tipo) + ' — ' + taller.nombre) : 'Actividad eliminada') + '</td>' +
        '<td>' + escapeHTML(rolInfo ? rolInfo.label : ev.rol) + '</td>' +
        '<td><button type="button" class="hist-link" data-hist-miembro="' + ev.miembroId + '">' + escapeHTML(ev.nombreMiembro) + '</button></td>' +
        '<td>' + ev.puntajeTotal + '/100</td>' +
        '<td>' + formatFecha(ev.actualizado) + '</td>' +
        '</tr>';
    }).join('');
    return '<div class="admin-table-wrap"><table class="admin-table">' +
      '<thead><tr><th>Comisión</th><th>Actividad</th><th>Rol</th><th>Persona</th><th>Puntaje</th><th>Actualizado</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

