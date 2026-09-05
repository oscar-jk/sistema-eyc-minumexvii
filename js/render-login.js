'use strict';

  // Cada rol vive en su propia página desde acá — login/eyc/subse/sga.html,
  // ver EXPECTED_ROLE (declarado inline en cada página de rol, antes de
  // estos <script src>) y el guard en init() (js/main.js). "Comisiones"
  // sigue siendo el nombre interno del rol de Secretario General en el
  // resto del código — solo el archivo se llama sga.html.
  var ROLE_PAGES = { eyc:'eyc.html', subse:'subse.html', sg:'sga.html' };

  function doLogin(role, comisionId){
    session = { role: role, comisionId: comisionId || null };
    saveSession();
    location.href = ROLE_PAGES[role];
  }

  function doLogout(){
    cerrarNavMovil_(); // el botón vive dentro del panel lateral, ver .side-drawer-logout
    confirmDiscardIfDirty(function(){
      showConfirmModal('Cerrar sesión', '¿Seguro que quieres cerrar sesión?', 'Cerrar sesión', function(){
        session = null;
        try{ localStorage.removeItem(SESSION_KEY); }catch(e){}
        location.href = 'index.html';
      });
    });
  }

  // Solo se llama en las páginas de rol (ver init() en main.js) — la
  // sección/pestaña por defecto de cada una ya viene marcada is-active en
  // el propio HTML, así que no hace falta tocar session-badge/nav-tabs/
  // help-btn acá: son siempre visibles en esas 3 páginas, por diseño.
  function enterApp(){
    document.getElementById('session-badge-role').textContent = roleLabel(session.role);
    var detailEl = document.getElementById('session-badge-detail');
    if(session.role === 'eyc'){
      var com = state.comisiones.find(function(c){ return c.id === session.comisionId; });
      detailEl.textContent = com ? ' — ' + com.sigla : '';
    }else{
      detailEl.textContent = '';
    }
    comisionDetailId = isEyc() ? session.comisionId : null;
    comisionDetailTab = canSeeCortes() ? comisionDetailTab : 'mesa';
    switchView(isSecretaria() ? 'admin' : 'comisiones');
    var onboardingSeen = getOnboardingSeen();
    if(!onboardingSeen[session.role]){
      marcarOnboardingVisto(session.role);
      abrirOnboardingModal(session.role);
    }
  }

  // Login por usuario/contraseña contra la pestaña Usuarios de la Sheet
  // (ver apps-script/Code.gs, login_) — la cuenta ya dice a qué rol (y, si
  // es EyC, a qué comisión) entra; ya no se elige a mano. Sin
  // CONFIG.APPS_SCRIPT_URL configurado no hay contra qué validar, ver el
  // mensaje que devuelve dataService.login().
  function bindLoginFormEvents(){
    var form = document.getElementById('login-form');
    if(!form) return; // solo existe en index.html
    var usuarioInput = document.getElementById('login-usuario');
    var contrasenaInput = document.getElementById('login-contrasena');
    var errorEl = document.getElementById('login-form-error');
    var submitBtn = document.getElementById('login-form-submit');

    form.addEventListener('submit', function(e){
      e.preventDefault();
      errorEl.hidden = true;
      submitBtn.disabled = true;
      dataService.login(usuarioInput.value.trim(), contrasenaInput.value)
        .then(function(res){
          doLogin(res.rol, res.comisionId);
        })
        .catch(function(err){
          errorEl.textContent = err.message;
          errorEl.hidden = false;
          submitBtn.disabled = false;
        });
    });

    var logoutBtn = document.getElementById('btn-logout');
    if(logoutBtn) logoutBtn.addEventListener('click', doLogout);
  }
