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
  function bindGlobalEvents(){
    var tabs = document.querySelectorAll('.nav-tab');
    for(var i=0;i<tabs.length;i++){
      tabs[i].addEventListener('click', function(e){
        var view = e.currentTarget.dataset.view;
        confirmDiscardIfDirty(function(){ switchView(view); });
      });
    }
    document.getElementById('btn-reset-demo').addEventListener('click', resetToTestData);
    document.getElementById('btn-seed-demo').addEventListener('click', seedRichDemoData);
    document.getElementById('btn-cortes-config').addEventListener('click', abrirCortesConfigModal);
    document.getElementById('cortes-config-modal-close').addEventListener('click', cerrarCortesConfigModal);
    document.getElementById('help-btn').addEventListener('click', function(){
      if(session) abrirOnboardingModal(session.role);
    });
    document.getElementById('onboarding-modal-close').addEventListener('click', cerrarOnboardingModal);
    document.getElementById('onboarding-modal-ok').addEventListener('click', cerrarOnboardingModal);
    document.getElementById('onboarding-modal').addEventListener('click', function(e){
      if(e.target.id === 'onboarding-modal') cerrarOnboardingModal();
    });
    document.getElementById('discard-modal-cancel').addEventListener('click', function(){ resolveDiscardModal(false); });
    document.getElementById('discard-modal-confirm').addEventListener('click', function(){ resolveDiscardModal(true); });
    document.getElementById('confirm-modal-cancel').addEventListener('click', function(){ resolveConfirmModal(false); });
    document.getElementById('confirm-modal-ok').addEventListener('click', function(){ resolveConfirmModal(true); });
    document.getElementById('sustituir-modal-cancel').addEventListener('click', cerrarSustituirModal);
    document.getElementById('sustituir-modal-ok').addEventListener('click', confirmarSustitucion);
    document.getElementById('sustituir-modal-input').addEventListener('keydown', function(e){
      if(e.key === 'Enter') confirmarSustitucion();
    });
    document.getElementById('historico-modal-close').addEventListener('click', cerrarHistoricoModal);
    document.getElementById('historico-modal').addEventListener('click', function(e){
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

  function init(){
    initTheme();
    updateHeaderCounter();
    populateLoginComisiones();
    bindLoginEvents();
    bindGlobalEvents();
    loadParticles();
    window.addEventListener('beforeunload', function(e){
      if(hasAnyDirty()){ e.preventDefault(); e.returnValue = ''; }
    });
    if(session) enterApp();
  }

  document.addEventListener('DOMContentLoaded', init);
