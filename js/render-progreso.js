'use strict';

  function renderProgreso(){
    var el = document.getElementById('progreso-content');
    // El EyC solo ve el progreso de su propia comisión.
    var comisionesAMostrar = isEyc()
      ? state.comisiones.filter(function(c){ return c.id === session.comisionId; })
      : state.comisiones;
    var misTalleres = isEyc()
      ? state.talleres.filter(function(t){ return t.comisionId === session.comisionId; })
      : state.talleres;
    if(misTalleres.length === 0){
      el.innerHTML = isEyc()
        ? emptyState('Aún no hay actividades', 'Agrega actividades en tu comisión (pestaña Comisiones → Actividades) para ver su progreso aquí.', 'comisiones', 'Ir a Comisiones')
        : emptyState('Aún no hay actividades', 'Entra a una comisión y agrega su primera actividad.', 'comisiones', 'Ir a Comisiones');
      return;
    }
    el.innerHTML = comisionesAMostrar.map(progresoComisionHTML).join('');
  }

  function progresoComisionHTML(com){
    var misTalleres = state.talleres.filter(function(t){ return t.comisionId === com.id; });
    var asignados = ROLES.map(function(r){ return miembroActivo(com.id, r.key); }).filter(function(m){ return m && m.nombre.trim(); });
    var totalPosible = asignados.length * misTalleres.length;
    // Solo cuenta evaluaciones de miembros ACTIVOS: si no, tras una
    // sustitución el numerador seguiría incluyendo las evaluaciones de la
    // persona saliente mientras el denominador ya solo cuenta 4 activos, y
    // el contador terminaría mostrando algo como "9/8".
    var totalHecho = state.evaluaciones.filter(function(ev){
      return ev.comisionId === com.id && typeof ev.puntajeTotal === 'number' && asignados.some(function(m){ return m.id === ev.miembroId; });
    }).length;
    var rows = misTalleres.length === 0
      ? '<p class="hint-text" style="padding:.6rem 0;">Sin actividades registradas.</p>'
      : misTalleres.map(function(t){ return progresoTallerRowHTML(com, t); }).join('');
    return '<details class="progress-card acc-box" open>' +
      '<summary>' +
        '<span><span class="progress-sigla text-gradient">' + escapeHTML(com.sigla) + '</span>' + escapeHTML(com.nombre) + '</span>' +
        '<span class="progress-count">' + totalHecho + '/' + totalPosible + '</span>' +
      '</summary>' +
      '<div class="progress-body">' + rows + '</div>' +
      '</details>';
  }

  function progresoTallerRowHTML(com, taller){
    var roleButtons = ROLES.map(function(r){
      var m = miembroActivo(com.id, r.key);
      var nombre = m ? m.nombre.trim() : '';
      var asignado = !!nombre;
      var ev = asignado && state.evaluaciones.find(function(e){ return e.tallerId === taller.id && e.miembroId === m.id; });
      var hecho = asignado && ev && typeof ev.puntajeTotal === 'number';
      var titulo = r.label + (asignado ? ' — ' + nombre : ' — sin asignar');
      return '<button type="button" class="role-star' + (hecho ? ' is-done' : '') + (!asignado ? ' is-empty' : '') + '"' +
        (asignado ? ' data-com="' + com.id + '" data-taller="' + taller.id + '" data-miembro="' + m.id + '"' : ' disabled') +
        ' title="' + escapeHTML(titulo) + '" aria-label="' + escapeHTML(titulo) + '">' +
        '<svg class="star-ic" aria-hidden="true"><use href="#star-shape"/></svg>' +
        '</button>';
    }).join('');
    return '<div class="progress-row">' +
      '<span class="progress-taller">' + escapeHTML(taller.nombre) + (taller.cerrada ? ' <span class="historico-meta">(cerrada)</span>' : '') + '</span>' +
      '<span class="progress-roles">' + roleButtons + '</span>' +
      '</div>';
  }

  // El clic sobre una estrella de progreso funciona igual en "Progreso" y en
  // "Admin" (comparten el mismo markup): salta directo a Evaluar ese taller.
  // Pasa por confirmDiscardIfDirty (antes no lo hacía: un clic aquí podía
  // tirar cambios sin guardar de otra evaluación en curso sin avisar).
  function handleProgressAreaClick(e){
    var btn = e.target.closest('.role-star');
    if(!btn || btn.disabled) return;
    var comId = btn.dataset.com, tallerId = btn.dataset.taller, miembroId = btn.dataset.miembro;
    confirmDiscardIfDirty(function(){
      comisionDetailId = comId;
      comisionDetailTab = 'evaluar';
      selTaller = tallerId;
      selMiembroId = miembroId;
      switchView('comisiones');
    });
  }

  function bindProgresoEvents(){
    document.getElementById('view-progreso').addEventListener('click', handleProgressAreaClick);
    document.getElementById('view-admin').addEventListener('click', handleProgressAreaClick);
  }

  /* ---------- Admin ---------- */
