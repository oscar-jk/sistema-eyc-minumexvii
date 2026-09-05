'use strict';

  // Conexión al backend de Google Sheets (ver apps-script/).
  // Vacío = modo local: la app sigue funcionando 100% con localStorage,
  // como antes de que existiera este archivo (útil mientras la Sheet
  // todavía no está desplegada, o para seguir probando sin tocar datos
  // reales). En cuanto APPS_SCRIPT_URL tenga un valor, dataService pasa a
  // leer/escribir todo en la Sheet — ver js/data-service.js.
  var CONFIG = {
    // Pega acá la URL que te da Apps Script al implementar como aplicación
    // web (termina en /exec). Ver apps-script/README.md, paso a paso.
    APPS_SCRIPT_URL: '',
    // El mismo valor que le pusiste a setToken() en el editor de Apps
    // Script (Ejecutar > setToken, una sola vez, a mano). Viaja en este
    // archivo tal como viene — no es un secreto real, ver el riesgo #4 en
    // apps-script/README.md.
    TOKEN: ''
  };
