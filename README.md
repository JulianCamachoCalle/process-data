# Process Data — Panel logístico con Google Sheets

Aplicación React + API routes de Vercel para operar múltiples hojas de Google Sheets con autenticación administrativa.

## Arquitectura real actual

- **Frontend**: React + React Router + React Query.
- **Backend**: rutas en `api/*.ts` desplegadas como funciones serverless (Vercel).
- **Persistencia**: Google Sheets vía `google-spreadsheet` autenticando con **Service Account**.
- **Autenticación**:
  - Login por contraseña (`ADMIN_PASSWORD`) en backend.
  - Emisión de JWT firmado con `JWT_SECRET`.
  - JWT almacenado en **cookie httpOnly** (`auth_token`) con `SameSite=Lax`, `Path=/`, `Max-Age=8h` y `Secure` en producción.
  - Frontend **no** guarda token en `localStorage`.

## Flujo de autenticación

### 1) Login

- `POST /api/auth`
- Body: `{ "password": "..." }`
- Si es válido, backend responde `Set-Cookie` con JWT httpOnly y `{ success: true }`.

### 2) Verificación de sesión

- `GET /api/auth`
- Valida la cookie y responde:
  - `200 { authenticated: true }` si la sesión está activa.
  - `401 { authenticated: false }` si no hay sesión válida.

### 3) Logout

- `DELETE /api/auth`
- Limpia la cookie y responde `{ success: true }`.

## Seguridad de APIs de datos

- `api/sheet.ts` valida JWT exclusivamente desde cookie httpOnly.
- El frontend envía cookies con `credentials: 'include'` en login, logout, verificación y CRUD.

## Identidad estable por fila

Para evitar inconsistencias por orden/cambios en Google Sheets:

- Se usa columna técnica `__id` como identidad estable de negocio.
- En lectura, si alguna fila no tiene `__id`, se genera UUID y se persiste.
- El frontend recibe `_id` para update/delete.
- `_rowIndex` queda como metadato opcional de debug/display, no identidad primaria.

## Variables de entorno requeridas

- `ADMIN_PASSWORD`
- `JWT_SECRET`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_SHEET_ID`

### Variables frontend (Vite) para Supabase

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

> Si estas dos variables existen, las hojas base (`DESTINOS`, `TIENDAS`, `COURIER`, `VENDEDORES`, `FULLFILMENT`, `ORIGEN`, `RESULTADOS`, `TIPO DE PUNTO`, `TIPO DE RECOJO`) se leen/escriben desde Supabase. Hojas operativas (`ENVIOS`, `RECOJOS`, `LEADS GANADOS`, etc.) siguen por Google Sheets mientras avanza la migración.

Además, `TARIFAS` ya está migrada a Supabase (con FK lógica a destino por `id_destino` y formulario por `Destino` visible).

## Desarrollo local

```bash
npm install
npm run dev
```

## Calidad

```bash
npm run lint
```

## Prewarm/Backfill de IDs antes de producción

Para evitar la latencia del primer acceso (cuando se crean `__id` faltantes), ejecutá un backfill global después del deploy:

- Endpoint: `POST /api/backfill-ids`
- Seguridad: requiere cookie httpOnly `auth_token` válida (mismo esquema de auth que `api/sheet.ts`).
- Comportamiento: recorre todas las hojas del documento, garantiza `__id` por fila y devuelve un resumen por hoja (`title`, `rowCount`, `hadBackfill`, `durationMs`).

Ejemplo rápido (desde navegador autenticado o cliente que envíe cookies):

```bash
curl -X POST https://<tu-dominio>/api/backfill-ids \
  --cookie "auth_token=<jwt>"
```

Es idempotente: si todas las filas ya tienen `__id`, responde sin cambios y con menor costo/latencia.

## Sync asíncrona Supabase → Google Sheets (tablas base)

- Endpoint: `POST /api/sync-outbox`
- Seguridad:
  - Opción A: cookie `auth_token` válida (admin logueado)
  - Opción B: header `x-sync-secret` con `SYNC_OUTBOX_SECRET`
- Requisitos de entorno backend:
  - `SUPABASE_URL` (o `VITE_SUPABASE_URL` como fallback)
  - `SUPABASE_SERVICE_ROLE_KEY`
- `SYNC_OUTBOX_SECRET` (recomendado para cron)

Entidades soportadas actualmente por el worker:

- `destinos` → `DESTINOS`
- `tiendas` → `TIENDAS`
- `courier` → `COURIER`
- `vendedores` → `VENDEDORES`
- `fullfilment` → `FULLFILMENT`
- `origen` → `ORIGEN`
- `resultados` → `RESULTADOS`
- `tipo_punto` → `TIPO DE PUNTO`
- `tipo_recojo` → `TIPO DE RECOJO`
- `tarifas` → `TARIFAS`

Ejemplo manual desde terminal:

```bash
curl -X POST https://<tu-dominio>/api/sync-outbox \
  -H "x-sync-secret: <SYNC_OUTBOX_SECRET>" \
  -H "content-type: application/json" \
  -d '{"limit":20}'
```

### Cron automático en Vercel

- Ruta del cron: `GET/POST /api/cron/sync-outbox`
- Configurado en `vercel.json` cada 1 minuto.
- Importante: en variables de entorno de Vercel debés definir:
  - `SYNC_OUTBOX_SECRET`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

> Si los eventos quedan en `pending`, primero probá ejecución manual de `/api/sync-outbox` y revisá logs de función (`[sync-outbox] error ...`).
