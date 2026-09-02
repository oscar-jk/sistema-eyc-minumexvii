'use strict';

  function populateLoginComisiones(){
    var sel = document.getElementById('login-comision-select');
    if(!sel) return;
    sel.innerHTML = '<option value="">Selecciona tu comisión…</option>' + state.comisiones.map(function(c){
      return '<option value="' + c.id + '">' + escapeHTML(c.sigla) + ' — ' + escapeHTML(c.nombre) + '</option>';
    }).join('');
  }

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
    confirmDiscardIfDirty(function(){
      session = null;
      try{ localStorage.removeItem(SESSION_KEY); }catch(e){}
      location.href = 'index.html';
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

  // Se llama en las 4 páginas (ver init()) — cada bloque se null-guarda
  // porque solo index.html tiene el formulario de login y solo las 3
  // páginas de rol tienen el botón de logout.
  function bindLoginEvents(){
    var sel = document.getElementById('login-comision-select');
    var btnEyc = document.getElementById('btn-login-eyc');
    if(sel && btnEyc){
      sel.addEventListener('change', function(e){ btnEyc.disabled = !e.target.value; });
      btnEyc.addEventListener('click', function(){
        if(!sel.value) return;
        doLogin('eyc', sel.value);
      });
    }
    var roleButtons = document.querySelectorAll('[data-login-role]');
    for(var i=0;i<roleButtons.length;i++){
      roleButtons[i].addEventListener('click', function(e){ doLogin(e.currentTarget.dataset.loginRole, null); });
    }
    var logoutBtn = document.getElementById('btn-logout');
    if(logoutBtn) logoutBtn.addEventListener('click', doLogout);
  }

