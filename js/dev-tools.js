'use strict';

  // Borra todo lo guardado (talleres, evaluaciones y nombres de mesa directiva
  // reales) y vuelve a tratar la carga como "primer arranque", así loadState()
  // repuebla las comisiones con los nombres de prueba de FIXED_COMISIONES.
  function resetToTestData(){
    if(!confirm('¿Restablecer los datos de prueba? Esto borra los talleres, evaluaciones y cortes guardados, y vuelve a cargar los nombres de ejemplo en la mesa directiva de cada comisión.')) return;
    try{ localStorage.removeItem(STORAGE_KEY); }catch(e){}
    state = loadState();
    comisionDetailId = null;
    comisionDetailTab = 'mesa';
    adminDetailTab = 'casos';
    selTaller = '';
    selMiembroId = '';
    selCorteTipo = '';
    currentRespuestas = {};
    currentComentarios = {};
    currentPuntosDim = {};
    dirtyForms = {};
    updateHeaderCounter();
    var activeTab = document.querySelector('.nav-tab.is-active');
    switchView(activeTab ? activeTab.dataset.view : 'comisiones');
    toast('Datos de prueba restablecidos');
  }

  // Genera un set de datos de ejemplo con volumen real, sobre TODAS las
  // comisiones (para que cualquier EyC vea algo al entrar) y con casos
  // deliberados — no accidentales — de cada situación que la app debe
  // manejar: alguien en cada banda de semáforo por comisión, un voluntario
  // sustituido con historial, cortes verdes que NO entran a la cola del SG,
  // casos ya decididos (continúa / no continúa) y un corte cuyo promedio
  // congelado difiere a propósito del promedio actual (para probar que se
  // lee el snapshot, no que se recalcula). Es aditivo: no borra lo que ya
  // tengas.
  function seedRichDemoData(){
    if(!confirm('¿Cargar un set de datos de ejemplo completo? Se agregan actividades, evaluaciones y cortes de muestra en todas las comisiones (no borra lo que ya tengas, se suma).')) return;

    var hoy = new Date();
    function fechaOffset(dias){
      var d = new Date(hoy);
      d.setDate(d.getDate() + dias);
      return d.toISOString().slice(0, 10);
    }
    function fechaISO(dias){ return fechaOffset(dias) + 'T12:00:00.000Z'; }

    // Corte 1 y Corte 2 ya empezaron; la Evaluación Final todavía no — así
    // su formulario aparece deshabilitado hasta esa fecha.
    state.configCortes = {
      corte1: { inicio: fechaOffset(-20) },
      corte2: { inicio: fechaOffset(-5) },
      final: { inicio: fechaOffset(10) }
    };

    // Tres perfiles de respuesta+puntos que caen deliberadamente en cada
    // banda del semáforo — no por accidente de un patrón posicional.
    var PERFILES = {
      alto: {
        respuestas: { A1:'si', A2:'si', A3:'si', B1:'no', D1:'si', E1:'si', F1:'si' },
        comentarios: {},
        puntosDim: { B:3.5, D:3.5, E:3.5, F:3 } // A=85 + 13.5 = 98.5
      },
      medio: {
        respuestas: { A1:'si', A2:'si', A3:'no', B1:'no', D1:'si', E1:'no', F1:'si' },
        comentarios: { A3:'Llegó tarde a la última sesión.', E1:'Hubo un desacuerdo puntual con otro miembro, ya resuelto.' },
        puntosDim: { B:2, D:2, E:1.5, F:2 } // A=56.67 + 7.5 = 64.17
      },
      bajo: {
        respuestas: { A1:'si', A2:'no', A3:'no', B1:'si', D1:'no', E1:'no', F1:'no' },
        comentarios: {
          A2:'Faltó a dos sesiones sin aviso.', A3:'Entregas fuera de plazo.',
          B1:'Desconoce el procedimiento parlamentario básico.', D1:'Comunicación deficiente con la mesa.',
          E1:'Conflicto recurrente con otros miembros.', F1:'Falta de compromiso con el proceso.'
        },
        puntosDim: { B:1, D:1, E:1, F:1 } // A=28.33 + 4 = 32.33
      }
    };
    function nuevaEvaluacion(com, taller, miembro, perfil, fecha){
      return {
        id: uid('ev'), comisionId: com.id, tallerId: taller.id, miembroId: miembro.id,
        rol: miembro.rolKey, nombreMiembro: miembro.nombre,
        respuestas: Object.assign({}, perfil.respuestas),
        comentarios: Object.assign({}, perfil.comentarios),
        puntosDim: Object.assign({}, perfil.puntosDim),
        puntajeA: calcPuntajeA(perfil.respuestas),
        puntajeTotal: computePuntaje(perfil.respuestas, perfil.puntosDim),
        actualizado: fecha
      };
    }
    function nuevoCorte(com, miembro, corteKey, fecha, comentario){
      var estado = semaforoDeMiembro(miembro.id);
      var requiere = estado.key === 'amarillo' || estado.key === 'rojo';
      return {
        id: uid('corte'), comisionId: com.id, miembroId: miembro.id, rolKey: miembro.rolKey, corteKey: corteKey,
        comentario: comentario || '',
        semaforoAlMomento: estado.key, promedioAlMomento: estado.promedio,
        requiereRevision: requiere, fecha: fecha,
        decisionSga: { estado:'pendiente', comentario:'', fecha:'' }
      };
    }
    function ensureMiembro(com, fc, rolKey){
      var activo = miembroActivo(com.id, rolKey);
      if(activo && activo.nombre.trim()) return activo;
      var nombre = (fc.rolesDemo && fc.rolesDemo[rolKey]) || '';
      if(!nombre) return activo || null;
      if(activo){ activo.nombre = nombre; return activo; }
      var nuevo = { id: uid('mb'), comisionId: com.id, rolKey: rolKey, nombre: nombre, activo:true, desde: fechaISO(-30), hasta:'', continuidad:'' };
      state.miembros.push(nuevo);
      return nuevo;
    }

    var actividadesPlantilla = [
      { tipo:'taller', nombre:'Taller de procedimiento parlamentario', dias:-15 },
      { tipo:'encuentro', nombre:'Encuentro de bienvenida', dias:-10 },
      { tipo:'reunion', nombre:'Reunión de seguimiento', dias:-2 }
    ];
    // En estas comisiones, además de actividades/evaluaciones, se registran
    // cortes — así la cola del SG tiene volumen real sin saturarla en las 15.
    var comisionesConCorte = ['ctd', 'pnud', 'cop', 'ams', 'csnu', 'onudc'];

    state.comisiones.forEach(function(com, idx){
      var fc = FIXED_COMISIONES.find(function(f){ return f.id === com.id; });
      if(!fc) return;
      var director = ensureMiembro(com, fc, 'director');
      var adjunto1 = ensureMiembro(com, fc, 'adjunto1');
      var adjunto2 = ensureMiembro(com, fc, 'adjunto2');
      // El aprendiz se deja SIN evaluar en todas las comisiones a propósito:
      // así siempre hay alguien en gris para ver ese estado en el panel.
      var oradores = director ? [director.id] : [];

      var misActividades = actividadesPlantilla.map(function(pl){
        var t = { id: uid('tal'), comisionId: com.id, nombre: pl.nombre, tipo: pl.tipo, fecha: fechaOffset(pl.dias), oradores: oradores.slice(), cerrada:false };
        state.talleres.push(t);
        return t;
      });

      // 'ctd': deja el director con una sola evaluación al principio para
      // poder tomar el corte con ESE promedio, y evalúa las 2 actividades
      // restantes después — su corte queda con un promedioAlMomento
      // desactualizado a propósito frente al promedio actual.
      var esCasoSnapshot = com.id === 'ctd';
      if(director){
        if(esCasoSnapshot){
          state.evaluaciones.push(nuevaEvaluacion(com, misActividades[0], director, PERFILES.alto, misActividades[0].fecha + 'T12:00:00.000Z'));
        }else{
          misActividades.forEach(function(act){
            state.evaluaciones.push(nuevaEvaluacion(com, act, director, PERFILES.alto, act.fecha + 'T12:00:00.000Z'));
          });
        }
      }
      if(adjunto1){
        misActividades.forEach(function(act){
          state.evaluaciones.push(nuevaEvaluacion(com, act, adjunto1, PERFILES.medio, act.fecha + 'T12:00:00.000Z'));
        });
      }
      if(adjunto2){
        misActividades.forEach(function(act){
          state.evaluaciones.push(nuevaEvaluacion(com, act, adjunto2, PERFILES.bajo, act.fecha + 'T12:00:00.000Z'));
        });
      }

      if(comisionesConCorte.indexOf(com.id) !== -1){
        // Director: verde → comentario opcional, y NO debe entrar a la cola
        // del SG (requiereRevision queda false).
        if(director){
          state.cortes.push(nuevoCorte(com, director, 'corte1', fechaISO(esCasoSnapshot ? -14 : -15), 'Buen desempeño general, sin observaciones.'));
        }
        // Adjunto I: amarillo → comentario obligatorio, entra a la cola.
        if(adjunto1){
          state.cortes.push(nuevoCorte(com, adjunto1, 'corte1', fechaISO(-15), 'Cumple parcialmente — hay que darle seguimiento en comunicación.'));
        }
        // Adjunto II: rojo → comentario obligatorio, entra a la cola. En dos
        // comisiones ya se ve DECIDIDO por el SG (una continúa, otra no),
        // para no dejar la cola vacía de casos resueltos.
        if(adjunto2){
          var corteAdj2 = nuevoCorte(com, adjunto2, 'corte1', fechaISO(-15), 'Ausencias reiteradas y bajo cumplimiento de entregas.');
          if(com.id === 'ctd'){
            corteAdj2.decisionSga = { estado:'continua', comentario:'Se le da una oportunidad más con seguimiento cercano.', fecha: fechaISO(-10) };
            adjunto2.continuidad = 'continua';
          }else if(com.id === 'pnud'){
            corteAdj2.decisionSga = { estado:'no-continua', comentario:'Reincidente pese al seguimiento del Corte 1.', fecha: fechaISO(-10) };
            adjunto2.continuidad = 'no-continua';
          }
          state.cortes.push(corteAdj2);
        }
      }

      // Ahora sí, para 'ctd' se agregan las 2 evaluaciones restantes del
      // director — su promedio actual sube, pero el corte ya guardado
      // arriba se queda con la foto vieja (esto es lo que se está probando).
      if(esCasoSnapshot && director){
        misActividades.slice(1).forEach(function(act){
          state.evaluaciones.push(nuevaEvaluacion(com, act, director, PERFILES.alto, act.fecha + 'T12:00:00.000Z'));
        });
      }
      // La Evaluación Final se deja sin registrar en todas — su fase
      // todavía no empieza.
    });

    // Sustitución de ejemplo: en PNUD, el Adjunto II original (evaluado
    // arriba, banda "bajo", con corte ya decidido "no continúa") se
    // sustituye — queda archivado con su historial intacto, y la persona
    // entrante arranca sin evaluaciones.
    var comPnud = state.comisiones.find(function(c){ return c.id === 'pnud'; });
    if(comPnud){
      var salienteId = miembroActivo(comPnud.id, 'adjunto2');
      if(salienteId){
        salienteId.activo = false;
        salienteId.hasta = fechaISO(-8);
        state.miembros.push({
          id: uid('mb'), comisionId: comPnud.id, rolKey:'adjunto2', nombre:'Yolanda Marte',
          activo:true, desde: fechaISO(-8), hasta:'', continuidad:''
        });
        rederivarRoles();
      }
    }

    saveState();
    updateHeaderCounter();
    var activeTab = document.querySelector('.nav-tab.is-active');
    switchView(activeTab ? activeTab.dataset.view : 'admin');
    toast('Datos de ejemplo cargados');
  }

  /* ---------- Init ---------- */
