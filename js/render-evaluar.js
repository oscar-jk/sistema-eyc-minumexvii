'use strict';

  // sí/no de un criterio + comentario. El comentario es obligatorio cuando
  // la respuesta es la DESFAVORABLE de ese criterio (ver RUBRICA.favorable
  // — B1 está redactado en negativo, así que ahí "sí" es lo desfavorable).
  function critRowHTML(item, respuestas, comentarios){
    var val = respuestas[item.id];
    var comentario = (comentarios && comentarios[item.id]) || '';
    var requerido = !!val && !esFavorable(item, val);
    var faltaComentario = requerido && !comentario.trim();
    return '<div class="crit-row">' +
      '<div class="crit-main">' +
        '<p class="crit-text">' + escapeHTML(item.texto) + '</p>' +
        '<div class="crit-toggle" role="group" aria-label="Respuesta">' +
          '<button type="button" class="seg seg-si' + (val === 'si' ? ' is-active' : '') + '" data-crit="' + item.id + '" data-val="si" aria-pressed="' + (val === 'si') + '">' +
            '<svg class="star-ic" aria-hidden="true"><use href="#star-shape"/></svg><span>Sí</span>' +
          '</button>' +
          '<button type="button" class="seg seg-no' + (val === 'no' ? ' is-active' : '') + '" data-crit="' + item.id + '" data-val="no" aria-pressed="' + (val === 'no') + '">' +
            '<span>No</span>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<input type="text" class="field-input crit-comment' + (faltaComentario ? ' is-required' : '') + '" data-comment="' + item.id + '" value="' + escapeHTML(comentario) + '" placeholder="' + (requerido ? 'Comentario obligatorio — explica por qué' : 'Comentario (opcional)') + '" aria-label="Comentario sobre este criterio">' +
      (faltaComentario ? '<p class="crit-required-hint">Esta respuesta requiere un comentario.</p>' : '') +
      '</div>';
  }

  // Qué falta en una dimensión para considerarla completa: todos sus
  // criterios respondidos, comentario donde la respuesta lo exige, y (para
  // B/D/E/F) puntos manuales asignados — 0 cuenta como asignado, lo que
  // falta es la ausencia de valor (puntosDim[dim] === null).
  function dimensionEstado(dim, respuestas, comentarios, puntosDim){
    var itemsFaltantes = dim.items.filter(function(i){ return !respuestas[i.id]; });
    var comentariosFaltantes = dim.items.filter(function(i){
      var val = respuestas[i.id];
      return val && !esFavorable(i, val) && !((comentarios[i.id] || '').trim());
    });
    var faltaPuntos = dim.dim !== 'A' && (puntosDim[dim.dim] === null || puntosDim[dim.dim] === undefined || puntosDim[dim.dim] === '');
    return {
      completa: itemsFaltantes.length === 0 && comentariosFaltantes.length === 0 && !faltaPuntos,
      itemsFaltantes: itemsFaltantes, comentariosFaltantes: comentariosFaltantes, faltaPuntos: faltaPuntos
    };
  }

  function dimensionAccordionHTML(dim, respuestas, comentarios, puntosDim, defaultOpen){
    var estado = dimensionEstado(dim, respuestas, comentarios, puntosDim);
    var chip = '<span class="badge ' + (estado.completa ? 'badge-ok">Completa' : 'badge-pending">Falta') + '</span>';
    var puntosHTML = '';
    if(dim.dim !== 'A'){
      var v = puntosDim[dim.dim];
      var vNum = (v === null || v === undefined || v === '') ? null : Number(v);
      puntosHTML = '<div class="dim-puntos">' +
        '<div class="dim-puntos-head"><span>Puntos asignados</span><span class="dim-puntos-valor">' + (vNum === null ? '— / ' + MAX_PTS_DIM : vNum + ' / ' + MAX_PTS_DIM) + '</span></div>' +
        '<input type="range" min="0" max="' + MAX_PTS_DIM + '" step="0.25" value="' + (vNum === null ? 0 : vNum) + '" data-puntos-dim="' + dim.dim + '" aria-label="Puntos de ' + escapeHTML(dim.titulo) + '">' +
        '</div>';
    }
    return '<details class="dim-accordion acc-box"' + (defaultOpen ? ' open' : '') + ' data-dim="' + dim.dim + '">' +
      '<summary><span class="dim-accordion-title"><span class="dimension-letter text-gradient">' + dim.dim + '</span>' + escapeHTML(dim.titulo) + '</span>' + chip + '</summary>' +
      '<div class="dim-accordion-body">' + puntosHTML + dim.items.map(function(item){ return critRowHTML(item, respuestas, comentarios); }).join('') + '</div>' +
      '</details>';
  }

  // Acordeón: una dimensión abierta a la vez (la primera incompleta) en vez
  // de las 5 desplegadas de golpe — menos scroll, y la cabecera de cada una
  // ya dice si está completa sin tener que abrirla.
  function dimensionesAccordionHTML(respuestas, comentarios, puntosDim, dimAbierta){
    return RUBRICA.map(function(dim){ return dimensionAccordionHTML(dim, respuestas, comentarios, puntosDim, dim.dim === dimAbierta); }).join('');
  }

  // Refresca chips, botones activos, aviso de comentario obligatorio y el
  // valor de los sliders SIN reconstruir los <input> — reconstruirlos
  // perdería el foco del comentario a medio escribir y cortaría un slider a
  // medio arrastrar.
  function refreshRubricaUI(container){
    RUBRICA.forEach(function(dim){
      var det = container.querySelector('.dim-accordion[data-dim="' + dim.dim + '"]');
      if(!det) return;
      var estado = dimensionEstado(dim, currentRespuestas, currentComentarios, currentPuntosDim);
      var chip = det.querySelector('.badge');
      if(chip){
        chip.textContent = estado.completa ? 'Completa' : 'Falta';
        chip.className = 'badge ' + (estado.completa ? 'badge-ok' : 'badge-pending');
      }
      var valorEl = det.querySelector('.dim-puntos-valor');
      if(valorEl){
        var v = currentPuntosDim[dim.dim];
        valorEl.textContent = (v === null || v === undefined || v === '') ? '— / ' + MAX_PTS_DIM : v + ' / ' + MAX_PTS_DIM;
      }
      dim.items.forEach(function(item){
        var val = currentRespuestas[item.id];
        var siBtn = det.querySelector('.seg-si[data-crit="' + item.id + '"]');
        var noBtn = det.querySelector('.seg-no[data-crit="' + item.id + '"]');
        if(siBtn){ siBtn.classList.toggle('is-active', val === 'si'); siBtn.setAttribute('aria-pressed', val === 'si'); }
        if(noBtn){ noBtn.classList.toggle('is-active', val === 'no'); noBtn.setAttribute('aria-pressed', val === 'no'); }
        var commentInput = det.querySelector('.crit-comment[data-comment="' + item.id + '"]');
        if(commentInput){
          var requerido = !!val && !esFavorable(item, val);
          var faltaComentario = requerido && !(currentComentarios[item.id] || '').trim();
          commentInput.classList.toggle('is-required', faltaComentario);
          commentInput.placeholder = requerido ? 'Comentario obligatorio — explica por qué' : 'Comentario (opcional)';
          var hint = commentInput.nextElementSibling;
          var hasHint = hint && hint.classList.contains('crit-required-hint');
          if(faltaComentario && !hasHint) commentInput.insertAdjacentHTML('afterend', '<p class="crit-required-hint">Esta respuesta requiere un comentario.</p>');
          else if(!faltaComentario && hasHint) hint.remove();
        }
      });
    });
    var progressEl = container.querySelector('.rubrica-progress');
    if(progressEl) progressEl.textContent = Object.keys(currentRespuestas).length + '/' + TOTAL_CRIT + ' respondidos';
  }

  function bindCritToggles(container, formId){
    function afterChange(){
      if(formId) markDirty(formId);
      var bar = container.querySelector('.sticky-save-bar');
      if(bar) bar.classList.add('is-dirty');
      refreshRubricaUI(container);
    }
    var btns = container.querySelectorAll('.seg');
    for(var i=0;i<btns.length;i++){
      btns[i].addEventListener('click', function(e){
        var btn = e.currentTarget;
        var critId = btn.dataset.crit;
        var val = btn.dataset.val;
        if(currentRespuestas[critId] === val){ delete currentRespuestas[critId]; }
        else{ currentRespuestas[critId] = val; }
        afterChange();
      });
    }
    var comentarioInputs = container.querySelectorAll('.crit-comment');
    for(var j=0;j<comentarioInputs.length;j++){
      comentarioInputs[j].addEventListener('input', function(e){
        currentComentarios[e.target.dataset.comment] = e.target.value;
        afterChange();
      });
    }
    var puntosInputs = container.querySelectorAll('[data-puntos-dim]');
    for(var k=0;k<puntosInputs.length;k++){
      puntosInputs[k].addEventListener('input', function(e){
        currentPuntosDim[e.target.dataset.puntosDim] = Number(e.target.value);
        afterChange();
      });
    }
  }

  function mountEvaluarSubtab(com, container){
    var misTalleres = state.talleres.filter(function(t){ return t.comisionId === com.id; });
    if(misTalleres.length === 0){
      container.innerHTML = emptyStateSubtab('Primero agrega una actividad', 'Necesitas al menos una actividad de esta comisión para poder evaluar.', 'talleres', 'Ir a Actividades');
      return;
    }
    var asignados = ROLES.map(function(r){ return miembroActivo(com.id, r.key); }).filter(function(m){ return m && m.nombre.trim(); });
    if(asignados.length === 0){
      container.innerHTML = emptyStateSubtab('Primero asigna la mesa directiva', 'Necesitas al menos un miembro con nombre asignado para poder evaluar.', 'mesa', 'Ir a Mesa directiva');
      return;
    }
    if(!selTaller || !misTalleres.find(function(t){ return t.id === selTaller; })) selTaller = misTalleres[0].id;
    if(!selMiembroId || !asignados.find(function(m){ return m.id === selMiembroId; })) selMiembroId = asignados[0].id;

    container.innerHTML =
      '<div class="evaluar-selectors">' +
        '<label class="select-field">Actividad<div class="select-wrap"><select id="sel-taller">' +
          misTalleres.map(function(t){ return '<option value="' + t.id + '"' + (t.id === selTaller ? ' selected' : '') + '>' + escapeHTML(tipoLabel(t.tipo)) + ' — ' + escapeHTML(t.nombre) + (t.cerrada ? ' (cerrada)' : '') + '</option>'; }).join('') +
        '</select></div></label>' +
        '<label class="select-field">Miembro de la mesa<div class="select-wrap"><select id="sel-miembro">' +
          asignados.map(function(m){ var r = ROLES.find(function(x){ return x.key === m.rolKey; }); return '<option value="' + m.id + '"' + (m.id === selMiembroId ? ' selected' : '') + '>' + escapeHTML(r ? r.label : m.rolKey) + ' — ' + escapeHTML(m.nombre) + '</option>'; }).join('') +
        '</select></div></label>' +
      '</div>' +
      '<div id="rubrica-container"></div>';

    document.getElementById('sel-taller').addEventListener('change', function(e){
      var prev = selTaller, target = e.target;
      confirmDiscardIfDirty(function(){
        selTaller = target.value;
        renderRubrica(com);
      }, function(){ target.value = prev; });
    });
    document.getElementById('sel-miembro').addEventListener('change', function(e){
      var prev = selMiembroId, target = e.target;
      confirmDiscardIfDirty(function(){
        selMiembroId = target.value;
        renderRubrica(com);
      }, function(){ target.value = prev; });
    });

    renderRubrica(com);
  }

  function renderRubrica(com){
    var container = document.getElementById('rubrica-container');
    if(!container) return;
    var taller = state.talleres.find(function(t){ return t.id === selTaller && t.comisionId === com.id; });
    var miembro = miembroPorId(selMiembroId);
    if(!taller || !miembro || !miembro.nombre.trim()){
      container.innerHTML = '<p class="hint-text">Selecciona una actividad y un miembro con nombre asignado para comenzar.</p>';
      return;
    }
    var existing = state.evaluaciones.find(function(e){ return e.comisionId === com.id && e.tallerId === selTaller && e.miembroId === selMiembroId; });
    currentRespuestas = existing ? Object.assign({}, existing.respuestas) : {};
    currentComentarios = existing ? Object.assign({}, existing.comentarios || {}) : {};
    currentPuntosDim = Object.assign({ B:null, D:null, E:null, F:null }, existing ? existing.puntosDim : {});
    var respondidos = Object.keys(currentRespuestas).length;
    var rolInfo = ROLES.find(function(r){ return r.key === miembro.rolKey; });
    var dimIncompleta = RUBRICA.find(function(d){ return !dimensionEstado(d, currentRespuestas, currentComentarios, currentPuntosDim).completa; });
    var dimAbierta = (dimIncompleta || RUBRICA[0]).dim;

    container.innerHTML =
      '<div class="rubrica-head">' +
        '<div>' +
          '<p class="rubrica-breadcrumb">' + escapeHTML(tipoLabel(taller.tipo)) + ' — ' + escapeHTML(taller.nombre) + (oradoresLabel(com, taller) ? ' · Orador(es): ' + escapeHTML(oradoresLabel(com, taller)) : '') + '</p>' +
          '<h2 class="rubrica-title">' + escapeHTML(miembro.nombre) + ' <span class="rubrica-rol">— ' + escapeHTML(rolInfo ? rolInfo.label : miembro.rolKey) + '</span></h2>' +
        '</div>' +
        '<span class="rubrica-progress">' + respondidos + '/' + TOTAL_CRIT + ' respondidos</span>' +
      '</div>' +
      dimensionesAccordionHTML(currentRespuestas, currentComentarios, currentPuntosDim, dimAbierta) +
      '<p class="hint-text" style="margin-top:.9rem;">' + (existing ? 'Última actualización: ' + formatFecha(existing.actualizado) + ' · Puntaje guardado: ' + existing.puntajeTotal + '/100' : 'Aún no se ha guardado esta evaluación.') + '</p>' +
      '<div class="sticky-save-bar" id="evaluar-save-bar">' +
        '<button type="button" class="btn btn-primary" id="btn-guardar-evaluacion" style="width:100%;">Guardar evaluación</button>' +
      '</div>';

    container.querySelector('#btn-guardar-evaluacion').addEventListener('click', function(){ handleGuardarEvaluacion(com); });
    bindCritToggles(container, 'evaluar');
  }

  function handleGuardarEvaluacion(com){
    var miembro = miembroPorId(selMiembroId);
    if(!selTaller || !miembro) return;
    var dimFaltante = RUBRICA.find(function(d){ return !dimensionEstado(d, currentRespuestas, currentComentarios, currentPuntosDim).completa; });
    if(dimFaltante){
      var container = document.getElementById('rubrica-container');
      var det = container && container.querySelector('.dim-accordion[data-dim="' + dimFaltante.dim + '"]');
      if(det){ det.open = true; det.scrollIntoView({ block:'center', behavior:'smooth' }); }
      toast('Faltan datos en "' + dimFaltante.titulo + '" antes de poder guardar.', 'error');
      return;
    }
    var puntajeA = calcPuntajeA(currentRespuestas);
    var puntajeTotal = computePuntaje(currentRespuestas, currentPuntosDim);
    dataService.guardarEvaluacion({
      comisionId: com.id, tallerId: selTaller, miembroId: selMiembroId,
      rol: miembro.rolKey, nombreMiembro: miembro.nombre,
      respuestas: Object.assign({}, currentRespuestas),
      comentarios: Object.assign({}, currentComentarios),
      puntosDim: Object.assign({}, currentPuntosDim),
      puntajeA: puntajeA, puntajeTotal: puntajeTotal
    });
    clearDirty('evaluar');
    updateHeaderCounter();
    toast('Evaluación guardada — ' + puntajeTotal + '/100');
    renderRubrica(com);
  }

  /* ---------- Cortes ----------
     Un corte ya NO es otra rúbrica: es un checkpoint del Subsecretario, que
     ve el histórico y el semáforo vigente del voluntario y escribe un
     comentario sobre su proceso. El comentario es obligatorio si el
     semáforo está en amarillo o rojo (ahí el caso pasa a revisión del SG);
     opcional si está en verde. */
  function mountCortesSubtab(com, container){
    var asignados = ROLES.map(function(r){ return miembroActivo(com.id, r.key); }).filter(function(m){ return m && m.nombre.trim(); });
    if(asignados.length === 0){
      container.innerHTML = emptyStateSubtab('Primero asigna la mesa directiva', 'Necesitas al menos un miembro con nombre asignado para poder registrar cortes.', 'mesa', 'Ir a Mesa directiva');
      return;
    }
    if(!selCorteTipo || !CORTES.find(function(c){ return c.key === selCorteTipo; })) selCorteTipo = CORTES[0].key;
    if(!selMiembroId || !asignados.find(function(m){ return m.id === selMiembroId; })) selMiembroId = asignados[0].id;

    container.innerHTML =
      '<div class="evaluar-selectors">' +
        '<label class="select-field">Corte<div class="select-wrap"><select id="sel-corte">' +
          CORTES.map(function(c){ return '<option value="' + c.key + '"' + (c.key === selCorteTipo ? ' selected' : '') + '>' + escapeHTML(c.label) + ' — ' + escapeHTML(c.desc) + '</option>'; }).join('') +
        '</select></div></label>' +
        '<label class="select-field">Miembro de la mesa<div class="select-wrap"><select id="sel-miembro-corte">' +
          asignados.map(function(m){ var r = ROLES.find(function(x){ return x.key === m.rolKey; }); return '<option value="' + m.id + '"' + (m.id === selMiembroId ? ' selected' : '') + '>' + escapeHTML(r ? r.label : m.rolKey) + ' — ' + escapeHTML(m.nombre) + '</option>'; }).join('') +
        '</select></div></label>' +
      '</div>' +
      '<div id="corte-checkpoint-container"></div>';

    document.getElementById('sel-corte').addEventListener('change', function(e){
      var prev = selCorteTipo, target = e.target;
      confirmDiscardIfDirty(function(){ selCorteTipo = target.value; renderCorteCheckpoint(com); }, function(){ target.value = prev; });
    });
    document.getElementById('sel-miembro-corte').addEventListener('change', function(e){
      var prev = selMiembroId, target = e.target;
      confirmDiscardIfDirty(function(){ selMiembroId = target.value; renderCorteCheckpoint(com); }, function(){ target.value = prev; });
    });

    renderCorteCheckpoint(com);
  }

  var currentCorteComentario = '';

  function renderCorteCheckpoint(com){
    var container = document.getElementById('corte-checkpoint-container');
    if(!container) return;
    var miembro = miembroPorId(selMiembroId);
    var corteInfo = CORTES.find(function(c){ return c.key === selCorteTipo; });
    if(!miembro || !corteInfo){
      container.innerHTML = '<p class="hint-text">Selecciona un corte y un miembro con nombre asignado para comenzar.</p>';
      return;
    }
    if(!corteFaseActiva(selCorteTipo)){
      container.innerHTML = '<p class="hint-text">La fase de este corte todavía no comienza (se configura en Monitoreo → Fases de los cortes).</p>';
      return;
    }
    var existing = state.cortes.find(function(c){ return c.miembroId === selMiembroId && c.corteKey === selCorteTipo; });
    currentCorteComentario = existing ? existing.comentario : '';
    var estado = semaforoDeMiembro(selMiembroId);
    var requiereComentario = estado.key === 'amarillo' || estado.key === 'rojo';
    var soloLectura = !!(existing && existing.decisionSga && existing.decisionSga.estado !== 'pendiente');
    var rolInfo = ROLES.find(function(r){ return r.key === miembro.rolKey; });
    var decisionHTML = (existing && existing.decisionSga && existing.decisionSga.estado !== 'pendiente')
      ? '<p class="hint-text">Decisión del Secretario General: <span class="badge ' + (existing.decisionSga.estado === 'continua' ? 'badge-ok">Continúa' : 'badge-danger">No continúa') + '</span>' + (existing.decisionSga.comentario ? ' — ' + escapeHTML(existing.decisionSga.comentario) : '') + '</p>'
      : '';

    container.innerHTML =
      '<div class="rubrica-head">' +
        '<div>' +
          '<p class="rubrica-breadcrumb">' + escapeHTML(corteInfo.label) + ' — ' + escapeHTML(corteInfo.desc) + '</p>' +
          '<h2 class="rubrica-title">' + escapeHTML(miembro.nombre) + ' <span class="rubrica-rol">— ' + escapeHTML(rolInfo ? rolInfo.label : miembro.rolKey) + '</span></h2>' +
        '</div>' +
      '</div>' +
      '<div class="semaforo-row">' + semaforoRowInnerHTML(selMiembroId) + '</div>' +
      historicoResumenHTML(selMiembroId, 3) +
      '<label class="role-field" style="margin-top:1rem;">' +
        '<span class="role-label">Comentario del corte' + (requiereComentario ? ' (obligatorio — semáforo: ' + estado.label + ')' : ' (opcional)') + '</span>' +
        '<textarea class="field-input" id="corte-comentario" rows="4" placeholder="' + (requiereComentario ? 'Explica el seguimiento — este voluntario pasará a revisión del Secretario General.' : 'Comentario sobre el proceso de este voluntario (opcional).') + '"' + (soloLectura ? ' disabled' : '') + '>' + escapeHTML(currentCorteComentario) + '</textarea>' +
      '</label>' +
      (existing ? '<p class="hint-text">Último corte guardado: ' + formatFecha(existing.fecha) + '.</p>' : '') +
      decisionHTML +
      (soloLectura
        ? '<p class="hint-text">El Secretario General ya decidió sobre este caso — el corte queda de solo lectura.</p>'
        : '<div class="rubrica-footer"><span class="hint-text"></span><button type="button" class="btn btn-primary" id="btn-guardar-corte">Guardar corte</button></div>');

    if(!soloLectura){
      var textarea = container.querySelector('#corte-comentario');
      textarea.addEventListener('input', function(e){ currentCorteComentario = e.target.value; markDirty('cortes'); });
      container.querySelector('#btn-guardar-corte').addEventListener('click', function(){ handleGuardarCorte(com); });
    }
  }

  function handleGuardarCorte(com){
    var miembro = miembroPorId(selMiembroId);
    if(!miembro || !selCorteTipo) return;
    var estado = semaforoDeMiembro(selMiembroId);
    var requiereComentario = estado.key === 'amarillo' || estado.key === 'rojo';
    if(requiereComentario && !currentCorteComentario.trim()){
      toast('Semáforo: ' + estado.label + ' — el comentario es obligatorio.', 'error');
      var textarea = document.getElementById('corte-comentario');
      if(textarea) textarea.focus();
      return;
    }
    dataService.guardarCorte({
      comisionId: com.id, miembroId: selMiembroId, rolKey: miembro.rolKey, corteKey: selCorteTipo,
      comentario: currentCorteComentario.trim(),
      semaforoAlMomento: estado.key, promedioAlMomento: estado.promedio,
      requiereRevision: requiereComentario
    });
    clearDirty('cortes');
    updateHeaderCounter();
    toast(requiereComentario ? 'Corte guardado — pasa a revisión del Secretario General' : 'Corte guardado');
    renderCorteCheckpoint(com);
  }

  /* ---------- Histórico de voluntario ----------
     Fuente única para el checkpoint de corte, el modal completo y donde
     haga falta: mezcla evaluaciones de taller y comentarios de corte de un
     miembro, más reciente primero. */
