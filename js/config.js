'use strict';

  // Conexión al backend de Supabase (ver SUPABASE.md). Vacío = modo local:
  // la app sigue funcionando 100% con localStorage (útil para seguir
  // probando sin tocar datos reales). Con estos dos valores puestos,
  // dataService pasa a leer/escribir todo en Supabase — ver
  // js/data-service.js.
  var CONFIG = {
    SUPABASE_URL: 'https://hnlhhwululasvlckbcrq.supabase.co',
    // Llave pública (anon/publishable) del proyecto — está pensada para
    // viajar en el JS del cliente, no es un secreto (el acceso real de
    // datos lo controlan las políticas de RLS y la función login() en la
    // base, ver SUPABASE.md).
    SUPABASE_ANON_KEY: 'sb_publishable_-3SmtEtO1brhGbThaJeICw_OPugVcG9'
  };
