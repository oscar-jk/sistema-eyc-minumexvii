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
    cerrarNavMovil_(); // no-op en escritorio; en móvil, cierra el menú hamburguesa tras navegar
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

  // El botón "Volver" (uno por vista, ver .view-back-btn) deshace la ÚLTIMA
  // pestaña/sub-pestaña visitada DENTRO de esta página — no es "salir al
  // login", es "a dónde estaba antes de este último clic". Cada punto de
  // navegación (pestaña superior, entrar/salir de una comisión, cambiar de
  // sub-pestaña) guarda una foto de dónde estaba ANTES de moverse; Volver
  // saca la última y la restaura. Solo cuando no queda nada que deshacer
  // (recién se entró a la página) cae al historial real del navegador.
  var navStack = [];
  function currentNavSnapshot_(){
    var activeSection = document.querySelector('.view.is-active');
    return {
      view: activeSection ? activeSection.id.replace('view-', '') : 'comisiones',
      comisionDetailId: comisionDetailId,
      comisionDetailTab: comisionDetailTab,
      adminDetailTab: adminDetailTab
    };
  }
  function pushNavSnapshot_(){
    navStack.push(currentNavSnapshot_());
  }
  function goBack_(){
    if(navStack.length > 0){
      var prev = navStack.pop();
      comisionDetailId = prev.comisionDetailId;
      comisionDetailTab = prev.comisionDetailTab;
      adminDetailTab = prev.adminDetailTab;
      switchView(prev.view);
      return;
    }
    if(window.history.length > 1) history.back();
    else location.href = 'index.html';
  }

  // El botón de menú abre/cierra el panel lateral (.side-drawer) donde viven
  // las pestañas, tema, ayuda y sesión — ver el HTML de eyc/subse/sga.html.
  // cerrarNavMovil_() se llama también al elegir una pestaña, para no dejar
  // el panel abierto tapando el contenido después de navegar.
  function cerrarNavMovil_(){
    var drawer = document.getElementById('side-drawer');
    var backdrop = document.getElementById('drawer-backdrop');
    var toggle = document.getElementById('nav-toggle');
    if(!drawer) return; // no existe en index.html (login), donde no hay panel
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.inert = true;
    if(backdrop) backdrop.classList.remove('is-open');
    if(toggle) toggle.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('drawer-open');
  }
  function abrirDrawer_(){
    var drawer = document.getElementById('side-drawer');
    var backdrop = document.getElementById('drawer-backdrop');
    var toggle = document.getElementById('nav-toggle');
    if(!drawer) return;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    drawer.inert = false;
    if(backdrop) backdrop.classList.add('is-open');
    if(toggle) toggle.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('drawer-open');
    var closeBtn = document.getElementById('drawer-close');
    if(closeBtn) closeBtn.focus();
  }

  function bindGlobalEvents(){
    on_('nav-toggle', 'click', function(){
      var drawer = document.getElementById('side-drawer');
      if(drawer.classList.contains('is-open')){ cerrarNavMovil_(); document.getElementById('nav-toggle').focus(); }
      else abrirDrawer_();
    });
    on_('drawer-close', 'click', cerrarNavMovil_);
    // Va acá y no en bindLoginFormEvents(): esa función sale temprano en las
    // páginas de rol (no tienen #login-form), que son justo donde vive este
    // botón — por eso el logout nunca se enganchaba.
    on_('btn-logout', 'click', doLogout);
    on_('drawer-backdrop', 'click', cerrarNavMovil_);
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape') cerrarNavMovil_();
    });
    var tabs = document.querySelectorAll('.nav-tab');
    for(var i=0;i<tabs.length;i++){
      tabs[i].addEventListener('click', function(e){
        var view = e.currentTarget.dataset.view;
        confirmDiscardIfDirty(function(){ pushNavSnapshot_(); switchView(view); });
      });
    }
    on_('btn-cortes-config', 'click', abrirCortesConfigModal);
    on_('cortes-config-modal-close', 'click', cerrarCortesConfigModal);
    on_('help-btn', 'click', function(){
      cerrarNavMovil_();
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
      // El botón "Volver" se repite una vez por vista (Mesa/Progreso/
      // Monitoreo, ver .view-back-btn) para seguir visible sin importar la
      // pestaña activa — de ahí la delegación en vez de un solo id.
      var backBtn = e.target.closest('[data-action="volver"]');
      if(backBtn){ goBack_(); return; }
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

  // Pantalla de error cuando no se pudo cargar la información del
  // servidor: reemplaza las vistas (no se muestra nada con datos viejos) y
  // ofrece reintentar sin recargar la página. El panel lateral sigue
  // funcionando, así que también se puede cerrar sesión desde acá.
  function mostrarErrorCarga_(onRetry){
    var main = document.getElementById('main');
    if(!main) return;
    document.documentElement.classList.add('app-load-failed');
    var panel = document.getElementById('load-error');
    if(!panel){
      panel = document.createElement('div');
      panel.id = 'load-error';
      panel.className = 'card load-error';
      panel.setAttribute('role', 'alert');
      panel.innerHTML =
        '<h2 class="load-error-title">No se pudo cargar la información</h2>' +
        '<p class="load-error-desc">No hay conexión con el servidor o está tardando en responder. Revisa tu conexión a internet y vuelve a intentarlo. Si el problema sigue, avisa a la Subsecretaría.</p>' +
        '<div class="load-error-actions"><button type="button" class="btn btn-primary" id="load-error-retry">Reintentar</button></div>';
      main.insertBefore(panel, main.firstChild);
    }
    var btn = document.getElementById('load-error-retry');
    btn.disabled = false;
    btn.textContent = 'Reintentar';
    btn.onclick = function(){
      btn.disabled = true;
      btn.textContent = 'Conectando…';
      onRetry();
    };
    btn.focus();
  }
  function ocultarErrorCarga_(){
    document.documentElement.classList.remove('app-load-failed');
    var panel = document.getElementById('load-error');
    if(panel) panel.remove();
  }

  // Carga los datos del servidor y entra a la app; si falla, deja la
  // pantalla de error con "Reintentar", que vuelve a llamar a esto mismo.
  function cargarDatosYEntrar_(){
    return dataService.init().then(function(nuevoState){
      state = nuevoState;
      ocultarErrorCarga_();
      updateHeaderCounter();
      enterApp();
    }, function(){
      mostrarErrorCarga_(cargarDatosYEntrar_);
    });
  }

  function init(){
    // EXPECTED_ROLE se declara inline en eyc/subse/sga.html, antes de estos
    // <script src> (no existe en index.html — el login nunca redirige solo,
    // aunque ya haya sesión guardada, para que "← Volver" tenga a dónde
    // volver de verdad en vez de rebotar para adelante otra vez).
    var esPaginaDeRol = typeof EXPECTED_ROLE !== 'undefined';
    initTheme();
    updateFooterPrivacyNote();
    bindLoginFormEvents();
    bindGlobalEvents();
    loadParticles();
    window.addEventListener('beforeunload', function(e){
      if(hasAnyDirty()){ e.preventDefault(); e.returnValue = ''; }
    });
    // El login no muestra datos de comisiones: no tiene sentido cargar
    // todas las tablas ahí (ni bloquear el login si esa carga falla).
    if(esPaginaDeRol) verificarSesionYEntrar_();
  }

  // La identidad sale del JWT de Supabase Auth, no de localStorage. Esta
  // guarda solo decide qué PÁGINA mostrar — aunque alguien la saltara
  // desde la consola, sin un JWT válido con el rol correcto RLS no le
  // devuelve ningún dato.
  function verificarSesionYEntrar_(){
    dataService.obtenerSesion().then(function(s){
      if(!s){ location.href = 'index.html'; return; }
      if(s.debeCambiarContrasena){ location.href = 'index.html?cambiar=1'; return; }
      if(s.role !== EXPECTED_ROLE){ location.href = ROLE_PAGES[s.role] || 'index.html'; return; }
      session = s;
      cargarDatosYEntrar_();
    }, function(){
      mostrarErrorCarga_(verificarSesionYEntrar_);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
