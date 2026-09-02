'use strict';

  var STORAGE_KEY = 'eyc_rubrica_v4';
  var THEME_KEY = 'eyc_rubrica_theme';

  var ROLES = [
    { key:'director', label:'Director' },
    { key:'adjunto1', label:'Director Adjunto I' },
    { key:'adjunto2', label:'Director Adjunto II' },
    { key:'aprendiz', label:'Miembro Aprendiz' }
  ];

  // Lista fija de 15 comisiones — no se crean ni eliminan desde la interfaz.
  // rolesDemo: datos de prueba, solo se usan en el primer arranque (localStorage vacío).
  // En cuanto se guarda cualquier cambio, pasan a ser datos reales editables.
  var FIXED_COMISIONES = [
    { id:'ctd', nombre:'Comisión de Ciencia y Tecnología para el Desarrollo', sigla:'CTD', rolesDemo:{ director:'Ana Beatriz Vargas', adjunto1:'Luis Fernando Reyes', adjunto2:'Camila Sofía Peña', aprendiz:'Emilio Rodríguez' } },
    { id:'pnud', nombre:'Programa de las Naciones Unidas para el Desarrollo', sigla:'PNUD', rolesDemo:{ director:'Gabriel Antonio Cruz', adjunto1:'Valentina Marte', adjunto2:'Joel Alexander Díaz', aprendiz:'Fernanda Ureña' } },
    { id:'cop', nombre:'Conferencia de las Partes', sigla:'COP', rolesDemo:{ director:'Marcos Iván Castillo', adjunto1:'Paula Nicole Ramírez', adjunto2:'Diego Alejandro Feliz', aprendiz:'Isabel Gómez' } },
    { id:'ams', nombre:'Asamblea Mundial de la Salud', sigla:'AMS', rolesDemo:{ director:'Carolina Beltrán', adjunto1:'Rafael Antonio Núñez', adjunto2:'Daniela Ortiz', aprendiz:'Kevin Pérez' } },
    { id:'csnu', nombre:'Consejo de Seguridad de las Naciones Unidas', sigla:'CSNU', rolesDemo:{ director:'Andrés Felipe Guzmán', adjunto1:'Michelle Contreras', adjunto2:'Sebastián Paulino', aprendiz:'Yamilet Cabrera' } },
    { id:'onudc', nombre:'Oficina de las Naciones Unidas contra la Droga y el Delito', sigla:'ONUDC', rolesDemo:{ director:'Jonathan Manuel Soto', adjunto1:'Estefanía Batista', adjunto2:'Raúl Espinal', aprendiz:'Nicole Abreu' } },
    { id:'cij', nombre:'Corte Internacional de Justicia', sigla:'CIJ', rolesDemo:{ director:'Ricardo José Mercedes', adjunto1:'Laura Ximena Tavárez', adjunto2:'Christopher Lantigua', aprendiz:'Melissa Encarnación' } },
    { id:'foro-social-drdh', nombre:'Foro Social del Consejo de Derechos Humanos', sigla:'POR DEFINIR', rolesDemo:{ director:'Ariana Sofía Familia', adjunto1:'Emmanuel De la Cruz', adjunto2:'Rosanna Beato', aprendiz:'Josué Almonte' } },
    { id:'onudi', nombre:'Organización de las Naciones Unidas para el Desarrollo Industrial', sigla:'ONUDI', rolesDemo:{ director:'Patricia Elena Rosario', adjunto1:'Bryan Alexander Jiménez', adjunto2:'Katherine Polanco', aprendiz:'Ángel Gabriel Santana' } },
    { id:'unctad', nombre:'Conferencia de las Naciones Unidas sobre Comercio y Desarrollo', sigla:'UNCTAD', rolesDemo:{ director:'Wendy Yohanna Rosa', adjunto1:'Miguel Ángel Bautista', adjunto2:'Scarlett Payano', aprendiz:'Jean Carlos Medina' } },
    { id:'omt', nombre:'Organización Mundial del Turismo', sigla:'OMT', rolesDemo:{ director:'Alexandra Nicole Mota', adjunto1:'Franklin Ovalle', adjunto2:'Yaneris Corporán', aprendiz:'Elvin Rosario' } },
    { id:'cime', nombre:'Conferencia Iberoamericana de Ministros de Educación', sigla:'CIME', rolesDemo:{ director:'Rosa Idalia Matos', adjunto1:'Cristian Manuel Adames', adjunto2:'Génesis Taveras', aprendiz:'Wilkin Estévez' } },
    { id:'oma', nombre:'Organización Mundial de Aduanas', sigla:'OMA', rolesDemo:{ director:'Héctor Manuel Liriano', adjunto1:'Ámbar Sofía Vicioso', adjunto2:'Frandy Collado', aprendiz:'Yesenia Grullón' } },
    { id:'crpd', nombre:'Comité sobre los Derechos de las Personas con Discapacidad', sigla:'CRPD', rolesDemo:{ director:'Mariel Cuevas', adjunto1:'Osvaldo Balbuena', adjunto2:'Carla Beatriz Henríquez', aprendiz:'Robinson Sánchez' } },
    { id:'unesco-juventud-deporte', nombre:'UNESCO sobre Juventud y Deporte', sigla:'POR DEFINIR', rolesDemo:{ director:'Yoel Antonio Paredes', adjunto1:'Massiel Concepción', adjunto2:'Erick Manuel Duarte', aprendiz:'Luisanna Objío' } }
  ];

  // El título de una comisión es el único encabezado principal que hoy no
  // trae su elemento decorativo (los otros 4 son los de las vistas
  // Login/Comisiones/Progreso/Monitoreo). Asignación determinista por
  // índice en FIXED_COMISIONES — estable entre renders, no aleatoria.
  var COMISION_ELEMENTOS = ['mxvii-el-5','mxvii-el-6','mxvii-el-7','mxvii-el-8','mxvii-el-9','mxvii-el-10','mxvii-el-11','mxvii-el-12','mxvii-el-13'];
  function comisionHeadingStar(com){
    var idx = FIXED_COMISIONES.findIndex(function(c){ return c.id === com.id; });
    if(idx === -1) idx = 0;
    return COMISION_ELEMENTOS[idx % COMISION_ELEMENTOS.length];
  }

  // Rúbrica verbatim. No existe dimensión C en la fuente original.
  // El criterio E1 llegó truncado en la fuente ("...creatividad,"); se conserva literal.
  // `favorable` marca qué respuesta ('si'|'no') es la deseable en cada criterio —
  // B1 está redactado en negativo ("Mostró desconocimiento…"), así que ahí la
  // respuesta favorable es 'no'; en los demás es 'si'. Se usa para el puntaje de
  // la dimensión A y para saber cuándo el comentario es obligatorio (ver
  // esFavorable/computePuntaje más abajo).
  var RUBRICA = [
    { dim:'A', titulo:'Cumplimiento y responsabilidad', items:[
      { id:'A1', texto:'Asiste al 100% de las capacitaciones y sesiones del evento', favorable:'si' },
      { id:'A2', texto:'Asiste puntualmente a las capacitaciones y sesiones del evento', favorable:'si' },
      { id:'A3', texto:'Hace sus entregas a tiempo', favorable:'si' }
    ]},
    { dim:'B', titulo:'Competencia académica y funcional', items:[
      { id:'B1', texto:'Mostró desconocimiento sobre el procedimiento parlamentario, el tema o errores de redacción', favorable:'no' }
    ]},
    { dim:'D', titulo:'Comunicación', items:[
      { id:'D1', texto:'No se evidenciaron errores de comunicación interna/externa debido a falta de claridad, escucha y retroalimentación', favorable:'si' }
    ]},
    { dim:'E', titulo:'Gestión humana', items:[
      { id:'E1', texto:'No se evidenciaron conflictos, problemas, creatividad', favorable:'si' }
    ]},
    { dim:'F', titulo:'Ética, inclusión e innovación', items:[
      { id:'F1', texto:'Se evidencia una conducta ética, transparente e inclusión, compromiso social, iniciativa, aprendizaje e innovación', favorable:'si' }
    ]}
  ];
  var TOTAL_CRIT = RUBRICA.reduce(function(n,d){ return n + d.items.length; }, 0);
  var DIM_A = RUBRICA[0];                              // dim 'A' — auto-calculado, 85 pts
  var DIMS_MANUALES = ['B','D','E','F'];                // asignación manual del EyC, 3.75 pts c/u (15 en total)
  var MAX_PTS_DIM = 3.75;

  // Puntos de control formales del Subsecretario — ya no son una rúbrica nueva,
  // son un checkpoint de revisión (ver sección "Cortes"). `peso` no se usa más
  // (el puntaje ahora sale de las evaluaciones por actividad, no de los cortes).
  var CORTES = [
    { key:'corte1', label:'Corte 1', desc:'Preparación e incorporación' },
    { key:'corte2', label:'Corte 2', desc:'Desempeño al cierre del Día 2' },
    { key:'final', label:'Evaluación Final', desc:'Desempeño integral' }
  ];

  var TIPOS_ACTIVIDAD = [
    { key:'taller', label:'Taller' },
    { key:'encuentro', label:'Encuentro' },
    { key:'reunion', label:'Reunión' },
    { key:'otro', label:'Otro' }
  ];

  // Sesión simulada (sin contraseña): quién entró y con qué rol.
  // role: 'eyc' (atado a una comisión), 'subse' o 'sg' (globales).
  var SESSION_KEY = 'eyc_rubrica_session';
  // Qué roles ya vieron su modal de bienvenida en este navegador — no es
  // por persona (el login no pide contraseña, cualquiera puede entrar como
  // cualquier rol), así que se guarda por rol, no por sesión. Después de la
  // primera vez sigue disponible desde el botón "?" del encabezado.
  var ONBOARDING_SEEN_KEY = 'eyc_rubrica_onboarding_seen';

  var ROLE_ONBOARDING = {
    eyc: {
      intro: 'Así se organiza el panel de tu comisión:',
      pasos: [
        { label: 'Mesa directiva', desc: 'registra el nombre completo de quien ocupa cada cargo.' },
        { label: 'Actividades', desc: 'registra los talleres o actividades que tu comisión realiza.' },
        { label: 'Evaluar', desc: 'completa la rúbrica de cada persona por actividad.' },
        { label: 'Histórico', desc: 'consulta las evaluaciones anteriores de cualquier miembro.' }
      ]
    },
    subse: {
      intro: 'Así se organiza tu panel de Monitoreo:',
      pasos: [
        { label: 'Casos', desc: 'el semáforo de cada voluntario según su desempeño — desde aquí registras cada corte de seguimiento y puedes sustituir a alguien.' },
        { label: 'Fases de los cortes', desc: 'configura cuándo empieza cada corte (botón arriba, junto a las estadísticas).' },
        { label: 'Rendimiento / Evaluaciones', desc: 'vistas agregadas del desempeño de todas las comisiones.' }
      ]
    },
    sg: {
      intro: 'Así se organiza tu panel de Monitoreo:',
      pasos: [
        { label: 'Casos', desc: 'decide la continuidad de quienes Subsecretaría marcó en riesgo — Continúa o No continúa, con comentario.' },
        { label: 'Panel general', desc: 'resumen del estado de todas las comisiones.' },
        { label: 'Rendimiento / Evaluaciones', desc: 'vistas agregadas del desempeño de todas las comisiones.' }
      ]
    }
  };
