# Backend del Sistema EyC (Supabase)

Reemplaza el intento anterior con Google Sheets/Apps Script (abandonado por
un problema de autorización de Google que no se pudo destrabar). El
proyecto ya está creado y desplegado — esto es referencia de cómo quedó
armado, no un paso a paso pendiente.

- **Proyecto:** "EyC MINUME XVII" (organización "Personal" en Supabase).
  Es un proyecto **separado** del otro que ya tenían ("MINUME XVII", con
  `comisiones`/`usuarios`/`evaluaciones` propios) — no comparten datos ni
  tablas, aunque tengan nombres parecidos.
- **URL / llave pública:** ya están puestas en `js/config.js`
  (`CONFIG.SUPABASE_URL` / `CONFIG.SUPABASE_ANON_KEY`). No hay ningún
  paso de despliegue pendiente del lado del sitio.

## Cómo está armado

Una tabla por colección de `state.js` (las cuentas viven en Supabase Auth, ver abajo):

| Tabla | Columnas |
|---|---|
| `comisiones` | `id` (text, pk), `nombre`, `sigla` |
| `miembros` | `id` (uuid), `comision_id` (fk), `rol_key`, `nombre`, `activo`, `desde`, `hasta`, `continuidad` |
| `talleres` | `id` (uuid), `comision_id` (fk), `nombre`, `tipo`, `fecha`, `oradores` (jsonb), `cerrada` |
| `evaluaciones` | `id` (uuid), `comision_id`/`taller_id`/`miembro_id` (fk), `rol`, `nombre_miembro`, `respuestas`/`comentarios`/`puntos_dim` (jsonb), `puntaje_a`, `puntaje_total`, `actualizado`. Único por (`comision_id`,`taller_id`,`miembro_id`). |
| `cortes` | `id` (uuid), `comision_id`/`miembro_id` (fk), `rol_key`, `corte_key`, `comentario`, `semaforo_al_momento`, `promedio_al_momento`, `requiere_revision`, `fecha`, `decision_estado`/`decision_comentario`/`decision_fecha` (el `decisionSga` del sitio, aplanado). Único por (`miembro_id`,`corte_key`). |
| `config_cortes` | `key` (pk: `corte1`/`corte2`/`final`), `inicio` |
| ~~`usuarios`~~ | Esquema de login anterior (contraseña `1234` para todos). Se usa solo como fuente de `crear_cuentas.sql` y se **borra en la fase B** — las cuentas viven en `auth.users`. |

`js/data-service.js` traduce entre el `snake_case` de Postgres y el
`camelCase` que usa el resto del sitio (`comision_id` ↔ `comisionId`, etc.)
— es la única frontera entre los dos, el resto del código no cambió.

**Login: Supabase Auth.** Cada cuenta es un usuario de `auth.users` con
email sintético `<usuario>@eyc-minume.invalid` (`CONFIG.AUTH_EMAIL_DOMAIN`
en `js/config.js`; `.invalid` es un TLD reservado, nunca llega correo a
nadie). En pantalla se sigue escribiendo solo el usuario (`ctd`, `sg`...).
El rol y la comisión van en `app_metadata` (`rol`, `comision_id`), que solo
el servidor puede escribir y que viaja dentro del JWT. supabase-js guarda
la sesión en `localStorage` y renueva el token sola; lo que diga el
navegador no da acceso a nada: cada consulta lleva el JWT y las políticas
RLS deciden.

- **Primer ingreso:** las cuentas se crean con una contraseña temporal
  única y `app_metadata.debe_cambiar_contrasena = true`. Mientras ese flag
  esté activo, `public.app_rol()` devuelve `NULL` y RLS no entrega ningún
  dato; el login muestra el formulario de contraseña nueva. Un trigger en
  `auth.users` (`limpiar_flag_contrasena`) quita el flag en cuanto cambia
  el hash.
- **Crear las cuentas:** `supabase/scripts/crear_cuentas.sql`, una por cada
  fila de la tabla vieja `usuarios`. Devuelve usuario + contraseña temporal
  **una sola vez**; no se guarda en ningún lado.
- **Resetear una contraseña olvidada:**
  `supabase/scripts/resetear_contrasena.sql` (cambiar el usuario), desde el
  SQL Editor. Genera una temporal nueva y vuelve a exigir el cambio.
- **Agregar una cuenta nueva:** Authentication → Users → Add user, con
  email `<usuario>@eyc-minume.invalid` y "Auto confirm"; después, en el
  SQL Editor:
  ```sql
  update auth.users
     set raw_app_meta_data = raw_app_meta_data
         || '{"rol":"eyc","comision_id":"ctd","debe_cambiar_contrasena":true}'::jsonb
   where email = 'nuevo@eyc-minume.invalid';
  ```
- **Registro público desactivado:** en Authentication → Sign In / Providers,
  "Allow new users to sign up" debe estar **apagado**. Aunque alguien se
  registrara, su cuenta no tendría `rol` y RLS no le daría nada, pero no
  hay razón para permitirlo.

## Seguridad (RLS)

Políticas en `supabase/migrations/20261001000001_auth_fase_a.sql`, todas
para el rol `authenticated` y basadas en `public.app_rol()` /
`public.app_comision()` (leen el JWT):

| Tabla | Leer | Escribir |
|---|---|---|
| `comisiones` | todos los roles | nadie (solo admin) |
| `config_cortes` | todos | `subse` (update) |
| `miembros`, `talleres`, `evaluaciones` | `subse`, `sg`: todo · `eyc`: su comisión | igual que leer (insert/update; delete solo en `talleres`) |
| `cortes` | `subse`, `sg`: todo · `eyc`: su comisión | insert: `subse` · update: `subse`, `sg` |

- `anon` (la llave pública) **no tiene acceso a ninguna tabla** después de
  la fase B (`20261001000002_auth_fase_b.sql`), que además borra la función
  `login()` y la tabla `usuarios` del esquema anterior. Lo único que `anon`
  puede llamar es `keepalive()` (ver abajo).
- Un `UPDATE`/`DELETE` que RLS no permite no da error en PostgREST: afecta
  0 filas. `dataService` lo detecta (`conFilas_`) y lo reporta como fallo
  de guardado, para que la UI nunca diga "guardado" sin que lo esté.
- Los nombres y evaluaciones son datos reales de personas — tenerlo
  presente al decidir quién más tiene acceso de administrador a este
  proyecto de Supabase (un admin del proyecto ve todo, sin pasar por RLS).

### Orden de despliegue (una sola vez)

1. Aplicar la **fase A** (aditiva: el sitio publicado sigue andando con
   las políticas viejas de `anon`).
2. Correr `crear_cuentas.sql` y guardar las contraseñas temporales.
3. Probar el código nuevo en local (`python3 -m http.server`) contra la
   base real, con una cuenta de cada rol.
4. Mergear a `main` (GitHub Pages publica en ~1 min).
5. Aplicar la **fase B**. Desde acá el sitio viejo ya no puede leer nada.
6. Repartir las contraseñas temporales por un canal privado.

## Que no se pause por inactividad

El plan gratis de Supabase pausa un proyecto tras **7 días sin actividad**.
`.github/workflows/keep-supabase-awake.yml` le hace una consulta liviana
cada 3 días (vía GitHub Actions, gratis) para que nunca llegue a esos 7 —
no hace falta configurar nada, corre solo en cuanto este archivo esté en
GitHub. Se puede disparar a mano desde **Actions → Keep Supabase awake →
Run workflow** para probarlo.

Si el proyecto ya se pausó (por ejemplo, uno viejo que quedó inactivo antes
de que existiera este workflow), se reactiva desde el dashboard de
Supabase (aviso de "Project paused" → **Restore**) — tarda un par de
minutos.

## Sin transacciones reales

`decidirCorte()` toca dos filas a la vez (`cortes` y `miembros`) con dos
escrituras separadas, no una transacción — un fallo de red justo entre
medio podría dejarlas desincronizadas. Aceptable a esta escala (un evento,
cientos de filas), pero no es una garantía real.
