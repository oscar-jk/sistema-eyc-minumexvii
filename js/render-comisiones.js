'use strict';

  function renderComisiones(){
    var el = document.getElementById('comisiones-content');
    var desc = document.getElementById('comisiones-desc');
    // El EyC está atado a la comisión de su sesión: no hay grilla, entra
    // directo y no puede "volver" a ver las demás.
    if(isEyc() && !comisionDetailId) comisionDetailId = session.comisionId;
    if(comisionDetailId){
      var com = currentComision();
      if(!com){
        comisionDetailId = null;
        if(!isEyc()){ renderComisiones(); return; }
        el.innerHTML = emptyState('Comisión no encontrada', 'Tu sesión no corresponde a ninguna comisión válida. Cierra sesión e inténtalo de nuevo.');
        return;
      }
      desc.textContent = 'Mesa directiva, actividades, evaluaciones e histórico de esta comisión.';
      el.innerHTML = comisionDetailShellHTML(com);
      renderComisionSubtabContent(com);
      return;
    }
    desc.textContent = 'Elige una comisión para entrar: ahí configuras su mesa directiva, sus actividades y las evaluaciones.';
    el.innerHTML = '<div class="comision-grid">' + state.comisiones.map(comisionTileHTML).join('') + '</div>';
  }

  function comisionTileHTML(com){
    var asignados = ROLES.filter(function(r){ return (com.roles[r.key] || '').trim(); }).length;
    return '<button type="button" class="comision-tile" data-id="' + com.id + '">' +
      '<span class="access-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 18v-7"></path><path d="M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z"></path><path d="M14 18v-7"></path><path d="M18 18v-7"></path><path d="M3 22h18"></path><path d="M6 18v-7"></path></svg></span>' +
      '<span class="comision-sigla text-gradient">' + escapeHTML(com.sigla) + '</span>' +
      '<span class="comision-tile-nombre title-long">' + escapeHTML(com.nombre) + '</span>' +
      '<span class="comision-tile-meta">' + asignados + '/4 roles asignados</span>' +
      '<span class="access-cta comision-tile-cta">Abrir <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg></span>' +
      '</button>';
  }

  function comisionDetailShellHTML(com){
    var tabs = [
      { key:'mesa', label:'Mesa directiva' },
      { key:'talleres', label:'Actividades' },
      { key:'evaluar', label:'Evaluar' },
      { key:'historico', label:'Histórico' }
    ];
    if(canSeeCortes()){
      tabs.splice(3, 0, { key:'cortes', label:'Cortes' });
    }
    var backLink = isEyc() ? '' : '<button type="button" class="back-link" id="btn-comision-back">&larr; Todas las comisiones</button>';
    return backLink +
      '<div class="comision-detail-head">' +
        '<span class="comision-sigla text-gradient">' + escapeHTML(com.sigla) + '</span>' +
        '<h2 class="comision-detail-title title-long"><svg class="heading-star" aria-hidden="true"><use href="#' + comisionHeadingStar(com) + '"></use></svg>' + escapeHTML(com.nombre) + '</h2>' +
      '</div>' +
      '<nav class="subtabs" role="tablist" aria-label="Secciones de la comisión">' +
        tabs.map(function(tb){
          return '<button type="button" class="subtab-btn' + (comisionDetailTab === tb.key ? ' is-active' : '') + '" data-subtab="' + tb.key + '" role="tab" aria-selected="' + (comisionDetailTab === tb.key) + '">' + tb.label + '</button>';
        }).join('') +
      '</nav>' +
      '<div id="comision-subtab-content" class="card"></div>';
  }

  function renderComisionSubtabContent(com){
    var container = document.getElementById('comision-subtab-content');
    if(!container) return;
    if(comisionDetailTab === 'cortes' && !canSeeCortes()) comisionDetailTab = 'mesa';
    if(comisionDetailTab === 'mesa'){
      container.innerHTML = mesaHTML(com);
    }else if(comisionDetailTab === 'talleres'){
      container.innerHTML = talleresSubtabHTML(com);
    }else if(comisionDetailTab === 'evaluar'){
      mountEvaluarSubtab(com, container);
    }else if(comisionDetailTab === 'cortes'){
      mountCortesSubtab(com, container);
    }else if(comisionDetailTab === 'historico'){
      container.innerHTML = historicoHTML(com);
      bindHistoricoEvents(com);
    }
  }

  function mesaHTML(com){
    // El EyC edita (rename = corrección de tipeo, ver save-mesa). Cualquier
    // otro rol (Subse/SG navegando) la ve de solo lectura, con el semáforo
    // vigente de cada persona y, para el Subsecretario, el botón para
    // sustituirla — la única vía real de reemplazo.
    if(!isEyc()){
      var rowsRO = ROLES.map(function(r){
        var m = miembroActivo(com.id, r.key);
        var nombre = m && m.nombre ? m.nombre.trim() : '';
        var nombreHTML = nombre
          ? '<button type="button" class="hist-link miembro-row-ro-nombre" data-hist-miembro="' + m.id + '">' + escapeHTML(nombre) + '</button>'
          : '<span class="hint-text">Vacante</span>';
        var semaforoHTML = nombre
          ? '<div class="semaforo-row" style="border:none;padding:0;margin:.2rem 0 0;">' + semaforoRowInnerHTML(m.id) + '</div>' : '';
        var accion = isSubse()
          ? '<button type="button" class="btn btn-secondary btn-sm" data-action="sustituir-miembro" data-com="' + com.id + '" data-rol="' + r.key + '">' + (nombre ? 'Sustituir' : 'Asignar') + '</button>'
          : '';
        return '<div class="miembro-row-ro">' +
          '<div class="miembro-row-ro-main"><span class="role-label">' + escapeHTML(r.label) + '</span>' + nombreHTML + semaforoHTML + '</div>' +
          accion +
          '</div>';
      }).join('');
      return '<div class="comision-roles comision-roles-ro">' + rowsRO + '</div>';
    }
    var asignados = ROLES.filter(function(r){ return (com.roles[r.key] || '').trim(); }).length;
    var fields = ROLES.map(function(r){
      return '<label class="role-field">' +
        '<span class="role-label">' + escapeHTML(r.label) + '</span>' +
        '<input type="text" class="field-input" data-role="' + r.key + '" value="' + escapeHTML(com.roles[r.key] || '') + '" placeholder="Nombre completo">' +
        '</label>';
    }).join('');
    // Sólo se muestra mientras falte al menos un cargo: orienta a quien
    // llega por primera vez sin cubrir la pantalla de texto una vez que
    // la comisión ya quedó armada.
    var intro = asignados < ROLES.length
      ? '<p class="hint-text" style="margin-bottom:1rem;">Escribe el nombre completo de quien ocupa cada cargo. Puedes guardar aunque falten algunos — vuelves luego y completas el resto. <strong>' + asignados + ' de ' + ROLES.length + '</strong> cargos asignados.</p>'
      : '';
    // El hint de "renombrar corrige un error de tipeo" sólo tiene sentido
    // cuando YA hay alguien en el cargo (edición). Mostrarlo sobre un
    // formulario recién en blanco confunde más de lo que ayuda.
    var saveHint = asignados > 0
      ? 'Renombrar corrige un error de tipeo. Si la persona cambió, pide a Subsecretaría que la sustituya desde Monitoreo — así su historial no se mezcla con el de la nueva.'
      : 'Podrás editar estos nombres cuando quieras — no es necesario completarlos todos de una vez.';
    return intro + '<div class="comision-roles">' + fields + '</div>' +
      '<div class="form-save-bar form-save-bar-sticky">' +
        '<button type="button" class="btn btn-primary row-save-btn" data-action="save-mesa">Guardar mesa directiva</button>' +
        '<span class="form-save-hint">' + saveHint + '</span>' +
      '</div>';
  }

  function talleresSubtabHTML(com){
    var misTalleres = state.talleres.filter(function(t){ return t.comisionId === com.id; });
    var addBar = '<div class="add-bar"><button type="button" class="btn btn-primary" id="btn-add-taller">+ Nueva actividad</button></div>';
    if(misTalleres.length === 0){
      return addBar + emptyState('Aún no hay actividades', 'Agrega la primera actividad de esta comisión (taller, encuentro, reunión, etc.).');
    }
    return addBar + '<div class="taller-list">' + misTalleres.map(function(t){ return tallerRowHTML(t, com); }).join('') + '</div>';
  }

  // taller.oradores guarda IDs de miembro (no role keys): así una actividad
  // pasada sigue mostrando a quien realmente habló, aunque después se
  // sustituya a esa persona en su cargo.
  function oradoresKeys(taller){
    return Array.isArray(taller.oradores) ? taller.oradores : [];
  }

  function oradoresLabel(com, taller){
    var nombres = oradoresKeys(taller).map(function(id){ return nombreDeMiembro(id); }).filter(Boolean);
    return nombres.join(', ');
  }

  // Widget de oradores: chips de los ya elegidos (con quitar) + un select
  // para agregar uno más de los que falten (solo miembros activos). La
  // selección "en curso" vive en data-selected del contenedor hasta que se
  // pulsa "Guardar actividad".
  function oradoresWidgetHTML(com, selectedIds){
    var asignados = ROLES.map(function(r){ return miembroActivo(com.id, r.key); }).filter(function(m){ return m && m.nombre.trim(); });
    var chips = selectedIds.map(function(id){
      var m = miembroPorId(id);
      if(!m) return '';
      var r = ROLES.find(function(x){ return x.key === m.rolKey; });
      return '<span class="orador-chip">' + escapeHTML(m.nombre) +
        ' <span class="historico-meta">— ' + escapeHTML(r ? r.label : m.rolKey) + '</span>' +
        '<button type="button" class="orador-chip-remove" data-remove-orador="' + id + '" aria-label="Quitar ' + escapeHTML(m.nombre) + '">×</button></span>';
    }).join('') || '<span class="hint-text">Ninguno seleccionado.</span>';
    var restantes = asignados.filter(function(m){ return selectedIds.indexOf(m.id) === -1; });
    var addSelect = restantes.length === 0 ? '' :
      '<div class="select-wrap oradores-add-wrap"><select class="oradores-add-select" aria-label="Agregar orador">' +
        '<option value="">+ Agregar orador…</option>' +
        restantes.map(function(m){ var r = ROLES.find(function(x){ return x.key === m.rolKey; }); return '<option value="' + m.id + '">' + escapeHTML(r ? r.label : m.rolKey) + ' — ' + escapeHTML(m.nombre) + '</option>'; }).join('') +
      '</select></div>';
    return '<div class="oradores-chips">' + chips + '</div>' + addSelect;
  }

  // Miembros activos de la mesa que todavía no tienen evaluación guardada
  // para este taller — bloquea "Cerrar actividad" mientras la lista no esté
  // vacía, y ofrece saltar directo a evaluar a cada quien falte.
  function miembrosPendientesEnTaller(com, taller){
    var asignados = ROLES.map(function(r){ return miembroActivo(com.id, r.key); }).filter(function(m){ return m && m.nombre.trim(); });
    return asignados.filter(function(m){
      return !state.evaluaciones.some(function(ev){ return ev.tallerId === taller.id && ev.miembroId === m.id && typeof ev.puntajeTotal === 'number'; });
    });
  }

  function tallerRowHTML(t, com){
    var tipoActual = t.tipo || 'taller';
    var cerrada = !!t.cerrada;
    var tipoOptions = TIPOS_ACTIVIDAD.map(function(ti){
      return '<option value="' + ti.key + '"' + (ti.key === tipoActual ? ' selected' : '') + '>' + escapeHTML(ti.label) + '</option>';
    }).join('');
    var oradoresSeleccionados = oradoresKeys(t);
    return '<div class="taller-row' + (cerrada ? ' is-cerrada' : '') + '" data-id="' + t.id + '">' +
      (cerrada ? '<span class="badge badge-neutral" style="align-self:flex-start;">Cerrada</span>' : '') +
      '<div class="taller-row-fields">' +
        '<div class="select-wrap taller-tipo-wrap"><select data-field="tipo" aria-label="Tipo de actividad"' + (cerrada ? ' disabled' : '') + '>' + tipoOptions + '</select></div>' +
        '<input type="text" class="field-input" data-field="nombre" value="' + escapeHTML(t.nombre) + '" placeholder="Nombre o descripción de la actividad" aria-label="Nombre de la actividad"' + (cerrada ? ' disabled' : '') + '>' +
        '<input type="date" data-field="fecha" value="' + escapeHTML(t.fecha || '') + '" aria-label="Fecha de la actividad"' + (cerrada ? ' disabled' : '') + '>' +
        (cerrada ? '' :
          '<button type="button" class="icon-btn" data-action="del-taller" title="Eliminar actividad" aria-label="Eliminar actividad">' +
            '<svg viewBox="0 0 24 24" class="trash-ic" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '</button>') +
      '</div>' +
      '<div class="taller-oradores-field" data-oradores-holder data-selected="' + escapeHTML(JSON.stringify(oradoresSeleccionados)) + '">' +
        '<span class="role-label">Orador(es)</span>' +
        oradoresWidgetHTML(com, oradoresSeleccionados) +
      '</div>' +
      '<div class="taller-cierre-aviso" data-cierre-aviso></div>' +
      '<div class="form-save-bar">' +
        (cerrada ? '' : '<button type="button" class="btn btn-primary row-save-btn" data-action="save-taller">Guardar actividad</button>') +
        '<span class="form-save-hint">' + (cerrada ? 'Actividad cerrada — reábrela para editarla o registrar más evaluaciones.' : 'Los cambios no se guardan hasta que toques "Guardar".') + '</span>' +
        '<button type="button" class="btn btn-secondary btn-sm" data-action="toggle-cerrar-taller">' + (cerrada ? 'Reabrir actividad' : 'Cerrar actividad') + '</button>' +
      '</div>' +
      '</div>';
  }

  // Lista de evaluaciones de la comisión (para navegar de vuelta a Evaluar).
  // Cada fila es una evaluación puntual, no el promedio de una persona, así
  // que se filtra por su propio puntaje — el semáforo (que sí es por
  // persona) se ve completo en el modal de histórico de cada quien.
  function historicoHTML(com){
    var hasRegs = state.evaluaciones.some(function(e){ return e.comisionId === com.id; });
    if(!hasRegs){
      return emptyState('Aún no hay historial', 'Cuando se guarde una evaluación de esta comisión, aparecerá aquí.');
    }
    var puntajeOptions = [['todos','Todos'],['alto','80–100'],['medio','50–79'],['bajo','0–49']];
    return '<div class="admin-filters">' +
      '<label class="select-field admin-filter-search">Buscar' +
        '<input type="text" id="historico-buscador" class="admin-search-input" placeholder="Persona o actividad…" value="' + escapeHTML(historicoBusqueda) + '">' +
      '</label>' +
      '<label class="select-field admin-filter-select">Puntaje<div class="select-wrap"><select id="historico-filtro-puntaje">' +
        puntajeOptions.map(function(o){ return '<option value="' + o[0] + '"' + (historicoFiltroPuntaje === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
      '</select></div></label>' +
    '</div>' +
    '<div id="historico-rows">' + historicoRowsHTML(com) + '</div>';
  }

  function historicoRowsHTML(com){
    var regs = state.evaluaciones.filter(function(e){ return e.comisionId === com.id && typeof e.puntajeTotal === 'number'; });
    var q = historicoBusqueda.trim().toLowerCase();
    var filtered = regs.filter(function(ev){
      var taller = state.talleres.find(function(t){ return t.id === ev.tallerId; });
      var rolInfo = ROLES.find(function(r){ return r.key === ev.rol; });
      if(q){
        var haystack = (ev.nombreMiembro + ' ' + (rolInfo ? rolInfo.label : '') + ' ' + (taller ? taller.nombre : '') + ' ' + (taller ? tipoLabel(taller.tipo) : '')).toLowerCase();
        if(haystack.indexOf(q) === -1) return false;
      }
      if(historicoFiltroPuntaje === 'alto' && ev.puntajeTotal < 80) return false;
      if(historicoFiltroPuntaje === 'medio' && (ev.puntajeTotal < 50 || ev.puntajeTotal >= 80)) return false;
      if(historicoFiltroPuntaje === 'bajo' && ev.puntajeTotal >= 50) return false;
      return true;
    }).sort(function(a, b){ return new Date(b.actualizado) - new Date(a.actualizado); });
    if(filtered.length === 0){
      return emptyState('Sin resultados', 'Ninguna evaluación coincide con los filtros actuales.');
    }
    return '<div class="historico-list">' + filtered.map(function(ev){
      var taller = state.talleres.find(function(t){ return t.id === ev.tallerId; });
      var rolInfo = ROLES.find(function(r){ return r.key === ev.rol; });
      return '<button type="button" class="historico-row" data-taller="' + ev.tallerId + '" data-miembro="' + ev.miembroId + '">' +
        '<span>' + escapeHTML(taller ? (tipoLabel(taller.tipo) + ' — ' + taller.nombre) : 'Actividad eliminada') + '</span>' +
        '<span>' + escapeHTML(ev.nombreMiembro) + ' <span class="historico-meta">— ' + escapeHTML(rolInfo ? rolInfo.label : ev.rol) + '</span></span>' +
        '<span class="historico-meta">' + ev.puntajeTotal + '/100</span>' +
        '<span class="historico-meta">' + formatFecha(ev.actualizado) + '</span>' +
        '</button>';
    }).join('') + '</div>';
  }

  function bindHistoricoEvents(com){
    var refresh = function(){
      var container = document.getElementById('historico-rows');
      if(container) container.innerHTML = historicoRowsHTML(com);
    };
    var search = document.getElementById('historico-buscador');
    if(search) search.addEventListener('input', function(e){ historicoBusqueda = e.target.value; refresh(); });
    var selPuntaje = document.getElementById('historico-filtro-puntaje');
    if(selPuntaje) selPuntaje.addEventListener('change', function(e){ historicoFiltroPuntaje = e.target.value; refresh(); });
  }

  function bindComisionesEvents(){
    var el = document.getElementById('view-comisiones');
    if(!el) return; // no existe en index.html (login) — bindGlobalEvents() se llama en las 4 páginas

    function markRowDirty(formId, row){
      markDirty(formId);
      var btn = row.querySelector('.row-save-btn');
      if(btn) btn.classList.add('is-dirty');
      // Mesa usa una barra pegajosa (a diferencia de Talleres, donde puede
      // haber varias filas sucias a la vez y una barra pegajosa por fila se
      // superpondría con las demás) — esta también necesita su propio
      // is-dirty para aparecer.
      var stickyBar = row.querySelector('.form-save-bar-sticky');
      if(stickyBar) stickyBar.classList.add('is-dirty');
    }

    // Mesa directiva y los campos de una actividad ya NO se guardan solos:
    // solo marcan la sección como "con cambios" hasta que se pulsa Guardar.
    function handleFieldEdit(e){
      if(e.target.dataset.role){
        markRowDirty('mesa', el.querySelector('.comision-roles').closest('.card'));
        return;
      }
      var tallerRow = e.target.closest('.taller-row');
      if(tallerRow && e.target.dataset.field){
        markRowDirty('taller-' + tallerRow.dataset.id, tallerRow);
      }
    }
    el.addEventListener('input', handleFieldEdit);
    el.addEventListener('change', function(e){
      handleFieldEdit(e);
      if(e.target.classList.contains('oradores-add-select') && e.target.value){
        var holder = e.target.closest('[data-oradores-holder]');
        var row = e.target.closest('.taller-row');
        var com = currentComision();
        if(!holder || !row || !com) return;
        var keys = JSON.parse(holder.dataset.selected || '[]');
        keys.push(e.target.value);
        holder.dataset.selected = JSON.stringify(keys);
        holder.innerHTML = '<span class="role-label">Orador(es)</span>' + oradoresWidgetHTML(com, keys);
        markRowDirty('taller-' + row.dataset.id, row);
      }
    });

    el.addEventListener('click', function(e){
      var removeOrador = e.target.closest('[data-remove-orador]');
      if(removeOrador){
        var holder = removeOrador.closest('[data-oradores-holder]');
        var row = removeOrador.closest('.taller-row');
        var com = currentComision();
        if(!holder || !row || !com) return;
        var keys = JSON.parse(holder.dataset.selected || '[]').filter(function(k){ return k !== removeOrador.dataset.removeOrador; });
        holder.dataset.selected = JSON.stringify(keys);
        holder.innerHTML = '<span class="role-label">Orador(es)</span>' + oradoresWidgetHTML(com, keys);
        markRowDirty('taller-' + row.dataset.id, row);
        return;
      }

      if(e.target.closest('[data-action="save-mesa"]')){
        var com = currentComision();
        if(!com) return;
        var cambios = [];
        ROLES.forEach(function(r){
          var input = el.querySelector('[data-role="' + r.key + '"]');
          if(!input) return;
          var nuevoNombre = input.value.trim();
          var activo = miembroActivo(com.id, r.key);
          var actual = activo ? activo.nombre.trim() : '';
          if(nuevoNombre === actual) return;
          cambios.push({ rolKey: r.key, nuevoNombre: nuevoNombre, miembro: activo });
        });
        if(cambios.length === 0){ clearDirty('mesa'); return; }
        var aplicarCambiosMesa = function(){
          dataService.guardarMesa(com.id, cambios);
          clearDirty('mesa');
          renderComisiones();
          toast('Mesa directiva guardada');
        };
        // Si alguna persona renombrada ya tiene evaluaciones, confirmamos que
        // es un error de tipeo — un cambio de persona real debe pasar por
        // "Sustituir" para no mezclar dos historiales en uno.
        var conHistorial = cambios.filter(function(c){ return c.miembro && c.nuevoNombre && miembroTieneHistorial(c.miembro.id); });
        if(conHistorial.length){
          var nombres = conHistorial.map(function(c){ return c.miembro.nombre; }).join(', ');
          showConfirmModal(
            '¿Es un error de tipeo?',
            'Estás cambiando el nombre de ' + nombres + ', que ya tiene evaluaciones guardadas. Si es una corrección de tipeo, confirma y se mantiene el mismo historial. Si en realidad es una persona distinta, cancela y usa "Sustituir" desde el panel del Subsecretario.',
            'Sí, es un error de tipeo',
            aplicarCambiosMesa
          );
        }else{
          aplicarCambiosMesa();
        }
        return;
      }

      if(e.target.closest('[data-action="save-taller"]')){
        var row = e.target.closest('.taller-row');
        var t = state.talleres.find(function(x){ return x.id === row.dataset.id; });
        if(!t) return;
        var holder = row.querySelector('[data-oradores-holder]');
        dataService.saveTaller(t.id, {
          nombre: row.querySelector('[data-field="nombre"]').value.trim() || 'Actividad sin nombre',
          tipo: row.querySelector('[data-field="tipo"]').value,
          fecha: row.querySelector('[data-field="fecha"]').value,
          oradores: JSON.parse(holder.dataset.selected || '[]')
        });
        clearDirty('taller-' + t.id);
        renderComisiones();
        toast('Actividad guardada');
        return;
      }

      var tile = e.target.closest('.comision-tile');
      if(tile){
        var tileId = tile.dataset.id;
        confirmDiscardIfDirty(function(){
          pushNavSnapshot_();
          comisionDetailId = tileId;
          comisionDetailTab = 'mesa';
          selTaller = '';
          selMiembroId = '';
          historicoBusqueda = '';
          historicoFiltroPuntaje = 'todos';
          renderComisiones();
          window.scrollTo({ top:0, behavior:'smooth' });
        });
        return;
      }
      if(e.target.closest('#btn-comision-back')){
        confirmDiscardIfDirty(function(){
          pushNavSnapshot_();
          comisionDetailId = null;
          renderComisiones();
        });
        return;
      }
      var subtabBtn = e.target.closest('.subtab-btn');
      if(subtabBtn){
        var subtab = subtabBtn.dataset.subtab;
        confirmDiscardIfDirty(function(){
          pushNavSnapshot_();
          comisionDetailTab = subtab;
          renderComisiones();
        });
        return;
      }
      if(e.target.closest('#btn-add-taller')){
        confirmDiscardIfDirty(function(){
          var com = currentComision();
          if(!com) return;
          dataService.crearTaller(com.id);
          renderComisiones();
          requestAnimationFrame(function(){
            var rows = el.querySelectorAll('.taller-row');
            var last = rows[rows.length - 1];
            var input = last && last.querySelector('input[type=text]');
            if(input){ input.focus(); input.select(); }
          });
        });
        return;
      }
      var delBtn = e.target.closest('[data-action="del-taller"]');
      if(delBtn){
        confirmDiscardIfDirty(function(){
          var row = delBtn.closest('.taller-row');
          var t = state.talleres.find(function(x){ return x.id === row.dataset.id; });
          if(!t) return;
          if(confirm('¿Eliminar la actividad "' + t.nombre + '"? También se eliminarán sus evaluaciones registradas.')){
            dataService.eliminarTaller(t.id);
            clearDirty('taller-' + t.id);
            renderComisiones();
            updateHeaderCounter();
            toast('Actividad eliminada');
          }
        });
        return;
      }
      var toggleCerrarBtn = e.target.closest('[data-action="toggle-cerrar-taller"]');
      if(toggleCerrarBtn){
        var cerrarRow = toggleCerrarBtn.closest('.taller-row');
        var comCerrar = currentComision();
        var tCerrar = comCerrar && state.talleres.find(function(x){ return x.id === cerrarRow.dataset.id; });
        if(!tCerrar || !comCerrar) return;
        if(tCerrar.cerrada){
          dataService.setTallerCerrada(tCerrar.id, false);
          renderComisiones();
          toast('Actividad reabierta');
          return;
        }
        var pendientes = miembrosPendientesEnTaller(comCerrar, tCerrar);
        if(pendientes.length === 0){
          dataService.setTallerCerrada(tCerrar.id, true);
          renderComisiones();
          toast('Actividad cerrada');
          return;
        }
        var aviso = cerrarRow.querySelector('[data-cierre-aviso]');
        if(aviso){
          aviso.innerHTML = '<p class="hint-text" style="color:var(--danger);">Falta evaluar a: ' +
            pendientes.map(function(m){
              var r = ROLES.find(function(x){ return x.key === m.rolKey; });
              return '<button type="button" class="hist-link" data-ir-evaluar-taller="' + tCerrar.id + '" data-ir-evaluar-miembro="' + m.id + '">' + escapeHTML(m.nombre) + (r ? ' (' + escapeHTML(r.label) + ')' : '') + '</button>';
            }).join(', ') + '.</p>';
        }
        return;
      }
      var irEvaluarBtn = e.target.closest('[data-ir-evaluar-miembro]');
      if(irEvaluarBtn){
        var irTaller = irEvaluarBtn.dataset.irEvaluarTaller, irMiembro = irEvaluarBtn.dataset.irEvaluarMiembro;
        confirmDiscardIfDirty(function(){
          selTaller = irTaller;
          selMiembroId = irMiembro;
          comisionDetailTab = 'evaluar';
          renderComisiones();
        });
        return;
      }
      var histRow = e.target.closest('.historico-row');
      if(histRow){
        var histTaller = histRow.dataset.taller, histMiembro = histRow.dataset.miembro;
        confirmDiscardIfDirty(function(){
          selTaller = histTaller;
          selMiembroId = histMiembro;
          comisionDetailTab = 'evaluar';
          renderComisiones();
        });
        return;
      }
    });
  }

  /* ---------- Progreso ---------- */
