'use strict';

  function populateLoginComisiones(){
    var sel = document.getElementById('login-comision-select');
    if(!sel) return;
    sel.innerHTML = '<option value="">Selecciona tu comisión…</option>' + state.comisiones.map(function(c){
      return '<option value="' + c.id + '">' + escapeHTML(c.sigla) + ' — ' + escapeHTML(c.nombre) + '</option>';
    }).join('');
  }

  function applyRoleVisibility(){
    var adminTab = document.getElementById('tab-admin');
    if(adminTab) adminTab.hidden = !canSeeAdmin();
  }

  function doLogin(role, comisionId){
    session = { role: role, comisionId: comisionId || null };
    saveSession();
    enterApp();
  }

  function doLogout(){
    confirmDiscardIfDirty(function(){
      session = null;
      try{ localStorage.removeItem(SESSION_KEY); }catch(e){}
      comisionDetailId = null;
      comisionDetailTab = 'mesa';
      var sections = document.querySelectorAll('.view');
      for(var i=0;i<sections.length;i++) sections[i].classList.remove('is-active');
      document.getElementById('view-login').classList.add('is-active');
      document.getElementById('nav-tabs').hidden = true;
      document.getElementById('session-badge').hidden = true;
      document.getElementById('help-btn').hidden = true;
      populateLoginComisiones();
      var sel = document.getElementById('login-comision-select');
      if(sel) sel.value = '';
      var btnEyc = document.getElementById('btn-login-eyc');
      if(btnEyc) btnEyc.disabled = true;
    });
  }

  function enterApp(){
    document.getElementById('view-login').classList.remove('is-active');
    document.getElementById('nav-tabs').hidden = false;
    applyRoleVisibility();
    var badge = document.getElementById('session-badge');
    badge.hidden = false;
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
    document.getElementById('help-btn').hidden = false;
    var onboardingSeen = getOnboardingSeen();
    if(!onboardingSeen[session.role]){
      marcarOnboardingVisto(session.role);
      abrirOnboardingModal(session.role);
    }
  }

  function bindLoginEvents(){
    var sel = document.getElementById('login-comision-select');
    var btnEyc = document.getElementById('btn-login-eyc');
    sel.addEventListener('change', function(e){ btnEyc.disabled = !e.target.value; });
    btnEyc.addEventListener('click', function(){
      if(!sel.value) return;
      doLogin('eyc', sel.value);
    });
    var roleButtons = document.querySelectorAll('[data-login-role]');
    for(var i=0;i<roleButtons.length;i++){
      roleButtons[i].addEventListener('click', function(e){ doLogin(e.currentTarget.dataset.loginRole, null); });
    }
    document.getElementById('btn-logout').addEventListener('click', doLogout);
  }

