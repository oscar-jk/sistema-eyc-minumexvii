'use strict';

  var particlesContainer = null;

  function isEyc(){ return !!session && session.role === 'eyc'; }
  function isSubse(){ return !!session && session.role === 'subse'; }
  function isSg(){ return !!session && session.role === 'sg'; }
  function isSecretaria(){ return isSubse() || isSg(); }
  // Solo el Subsecretario escribe cortes (checkpoints con comentario). El
  // EyC solo evalúa por actividad; el SG decide desde Monitoreo, no aquí.
  function canSeeCortes(){ return isSubse(); }
  // Solo la Secretaría (Subse o SG) llega al panel de Monitoreo.
  function canSeeAdmin(){ return isSecretaria(); }
  // Solo el Secretario General decide continuidad sobre los casos que llegan
  // del Subsecretario (semáforo amarillo/rojo con comentario obligatorio).
  function canApprove(){ return isSg(); }

  function roleLabel(role){
    return role === 'eyc' ? 'Evaluación y Control' : role === 'subse' ? 'Subsecretario/a' : role === 'sg' ? 'Secretario/a General' : '';
  }

  /* ---------- Onboarding por rol ---------- */
  function getOnboardingSeen(){
    try{ return JSON.parse(localStorage.getItem(ONBOARDING_SEEN_KEY)) || {}; }catch(e){ return {}; }
  }
  function marcarOnboardingVisto(role){
    var seen = getOnboardingSeen();
    seen[role] = true;
    try{ localStorage.setItem(ONBOARDING_SEEN_KEY, JSON.stringify(seen)); }catch(e){}
  }
  function abrirOnboardingModal(role){
    var data = ROLE_ONBOARDING[role];
    if(!data) return;
    document.getElementById('onboarding-modal-title').textContent = roleLabel(role) + ' — así funciona tu panel';
    document.getElementById('onboarding-modal-intro').textContent = data.intro;
    document.getElementById('onboarding-modal-list').innerHTML = data.pasos.map(function(p){
      return '<li><strong>' + escapeHTML(p.label) + '</strong> — ' + escapeHTML(p.desc) + '</li>';
    }).join('');
    document.getElementById('onboarding-modal').classList.add('is-open');
  }
  function cerrarOnboardingModal(){
    document.getElementById('onboarding-modal').classList.remove('is-open');
  }

  /* ---------- Cambios sin guardar ---------- */
  function markDirty(formId){
    dirtyForms[formId] = true;
  }
  function clearDirty(formId){
    delete dirtyForms[formId];
  }
  function hasAnyDirty(){
    return Object.keys(dirtyForms).length > 0;
  }
  // Se llama antes de cualquier navegación (cambiar de pestaña, comisión,
  // sub-pestaña o cerrar sesión). Si hay cambios sin guardar, muestra un
  // modal propio (en vez de confirm() nativo, que algunos navegadores/
  // webviews suprimen sin avisar) y solo continúa si el usuario acepta
  // descartar los cambios.
  var pendingDiscard = null;
  function confirmDiscardIfDirty(onProceed, onCancel){
    if(!hasAnyDirty()){ onProceed(); return; }
    pendingDiscard = { onProceed: onProceed, onCancel: onCancel };
    document.getElementById('discard-modal').classList.add('is-open');
  }
  function resolveDiscardModal(discard){
    var modal = document.getElementById('discard-modal');
    modal.classList.remove('is-open');
    var pending = pendingDiscard;
    pendingDiscard = null;
    if(!pending) return;
    if(discard){
      dirtyForms = {};
      pending.onProceed();
    } else if(pending.onCancel){
      pending.onCancel();
    }
  }

  // Modal de confirmación genérico — reemplaza confirm() nativo en los
  // flujos nuevos (rename con historial, cerrar actividad), por la misma
  // razón que el de arriba: algunos navegadores/webviews lo suprimen sin
  // avisar y el usuario se queda sin poder continuar ni saber por qué.
  var pendingConfirm = null;
  function showConfirmModal(title, body, okLabel, onConfirm){
    document.getElementById('confirm-modal-title').textContent = title;
    document.getElementById('confirm-modal-body').textContent = body;
    document.getElementById('confirm-modal-ok').textContent = okLabel || 'Confirmar';
    pendingConfirm = onConfirm;
    document.getElementById('confirm-modal').classList.add('is-open');
  }
  function resolveConfirmModal(ok){
    document.getElementById('confirm-modal').classList.remove('is-open');
    var cb = pendingConfirm;
    pendingConfirm = null;
    if(ok && cb) cb();
  }

  function escapeHTML(str){
    return String(str == null ? '' : str).replace(/[&<>"']/g, function(s){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[s];
    });
  }

  function tipoLabel(key){
    var t = TIPOS_ACTIVIDAD.find(function(x){ return x.key === key; });
    return t ? t.label : TIPOS_ACTIVIDAD[0].label;
  }

  function formatFecha(iso){
    try{
      var d = new Date(iso);
      return d.toLocaleString('es-DO', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
    }catch(e){ return iso; }
  }

  function toast(msg, type){
    type = type || 'success';
    var wrap = document.getElementById('toast-wrap');
    var el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' toast-error' : '');
    el.textContent = msg;
    wrap.appendChild(el);
    requestAnimationFrame(function(){ el.classList.add('is-visible'); });
    setTimeout(function(){
      el.classList.remove('is-visible');
      setTimeout(function(){ el.remove(); }, 200);
    }, 2600);
  }

  function updateHeaderCounter(){
    var nTaller = state.evaluaciones.filter(function(e){ return typeof e.puntajeTotal === 'number'; }).length;
    var nCorte = state.cortes.length;
    var n = nTaller + nCorte;
    document.getElementById('header-counter').textContent = n === 1 ? '1 evaluación registrada' : (n + ' evaluaciones registradas');
  }

  /* ---------- Puntaje y semáforo ----------
     Dimensión A (A1-A3, sí/no): auto-calculada, proporcional sobre 85.
     Dimensiones B/D/E/F (sí/no + puntos manuales 0-3.75 c/u, máx 15): el
     EyC asigna los puntos; el sí/no sigue siendo obligatorio pero ya no
     puntúa por sí mismo — solo dispara el comentario obligatorio cuando la
     respuesta es la desfavorable de ese criterio (ver RUBRICA.favorable).
     El semáforo ya NO se calcula por evaluación individual ni por corte:
     es el promedio acumulado de puntajeTotal de todas las evaluaciones de
     taller de un voluntario. Los cortes dejaron de tener rúbrica propia —
     ver "Cortes" más abajo. */
  function esFavorable(item, resp){
    return resp === (item.favorable || 'si');
  }
  function calcPuntajeA(respuestas){
    respuestas = respuestas || {};
    var items = DIM_A.items;
    var ok = items.filter(function(i){ return esFavorable(i, respuestas[i.id]); }).length;
    return (ok / items.length) * 85;
  }
  // Única fuente de verdad para el puntaje total — la usan tanto el guardado
  // real (handleGuardarEvaluacion) como el sembrado de datos de ejemplo, para
  // que nunca diverjan entre sí.
  function computePuntaje(respuestas, puntosDim){
    puntosDim = puntosDim || {};
    var manual = DIMS_MANUALES.reduce(function(s,d){ return s + (Number(puntosDim[d]) || 0); }, 0);
    return Math.round((calcPuntajeA(respuestas) + manual) * 100) / 100;
  }
  function semaforoLabel(key){
    return key === 'verde' ? 'Cumple' : key === 'amarillo' ? 'Seguimiento' : key === 'rojo' ? 'En riesgo' : 'Sin evaluaciones';
  }
  // Nombre nuevo a propósito (no reemplaza semaforoInfo): cambia el tipo de
  // argumento (miembroId, no respuestas), así que cualquier llamada vieja que
  // se me escape falla ruidoso en vez de en silencio.
  function semaforoDeMiembro(miembroId){
    var evs = state.evaluaciones.filter(function(e){ return e.miembroId === miembroId && typeof e.puntajeTotal === 'number'; });
    if(!evs.length) return { key:'gris', label:semaforoLabel('gris'), promedio:null, n:0 };
    var prom = evs.reduce(function(s,e){ return s + e.puntajeTotal; }, 0) / evs.length;
    prom = Math.round(prom * 10) / 10;
    var key = prom < 50 ? 'rojo' : prom < 80 ? 'amarillo' : 'verde';
    return { key:key, label:semaforoLabel(key), promedio:prom, n:evs.length };
  }
  // Punto + etiqueta + % + cantidad de evaluaciones — mismo patrón visual en
  // todos los paneles donde aparece un voluntario, para leer el estado sin
  // abrir el detalle. n se muestra siempre: una sola evaluación de 100 no
  // debe leerse con la misma confianza que un promedio de diez.
  function semaforoRowInnerHTML(miembroId){
    var estado = semaforoDeMiembro(miembroId);
    var detalle = estado.n === 0 ? 'sin evaluaciones'
      : estado.n === 1 ? estado.promedio + '% (1 evaluación)'
      : estado.promedio + '% (' + estado.n + ' evaluaciones)';
    return '<span class="semaforo-dot semaforo-' + estado.key + '" aria-hidden="true"></span><span>' + escapeHTML(estado.label) + ' — ' + escapeHTML(detalle) + '</span>';
  }

  // Los cortes son checkpoints con fecha de inicio configurable (ver Admin).
  // Antes de que empiece su fase el formulario de corte no se habilita — ya
  // no colorean nada, solo gatean cuándo el Subsecretario puede evaluarlos.
  function corteFaseActiva(corteKey){
    var cfg = state.configCortes && state.configCortes[corteKey];
    if(!cfg || !cfg.inicio) return true;
    var hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    var inicio = new Date(cfg.inicio + 'T00:00:00');
    return hoy >= inicio;
  }

  /* ---------- Tema ---------- */
  function isDarkActive(){
    var attr = document.documentElement.getAttribute('data-theme');
    if(attr) return attr === 'dark';
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  // data-theme ya viene resuelto por el script en <head> (antes del primer
  // pintado, para no parpadear) — acá solo queda enlazar el botón y, si el
  // usuario NUNCA eligió explícitamente, seguir reflejando cambios de tema
  // del sistema operativo en vivo mientras la página sigue abierta.
  function initTheme(){
    document.getElementById('theme-toggle').addEventListener('click', function(){
      var next = isDarkActive() ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try{ localStorage.setItem(THEME_KEY, next); }catch(e){}
      loadParticles();
    });
    if(window.matchMedia){
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e){
        var saved = null;
        try{ saved = localStorage.getItem(THEME_KEY); }catch(err){}
        if(saved === 'light' || saved === 'dark') return; // el usuario ya eligió — no lo pisamos
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        loadParticles();
      });
    }
  }

  /* ---------- Fondo de estrellas (tsParticles, vía CDN) ----------
     Puntos pequeños, pocos y tenues — no la forma "star" de la librería,
     que a tamaño chico se lee como el emoji ⭐ y satura la vista. La idea
     es una textura de fondo casi imperceptible, no un protagonista.
     Si no hay conexión y la librería no carga, se omite en silencio:
     el resto de la app no depende de esto para funcionar. */
  function loadParticles(){
    if(!window.tsParticles) return;
    if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var dark = isDarkActive();
    var colors = dark ? ['#3fc4ff', '#ffffff'] : ['#0043c5', '#00b5ff'];
    var opts = {
      fullScreen: { enable: false },
      background: { color: { value: 'transparent' } },
      fpsLimit: 60,
      detectRetina: true,
      particles: {
        number: { value: 24, density: { enable: true, area: 1400 } },
        color: { value: colors },
        shape: { type: 'circle' },
        opacity: { value: { min: 0.08, max: 0.4 }, animation: { enable: true, speed: 0.3, sync: false } },
        size: { value: { min: 0.6, max: 1.5 } },
        links: { enable: false },
        move: { enable: true, speed: 0.08, direction: 'none', random: true, straight: false, outModes: { default: 'out' } }
      }
    };
    if(particlesContainer){ particlesContainer.destroy(); particlesContainer = null; }
    window.tsParticles.load('tsparticles-bg', opts).then(function(c){ particlesContainer = c; }).catch(function(){});
  }

  /* ---------- Navegación superior ---------- */
  function emptyState(title, desc, view, cta){
    return '<div class="empty-state">' +
      '<h3>' + escapeHTML(title) + '</h3>' +
      '<p>' + escapeHTML(desc) + '</p>' +
      (view ? '<button type="button" class="btn btn-secondary" data-goto="' + view + '">' + escapeHTML(cta) + '</button>' : '') +
      '</div>';
  }

  function emptyStateSubtab(title, desc, subtab, cta){
    return '<div class="empty-state">' +
      '<h3>' + escapeHTML(title) + '</h3>' +
      '<p>' + escapeHTML(desc) + '</p>' +
      '<button type="button" class="btn btn-secondary" data-goto-subtab="' + subtab + '">' + escapeHTML(cta) + '</button>' +
      '</div>';
  }

  /* ---------- Comisiones ---------- */
