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

Una tabla por colección de `state.js`, más `usuarios` para el login:

| Tabla | Columnas |
|---|---|
| `comisiones` | `id` (text, pk), `nombre`, `sigla` |
| `miembros` | `id` (uuid), `comision_id` (fk), `rol_key`, `nombre`, `activo`, `desde`, `hasta`, `continuidad` |
| `talleres` | `id` (uuid), `comision_id` (fk), `nombre`, `tipo`, `fecha`, `oradores` (jsonb), `cerrada` |
| `evaluaciones` | `id` (uuid), `comision_id`/`taller_id`/`miembro_id` (fk), `rol`, `nombre_miembro`, `respuestas`/`comentarios`/`puntos_dim` (jsonb), `puntaje_a`, `puntaje_total`, `actualizado`. Único por (`comision_id`,`taller_id`,`miembro_id`). |
| `cortes` | `id` (uuid), `comision_id`/`miembro_id` (fk), `rol_key`, `corte_key`, `comentario`, `semaforo_al_momento`, `promedio_al_momento`, `requiere_revision`, `fecha`, `decision_estado`/`decision_comentario`/`decision_fecha` (el `decisionSga` del sitio, aplanado). Único por (`miembro_id`,`corte_key`). |
| `config_cortes` | `key` (pk: `corte1`/`corte2`/`final`), `inicio` |
| `usuarios` | `id` (uuid), `usuario` (unique), `contrasena_hash`, `rol` (`eyc`\|`subse`\|`sg`), `comision_id` (fk, solo para `eyc`) |

`js/data-service.js` traduce entre el `snake_case` de Postgres y el
`camelCase` que usa el resto del sitio (`comision_id` ↔ `comisionId`, etc.)
— es la única frontera entre los dos, el resto del código no cambió.

**Login (`js/render-login.js` → `dataService.login()`):** llama a una
función de Postgres, `public.login(usuario, contrasena)`, que compara
contra `contrasena_hash` con `pgcrypto` (hash real con `crypt()`/
`gen_salt('bf')`, **no texto plano** — mejor que el intento anterior con
Sheets). La función es `SECURITY DEFINER`, así puede leer
`usuarios.contrasena_hash` aunque el rol público (`anon`) no tenga permiso
directo sobre esa tabla — es la única puerta de entrada a `usuarios`.

**Cuentas de arranque, todas con contraseña `cambiame`:**
`sg`, `subse`, y una por comisión de EyC con el usuario igual al `id` de
su comisión (`ctd`, `pnud`, `cop`, ...). **Cámbienlas antes de repartir el
acceso real** — se editan directo en la tabla `usuarios` desde el panel de
Supabase (Table Editor), o con SQL:
```sql
update usuarios set contrasena_hash = crypt('la-nueva-contraseña', gen_salt('bf'))
where usuario = 'ctd';
```

## Seguridad (RLS)

- `comisiones`/`miembros`/`talleres`/`evaluaciones`/`cortes`/`config_cortes`:
  RLS activo con una política abierta a lectura/escritura para el rol
  `anon` (la llave pública). El sitio es estático sin sesión de servidor
  propia, así que esto es el mismo nivel de "seguridad" que ya se venía
  aceptando con el token compartido de Apps Script: frena a quien encuentre
  la URL de casualidad, no a un atacante decidido — cualquiera con la
  llave pública (que viaja en el JS del cliente, visible en las
  herramientas de desarrollador) puede leer y escribir estas tablas
  directo, sin pasar por el sitio.
- `usuarios`: RLS activo **sin ninguna política** para `anon` — cero
  acceso directo. Solo `login()` (que corre con privilegios propios, no
  los de `anon`) puede leerla. Las contraseñas están hasheadas, así que
  aunque alguien accediera a la tabla no vería contraseñas en texto plano.
- Los nombres y evaluaciones son datos reales de personas — tenerlo
  presente al decidir quién más tiene acceso de administrador a este
  proyecto de Supabase (un admin del proyecto ve todo, sin pasar por RLS).

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
