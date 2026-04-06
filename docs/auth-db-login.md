# Hardening de login admin con base de datos

Este proyecto usa login de administración por **email + contraseña** contra Supabase (`admin_access_users`) y cookie `auth_token` con JWT.

## 1) SQL base sugerido

> Ejecutá esto en Supabase SQL Editor (ajustá tipos según tu política interna).

```sql
create table if not exists public.admin_access_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  is_active boolean not null default true,
  role text not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_access_users_email_idx
  on public.admin_access_users (lower(email));
```

## 2) Generar hash de contraseña (scrypt)

No hay registro público. El alta de usuarios admin es manual.

### Opción A: por argumento

```bash
npm run auth:hash-admin-password -- "MiClaveSegura123!"
```

### Opción B: interactivo

```bash
npm run auth:hash-admin-password
```

El comando imprime un hash con formato:

```text
scrypt$N$r$p$<salt_base64>$<hash_base64>
```

## 3) Insertar usuario admin manualmente

```sql
insert into public.admin_access_users (email, password_hash, is_active, role)
values ('admin@tuempresa.com', '<PEGÁ_ACÁ_EL_HASH>', true, 'admin');
```

## 4) Variables de entorno requeridas

- `JWT_SECRET` (obligatoria)
- `SUPABASE_URL` o `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## 5) Notas de seguridad implementadas

- Validación de payload server-side con Zod.
- Mensaje genérico para credenciales inválidas (evita enumeración de usuarios).
- Rate-limit + lockout en endpoint de login.
- Hashing seguro con `crypto.scrypt` + salt + `timingSafeEqual`.
- Verificación de claims JWT obligatoria en rutas protegidas:
  - `iss`
  - `aud`
  - `role=admin`
  - `sub` presente
