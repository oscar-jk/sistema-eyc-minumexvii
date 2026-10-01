-- Crea una cuenta de Supabase Auth por cada fila de public.usuarios
-- (correr DESPUÉS de la fase A y ANTES de la fase B, que borra usuarios).
--
-- - Email sintético: <usuario>@eyc-minume.invalid (igual que
--   CONFIG.AUTH_EMAIL_DOMAIN en js/config.js).
-- - Rol y comisión en raw_app_meta_data (→ app_metadata del JWT; el
--   cliente no puede modificarlo).
-- - Contraseña temporal aleatoria y única (12 caracteres, sin 0/O/1/l/I),
--   con debe_cambiar_contrasena = true: hasta elegir una propia, RLS no
--   entrega datos (ver public.app_rol()).
-- - Idempotente: si la cuenta ya existe, no se toca.
--
-- El resultado (usuario + contraseña temporal) se muestra UNA sola vez:
-- copiarlo y repartirlo por un canal privado. No se guarda en ningún lado.

with nuevas as (
  select
    gen_random_uuid() as id,
    u.usuario,
    u.rol,
    u.comision_id,
    lower(u.usuario) || '@eyc-minume.invalid' as email,
    (select string_agg(substr('abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                              1 + (get_byte(b.bytes, i) % 55), 1), '')
       from (select extensions.gen_random_bytes(12) as bytes) b,
            generate_series(0, 11) i
      -- Referencia a la fila: sin esto la subconsulta no está correlacionada
      -- y Postgres la evalúa UNA vez (InitPlan) → misma clave para todos.
      where u.usuario is not null) as clave
  from public.usuarios u
  where not exists (
    select 1 from auth.users au where au.email = lower(u.usuario) || '@eyc-minume.invalid'
  )
),
ins_users as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  select
    '00000000-0000-0000-0000-000000000000', n.id, 'authenticated', 'authenticated',
    n.email, extensions.crypt(n.clave, extensions.gen_salt('bf')), now(),
    jsonb_strip_nulls(jsonb_build_object(
      'provider', 'email', 'providers', jsonb_build_array('email'),
      'rol', n.rol, 'comision_id', n.comision_id,
      'debe_cambiar_contrasena', true
    )),
    '{}'::jsonb, now(), now(), '', '', '', ''
  from nuevas n
  returning id
),
ins_identities as (
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), n.id, n.id::text, 'email',
         jsonb_build_object('sub', n.id::text, 'email', n.email, 'email_verified', true),
         null, now(), now()
  from nuevas n
  where n.id in (select id from ins_users)
  returning user_id
)
select n.usuario, n.rol, n.comision_id, n.clave as contrasena_temporal
from nuevas n
where n.id in (select user_id from ins_identities)
order by n.rol desc, n.usuario;
