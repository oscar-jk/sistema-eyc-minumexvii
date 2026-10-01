-- Fase B (rompe el sitio VIEJO): aplicar SOLO cuando el código con
-- Supabase Auth ya esté publicado en main y el login nuevo se haya
-- probado con al menos una cuenta de cada rol.
--
-- Quita todo acceso de `anon` a los datos y elimina el login anterior
-- (función login() + tabla usuarios con contraseñas "1234").
-- La función keepalive() (workflow de GitHub Actions) NO se toca.

drop policy if exists "anon rw comisiones"    on public.comisiones;
drop policy if exists "anon rw config_cortes" on public.config_cortes;
drop policy if exists "anon rw cortes"        on public.cortes;
drop policy if exists "anon rw evaluaciones"  on public.evaluaciones;
drop policy if exists "anon rw miembros"      on public.miembros;
drop policy if exists "anon rw talleres"      on public.talleres;

-- Defensa en profundidad: aunque alguien agregara por error una política
-- para anon, sin privilegios de tabla no tendría efecto.
revoke all on table
  public.comisiones, public.config_cortes, public.cortes,
  public.evaluaciones, public.miembros, public.talleres
from anon;

drop function if exists public.login(text, text);
drop table if exists public.usuarios;
