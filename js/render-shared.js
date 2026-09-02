'use strict';

  // Sustituir miembro (acción del Subsecretario) — un input propio en vez de
  // prompt() nativo, mismo motivo que el modal de arriba.
  var pendingSustituir = null;
  function abrirSustituirModal(comisionId, rolKey){
    var com = state.comisiones.find(function(c){ return c.id === comisionId; });
    var r = ROLES.find(function(x){ return x.key === rolKey; });
    if(!com || !r) return;
    var actual = miembroActivo(comisionId, rolKey);
    document.getElementById('sustituir-modal-body').textContent = (actual && actual.nombre)
      ? 'Reemplaza a ' + actual.nombre + ' (' + r.label + ', ' + com.sigla + '). Su historial queda archivado y consultable desde el Histórico; la persona entrante arranca sin evaluaciones.'
      : 'Asigna a alguien nuevo como ' + r.label + ' en ' + com.sigla + '.';
    var input = document.getElementById('sustituir-modal-input');
    input.value = '';
    pendingSustituir = { comisionId: comisionId, rolKey: rolKey };
    document.getElementById('sustituir-modal').classList.add('is-open');
    requestAnimationFrame(function(){ input.focus(); });
  }
  function cerrarSustituirModal(){
    document.getElementById('sustituir-modal').classList.remove('is-open');
    pendingSustituir = null;
  }
  function confirmarSustitucion(){
    if(!pendingSustituir) return;
    var nombre = document.getElementById('sustituir-modal-input').value.trim();
    if(!nombre) return;
    var actual = miembroActivo(pendingSustituir.comisionId, pendingSustituir.rolKey);
    if(actual){ actual.activo = false; actual.hasta = new Date().toISOString(); }
    state.miembros.push({
      id: uid('mb'), comisionId: pendingSustituir.comisionId, rolKey: pendingSustituir.rolKey,
      nombre: nombre, activo:true, desde:new Date().toISOString(), hasta:'', continuidad:''
    });
    rederivarRoles();
    saveState();
    updateHeaderCounter();
    toast('Miembro sustituido');
    cerrarSustituirModal();
    if(document.getElementById('view-comisiones').classList.contains('is-active')) renderComisiones();
    if(document.getElementById('view-admin').classList.contains('is-active')) renderAdmin();
  }

  function historicoDeMiembro(miembroId){
    var evs = state.evaluaciones.filter(function(e){ return e.miembroId === miembroId; }).map(function(e){
      var taller = state.talleres.find(function(t){ return t.id === e.tallerId; });
      return {
        tipo:'evaluacion', fecha: e.actualizado,
        tallerNombre: taller ? (tipoLabel(taller.tipo) + ' — ' + taller.nombre) : 'Actividad eliminada',
        puntajeTotal: e.puntajeTotal, puntajeA: e.puntajeA, puntosDim: e.puntosDim
      };
    });
    var cortes = state.cortes.filter(function(c){ return c.miembroId === miembroId; }).map(function(c){
      var corteInfo = CORTES.find(function(x){ return x.key === c.corteKey; });
      return {
        tipo:'corte', fecha: c.fecha,
        corteLabel: corteInfo ? corteInfo.label : c.corteKey,
        comentario: c.comentario, semaforoAlMomento: c.semaforoAlMomento, promedioAlMomento: c.promedioAlMomento,
        decisionSga: c.decisionSga
      };
    });
    return evs.concat(cortes).sort(function(a,b){ return new Date(b.fecha) - new Date(a.fecha); });
  }

  // hist-entry-eval/-corte marca el tipo (usado por el punto de color en
  // CSS); el comentario libre del corte va en su propia clase dedicada
  // (.hist-entry-comment, cursiva Libre Baskerville como "destacado
  // editorial") en vez de reusar .hint-text, que se usa para más de una
  // docena de textos de ayuda sin relación en toda la app.
  function historicoEntradaHTML(entrada){
    if(entrada.tipo === 'evaluacion'){
      var desglose = DIMS_MANUALES.map(function(d){
        var v = entrada.puntosDim && entrada.puntosDim[d];
        return d + ': ' + (v == null ? '—' : v) + '/' + MAX_PTS_DIM;
      }).join(', ');
      return '<div class="hist-entry hist-entry-eval">' +
        '<div class="hist-entry-head"><strong>' + escapeHTML(entrada.tallerNombre) + '</strong><span class="historico-meta">' + formatFecha(entrada.fecha) + '</span></div>' +
        '<p class="hint-text">Puntaje: ' + entrada.puntajeTotal + '/100 (A: ' + (Math.round(entrada.puntajeA * 100) / 100) + '/85, ' + desglose + ')</p>' +
        '</div>';
    }
    var decision = entrada.decisionSga && entrada.decisionSga.estado !== 'pendiente'
      ? '<span class="badge ' + (entrada.decisionSga.estado === 'continua' ? 'badge-ok">Continúa' : 'badge-danger">No continúa') + '</span>' : '';
    return '<div class="hist-entry hist-entry-corte">' +
      '<div class="hist-entry-head"><strong>' + escapeHTML(entrada.corteLabel) + ' — Subsecretaría</strong><span class="historico-meta">' + formatFecha(entrada.fecha) + '</span></div>' +
      '<p class="hint-text"><span class="semaforo-dot semaforo-' + entrada.semaforoAlMomento + '"></span> Semáforo en ese momento: ' + semaforoLabel(entrada.semaforoAlMomento) + (entrada.promedioAlMomento != null ? ' (' + entrada.promedioAlMomento + '%)' : '') + '</p>' +
      (entrada.comentario ? '<p class="hist-entry-comment">' + escapeHTML(entrada.comentario) + '</p>' : '') +
      decision +
      '</div>';
  }

  function historicoResumenHTML(miembroId, limite){
    var entradas = historicoDeMiembro(miembroId).slice(0, limite);
    if(entradas.length === 0) return '<p class="hint-text" style="margin:.75rem 0;">Sin historial todavía.</p>';
    return '<div class="hist-list hist-list-compact">' + entradas.map(historicoEntradaHTML).join('') + '</div>' +
      '<button type="button" class="hist-link" data-hist-miembro="' + miembroId + '" style="margin-top:.3rem;">Ver histórico completo →</button>';
  }

  var historicoModalMostrando = 5;
  function abrirHistoricoModal(miembroId){
    var m = miembroPorId(miembroId);
    if(!m) return;
    historicoModalMostrando = 5;
    renderHistoricoModalContent(miembroId);
    document.getElementById('historico-modal').classList.add('is-open');
  }
  function cerrarHistoricoModal(){
    document.getElementById('historico-modal').classList.remove('is-open');
  }
  function renderHistoricoModalContent(miembroId){
    var m = miembroPorId(miembroId);
    var content = document.getElementById('historico-modal-content');
    if(!m || !content) return;
    var com = state.comisiones.find(function(c){ return c.id === m.comisionId; });
    var r = ROLES.find(function(x){ return x.key === m.rolKey; });
    var todas = historicoDeMiembro(miembroId);
    var visibles = todas.slice(0, historicoModalMostrando);
    var estadoActividad = m.activo ? '' : '<p class="hint-text">Ya no está activa/o en este cargo' + (m.hasta ? ' (desde ' + formatFecha(m.hasta) + ')' : '') + '. Su historial queda archivado.</p>';
    content.innerHTML =
      '<h3>' + escapeHTML(m.nombre) + '</h3>' +
      '<p class="hint-text">' + escapeHTML(r ? r.label : m.rolKey) + (com ? ' — ' + escapeHTML(com.sigla) : '') + '</p>' +
      '<div class="semaforo-row" style="margin-top:.6rem;">' + semaforoRowInnerHTML(miembroId) + '</div>' +
      estadoActividad +
      (todas.length === 0
        ? '<p class="hint-text" style="margin-top:1rem;">Sin historial todavía.</p>'
        : '<div class="hist-list" style="margin-top:1rem;">' + visibles.map(historicoEntradaHTML).join('') + '</div>' +
          (todas.length > historicoModalMostrando ? '<button type="button" class="btn btn-secondary btn-sm" id="historico-modal-mas" style="margin-top:.6rem;">Ver más (' + (todas.length - historicoModalMostrando) + ')</button>' : ''));
    var masBtn = document.getElementById('historico-modal-mas');
    if(masBtn) masBtn.addEventListener('click', function(){ historicoModalMostrando += 5; renderHistoricoModalContent(miembroId); });
  }

