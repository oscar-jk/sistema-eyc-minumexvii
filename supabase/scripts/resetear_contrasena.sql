-- Resetea la contraseña de UNA cuenta a una temporal nueva y vuelve a
-- exigir el cambio en el próximo ingreso. Cambiar 'ctd' (las dos veces)
-- por el usuario. Correr todo junto en el SQL Editor; la última consulta
-- muestra la contraseña temporal (una sola vez).
--
-- Son pasos separados a propósito: el trigger limpiar_flag_contrasena
-- quita el flag cada vez que cambia el hash, así que el flag se vuelve a
-- poner DESPUÉS de cambiar la contraseña.

drop table if exists _clave;
create temporary table _clave as
select string_agg(substr('abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                         1 + (get_byte(b.bytes, i) % 55), 1), '') as c
from (select extensions.gen_random_bytes(12) as bytes) b, generate_series(0, 11) i;

update auth.users
   set encrypted_password = extensions.crypt((select c from _clave), extensions.gen_salt('bf')),
       updated_at = now()
 where email = 'ctd' || '@eyc-minume.invalid';

update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"debe_cambiar_contrasena": true}'::jsonb
 where email = 'ctd' || '@eyc-minume.invalid';

select 'ctd' as usuario, c as contrasena_temporal from _clave;
