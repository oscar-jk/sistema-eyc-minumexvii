-- Fase A (aditiva, NO rompe el sitio actual): helpers de rol, trigger de
-- cambio de contraseña y políticas RLS para usuarios autenticados.
-- Las políticas abiertas a `anon` siguen vivas hasta la fase B, así el
-- sitio publicado sigue funcionando mientras se prueba el nuevo login.
-- Después de esta migración correr supabase/scripts/crear_cuentas.sql.

-- ---------- Helpers ----------
-- Rol de la cuenta, leído del JWT (app_metadata solo lo escribe el
-- servidor). Mientras la cuenta tenga la contraseña temporal devuelve
-- NULL: ninguna política deja pasar, así que no hay acceso a datos hasta
-- que la persona elija su propia contraseña.
create or replace function public.app_rol() returns text
language sql stable
set search_path = ''
as $$
  select case
    when coalesce((auth.jwt() -> 'app_metadata' ->> 'debe_cambiar_contrasena')::boolean, false) then null
    else auth.jwt() -> 'app_metadata' ->> 'rol'
  end
$$;

create or replace function public.app_comision() returns text
language sql stable
set search_path = ''
as $$
  select auth.jwt() -> 'app_metadata' ->> 'comision_id'
$$;

-- ---------- Cambio obligatorio de contraseña ----------
-- Al cambiar el hash (la persona eligió su contraseña, o un admin la
-- reseteó) se quita el flag. El cliente pide un JWT nuevo después.
create or replace function public.limpiar_flag_contrasena() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb) - 'debe_cambiar_contrasena';
  end if;
  return new;
end;
$$;
revoke all on function public.limpiar_flag_contrasena() from public, anon, authenticated;

drop trigger if exists limpiar_flag_contrasena on auth.users;
create trigger limpiar_flag_contrasena
  before update of encrypted_password on auth.users
  for each row execute function public.limpiar_flag_contrasena();

-- ---------- Políticas para `authenticated` ----------
-- Lectura:
--   eyc   → solo su comisión (comisiones: todas, son solo nombres).
--   subse, sg → todo.
-- Escritura (refleja lo que la UI permite a cada rol):
--   eyc   → mesa (miembros), actividades y evaluaciones de su comisión.
--   subse → todo lo anterior en cualquier comisión + sustituir miembros,
--           cortes y fechas de fases (config_cortes).
--   sg    → actividades, evaluaciones, miembros (continuidad) y la
--           decisión sobre cortes (update).
-- comisiones es de solo lectura desde el cliente.

-- comisiones
drop policy if exists "auth lee comisiones" on public.comisiones;
create policy "auth lee comisiones" on public.comisiones
  for select to authenticated
  using ((select public.app_rol()) in ('eyc','subse','sg'));

-- config_cortes
drop policy if exists "auth lee config_cortes" on public.config_cortes;
create policy "auth lee config_cortes" on public.config_cortes
  for select to authenticated
  using ((select public.app_rol()) in ('eyc','subse','sg'));
drop policy if exists "subse edita config_cortes" on public.config_cortes;
create policy "subse edita config_cortes" on public.config_cortes
  for update to authenticated
  using ((select public.app_rol()) = 'subse')
  with check ((select public.app_rol()) = 'subse');

-- miembros, talleres, evaluaciones: mismo patrón por comisión
do $$
declare t text;
begin
  foreach t in array array['miembros','talleres','evaluaciones'] loop
    execute format('drop policy if exists "auth lee %1$s" on public.%1$I', t);
    execute format($p$
      create policy "auth lee %1$s" on public.%1$I for select to authenticated
      using (
        (select public.app_rol()) in ('subse','sg')
        or ((select public.app_rol()) = 'eyc' and comision_id = (select public.app_comision()))
      )$p$, t);

    execute format('drop policy if exists "auth inserta %1$s" on public.%1$I', t);
    execute format($p$
      create policy "auth inserta %1$s" on public.%1$I for insert to authenticated
      with check (
        (select public.app_rol()) in ('subse','sg')
        or ((select public.app_rol()) = 'eyc' and comision_id = (select public.app_comision()))
      )$p$, t);

    execute format('drop policy if exists "auth edita %1$s" on public.%1$I', t);
    execute format($p$
      create policy "auth edita %1$s" on public.%1$I for update to authenticated
      using (
        (select public.app_rol()) in ('subse','sg')
        or ((select public.app_rol()) = 'eyc' and comision_id = (select public.app_comision()))
      )
      with check (
        (select public.app_rol()) in ('subse','sg')
        or ((select public.app_rol()) = 'eyc' and comision_id = (select public.app_comision()))
      )$p$, t);
  end loop;
end $$;

-- Solo las actividades se borran desde la app (sus evaluaciones caen por
-- el ON DELETE CASCADE, que no pasa por RLS).
drop policy if exists "auth borra talleres" on public.talleres;
create policy "auth borra talleres" on public.talleres
  for delete to authenticated
  using (
    (select public.app_rol()) in ('subse','sg')
    or ((select public.app_rol()) = 'eyc' and comision_id = (select public.app_comision()))
  );

-- cortes: el EyC los ve en el histórico de su comisión; escribe el Subse;
-- el SG solo actualiza (decisión).
drop policy if exists "auth lee cortes" on public.cortes;
create policy "auth lee cortes" on public.cortes
  for select to authenticated
  using (
    (select public.app_rol()) in ('subse','sg')
    or ((select public.app_rol()) = 'eyc' and comision_id = (select public.app_comision()))
  );
drop policy if exists "subse inserta cortes" on public.cortes;
create policy "subse inserta cortes" on public.cortes
  for insert to authenticated
  with check ((select public.app_rol()) = 'subse');
drop policy if exists "secretaria edita cortes" on public.cortes;
create policy "secretaria edita cortes" on public.cortes
  for update to authenticated
  using ((select public.app_rol()) in ('subse','sg'))
  with check ((select public.app_rol()) in ('subse','sg'));
