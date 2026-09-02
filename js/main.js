'use strict';

  function switchView(view){
    if(view === 'admin' && !canSeeAdmin()) view = 'comisiones';
    var sections = document.querySelectorAll('.view');
    for(var i=0;i<sections.length;i++) sections[i].classList.remove('is-active');
    var tabs = document.querySelectorAll('.nav-tab');
    for(var j=0;j<tabs.length;j++){
      tabs[j].classList.remove('is-active');
      tabs[j].setAttribute('aria-selected', tabs[j].dataset.view === view ? 'true' : 'false');
    }
    document.getElementById('view-' + view).classList.add('is-active');
    document.querySelector('.nav-tab[data-view="' + view + '"]').classList.add('is-active');
    window.scrollTo({ top:0, behavior:'smooth' });
    if(view === 'comisiones') renderComisiones();
    if(view === 'progreso') renderProgreso();
    if(view === 'admin') renderAdmin();
  }

  /* ---------- Login / logout ---------- */
  // Ya no hay una sola página con todo: cada una de las 4 (login/eyc/subse/
  // sga.html) solo trae el markup que le corresponde (ver assemble() del
  // script que las generó). bindGlobalEvents() se llama igual en las 4, así
  // que cada listener se engancha con esta guarda — si el elemento no vive
  // en la página actual, simplemente no hace nada, en vez de tirar un
  // TypeError por leer .addEventListener de null.
  function on_(id, evt, handler){
    var el = document.getElementById(id);
    if(el) el.addEventListener(evt, handler);
  }

  // El botón "← Volver" (siempre visible en las 3 páginas de rol, ver
  // header() del script generador): retrocede en el historial real del
  // navegador si lo hay, y si no (URL abierta directo, marcador) cae a
  // index.html — para que "volver" haga algo predecible sin importar cómo
  // se llegó a la página.
  function goBack_(){
    if(window.history.length > 1) history.back();
    else location.href = 'index.html';
  }

  function bindGlobalEvents(){
    var tabs = document.querySelectorAll('.nav-tab');
    for(var i=0;i<tabs.length;i++){
      tabs[i].addEventListener('click', function(e){
        var view = e.currentTarget.dataset.view;
        confirmDiscardIfDirty(function(){ switchView(view); });
      });
    }
    on_('btn-reset-demo', 'click', resetToTestData);
    on_('btn-seed-demo', 'click', seedRichDemoData);
    on_('btn-cortes-config', 'click', abrirCortesConfigModal);
    on_('cortes-config-modal-close', 'click', cerrarCortesConfigModal);
    on_('btn-back', 'click', goBack_);
    on_('help-btn', 'click', function(){
      if(session) abrirOnboardingModal(session.role);
    });
    on_('onboarding-modal-close', 'click', cerrarOnboardingModal);
    on_('onboarding-modal-ok', 'click', cerrarOnboardingModal);
    on_('onboarding-modal', 'click', function(e){
      if(e.target.id === 'onboarding-modal') cerrarOnboardingModal();
    });
    on_('discard-modal-cancel', 'click', function(){ resolveDiscardModal(false); });
    on_('discard-modal-confirm', 'click', function(){ resolveDiscardModal(true); });
    on_('confirm-modal-cancel', 'click', function(){ resolveConfirmModal(false); });
    on_('confirm-modal-ok', 'click', function(){ resolveConfirmModal(true); });
    on_('sustituir-modal-cancel', 'click', cerrarSustituirModal);
    on_('sustituir-modal-ok', 'click', confirmarSustitucion);
    on_('sustituir-modal-input', 'keydown', function(e){
      if(e.key === 'Enter') confirmarSustitucion();
    });
    on_('historico-modal-close', 'click', cerrarHistoricoModal);
    on_('historico-modal', 'click', function(e){
      if(e.target.id === 'historico-modal') cerrarHistoricoModal();
    });
    document.addEventListener('click', function(e){
      // El disparador del histórico va primero y con stopPropagation: puede
      // vivir dentro de una .historico-row (que también navega a Evaluar al
      // hacer clic) y no queremos las dos cosas a la vez.
      var histBtn = e.target.closest('[data-hist-miembro]');
      if(histBtn){ e.stopPropagation(); abrirHistoricoModal(histBtn.dataset.histMiembro); return; }
      var sustBtn = e.target.closest('[data-action="sustituir-miembro"]');
      if(sustBtn){ e.stopPropagation(); abrirSustituirModal(sustBtn.dataset.com, sustBtn.dataset.rol); return; }
      var corteBtn = e.target.closest('[data-corte-miembro]');
      if(corteBtn){
        e.stopPropagation();
        var ccCom = corteBtn.dataset.corteCom, ccMiembro = corteBtn.dataset.corteMiembro, ccKey = corteBtn.dataset.corteKey;
        confirmDiscardIfDirty(function(){
          comisionDetailId = ccCom;
          comisionDetailTab = 'cortes';
          selMiembroId = ccMiembro;
          selCorteTipo = ccKey;
          switchView('comisiones');
        });
        return;
      }
      var gotoBtn = e.target.closest('[data-goto]');
      if(gotoBtn){ var view = gotoBtn.dataset.goto; confirmDiscardIfDirty(function(){ switchView(view); }); return; }
      var gotoSub = e.target.closest('[data-goto-subtab]');
      if(gotoSub){ var subtab = gotoSub.dataset.gotoSubtab; confirmDiscardIfDirty(function(){ comisionDetailTab = subtab; renderComisiones(); }); return; }
    }, true);
    bindComisionesEvents();
    bindProgresoEvents();
  }

  async function init(){
    // state.js ya cargó `state` de forma síncrona antes de que esto corra
    // (ver var state = loadState(); en state.js) — este await es hoy un
    // no-op (Promise.resolve del mismo state), pero deja el punto de
    // entrada exacto donde una carga remota del roster reemplazará la
    // carga local, sin que nada más en este archivo tenga que cambiar.
    state = await dataService.init();
    // EXPECTED_ROLE se declara inline en eyc/subse/sga.html, antes de estos
    // <script src> (no existe en index.html — el login nunca redirige solo,
    // aunque ya haya sesión guardada, para que "← Volver" tenga a dónde
    // volver de verdad en vez de rebotar para adelante otra vez).
    var esPaginaDeRol = typeof EXPECTED_ROLE !== 'undefined';
    if(esPaginaDeRol && (!session || session.role !== EXPECTED_ROLE)){
      location.href = 'index.html';
      return;
    }
    initTheme();
    updateHeaderCounter();
    populateLoginComisiones();
    bindLoginEvents();
    bindGlobalEvents();
    loadParticles();
    window.addEventListener('beforeunload', function(e){
      if(hasAnyDirty()){ e.preventDefault(); e.returnValue = ''; }
    });
    if(esPaginaDeRol) enterApp();
  }

  document.addEventListener('DOMContentLoaded', init);
