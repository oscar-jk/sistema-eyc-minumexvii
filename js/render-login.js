'use strict';

  // Cada rol vive en su propia página desde acá — login/eyc/subse/sga.html,
  // ver EXPECTED_ROLE (declarado inline en cada página de rol, antes de
  // estos <script src>) y el guard en init() (js/main.js). "Comisiones"
  // sigue siendo el nombre interno del rol de Secretario General en el
  // resto del código — solo el archivo se llama sga.html.
  var ROLE_PAGES = { eyc:'eyc.html', subse:'subse.html', sg:'sga.html' };

  // La sesión ya quedó guardada por supabase-js (ver dataService.login());
  // acá solo se elige a qué página ir.
  function irAPaginaDeRol(s){
    location.href = ROLE_PAGES[s.role] || 'index.html';
  }

  function doLogout(){
    cerrarNavMovil_(); // el botón vive dentro del panel lateral, ver .side-drawer-logout
    confirmDiscardIfDirty(function(){
      showConfirmModal('Cerrar sesión', '¿Seguro que quieres cerrar sesión?', 'Cerrar sesión', function(){
        session = null;
        dataService.logout().then(function(){ location.href = 'index.html'; });
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

  // Login por usuario/contraseña contra la tabla usuarios de Supabase (ver
  // SUPABASE.md, función login()) — la cuenta ya dice a qué rol (y, si es
  // EyC, a qué comisión) entra; ya no se elige a mano. Sin
  // CONFIG.SUPABASE_URL configurado no hay contra qué validar, ver el
  // mensaje que devuelve dataService.login().
  // Primer ingreso: reemplaza el formulario de login por el de cambio de
  // contraseña. Hasta completarlo, el servidor no entrega datos (app_rol()
  // devuelve null mientras debe_cambiar_contrasena esté activo).
  function mostrarCambioContrasena(){
    var loginForm = document.getElementById('login-form');
    var cambioForm = document.getElementById('cambio-form');
    if(loginForm) loginForm.hidden = true;
    cambioForm.hidden = false;
    document.getElementById('cambio-nueva').focus();
  }

  function bindCambioContrasenaEvents(){
    var form = document.getElementById('cambio-form');
    if(!form) return;
    var nueva = document.getElementById('cambio-nueva');
    var repetir = document.getElementById('cambio-repetir');
    var errorEl = document.getElementById('cambio-form-error');
    var submitBtn = document.getElementById('cambio-form-submit');
    function mostrarError(msg){ errorEl.textContent = msg; errorEl.hidden = false; }
    form.addEventListener('submit', function(e){
      e.preventDefault();
      errorEl.hidden = true;
      if(nueva.value.length < 8){ mostrarError('La contraseña debe tener al menos 8 caracteres.'); nueva.focus(); return; }
      if(nueva.value !== repetir.value){ mostrarError('Las dos contraseñas no coinciden.'); repetir.focus(); return; }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando…';
      dataService.cambiarContrasena(nueva.value).then(function(s){
        if(!s || s.debeCambiarContrasena) throw new Error('No se pudo confirmar el cambio. Inténtalo de nuevo.');
        irAPaginaDeRol(s);
      }).catch(function(err){
        mostrarError(err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar contraseña y entrar';
      });
    });
  }

  function bindLoginFormEvents(){
    bindCambioContrasenaEvents();
    var form = document.getElementById('login-form');
    if(!form) return; // solo existe en index.html
    // Llegó redirigido desde una página de rol con una cuenta que todavía
    // tiene la contraseña temporal (ver init() en main.js).
    if(/[?&]cambiar=1\b/.test(location.search)){
      dataService.obtenerSesion().then(function(s){
        if(s && s.debeCambiarContrasena) mostrarCambioContrasena();
      }, function(){});
    }
    var usuarioInput = document.getElementById('login-usuario');
    var contrasenaInput = document.getElementById('login-contrasena');
    var errorEl = document.getElementById('login-form-error');
    var submitBtn = document.getElementById('login-form-submit');

    form.addEventListener('submit', function(e){
      e.preventDefault();
      errorEl.hidden = true;
      submitBtn.disabled = true;
      dataService.login(usuarioInput.value.trim(), contrasenaInput.value)
        .then(function(s){
          if(s.debeCambiarContrasena){ submitBtn.disabled = false; mostrarCambioContrasena(); return; }
          irAPaginaDeRol(s);
        })
        .catch(function(err){
          errorEl.textContent = err.message;
          errorEl.hidden = false;
          submitBtn.disabled = false;
        });
    });
  }
