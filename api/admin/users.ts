import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z, ZodError } from 'zod';
import { verifyAdminSession } from '../_auth.js';
import { generateScryptPasswordHash } from '../_password.js';
import { getSupabaseAdminClient } from '../kommo/_shared.js';

const createUserSchema = z.object({
  email: z.string().trim().email('El email es inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  role: z.enum(['admin', 'user']),
  is_active: z.boolean().optional(),
});

interface AdminAccessUserListRow {
  id: string | number;
  email: string;
  role: 'admin' | 'user' | string;
  is_active: boolean;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isMissingAdminUsersTableError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message.includes("Could not find the table 'public.admin_access_users'");
}

function isDuplicateEmailError(error: unknown) {
  if (!error || typeof error !== 'object') return false;

  const code = (error as { code?: unknown }).code;
  const message = String((error as { message?: unknown }).message ?? '').toLowerCase();
  return code === '23505' || message.includes('duplicate key') || message.includes('already exists');
}

export default async function adminUsersHandler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = verifyAdminSession(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ success: false, error: auth.error ?? 'No autorizado' });
    }

    const supabase = getSupabaseAdminClient();

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('admin_access_users' as never)
        .select('id,email,role,is_active' as never)
        .order('email', { ascending: true });

      if (error) {
        if (isMissingAdminUsersTableError(error)) {
          return res.status(500).json({
            success: false,
            error: 'No existe la tabla admin_access_users. Ejecutá la configuración de seguridad en la base de datos.',
          });
        }

        throw new Error(error.message || 'No se pudo listar usuarios');
      }

      const users = ((data ?? []) as AdminAccessUserListRow[]).map((row) => ({
        id: String(row.id),
        email: normalizeEmail(row.email),
        role: row.role === 'user' ? 'user' : 'admin',
        is_active: row.is_active === true,
      }));

      return res.status(200).json({ success: true, users });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Método no permitido' });
    }

    const rawBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const parsed = createUserSchema.parse(rawBody ?? {});

    const email = normalizeEmail(parsed.email);
    const passwordHash = generateScryptPasswordHash(parsed.password);
    const role = parsed.role;
    const isActive = parsed.is_active ?? true;

    const { data, error } = await supabase
      .from('admin_access_users' as never)
      .insert({
        email,
        password_hash: passwordHash,
        role,
        is_active: isActive,
      } as never)
      .select('id,email,role,is_active' as never)
      .limit(1);

    if (error) {
      if (isMissingAdminUsersTableError(error)) {
        return res.status(500).json({
          success: false,
          error: 'No existe la tabla admin_access_users. Ejecutá la configuración de seguridad en la base de datos.',
        });
      }

      if (isDuplicateEmailError(error)) {
        return res.status(409).json({ success: false, error: 'Ya existe un usuario con ese email.' });
      }

      throw new Error(error.message || 'No se pudo crear el usuario');
    }

    const created = ((data ?? []) as AdminAccessUserListRow[])[0];
    if (!created) {
      throw new Error('No se pudo confirmar la creación del usuario');
    }

    return res.status(201).json({
      success: true,
      user: {
        id: String(created.id),
        email: normalizeEmail(created.email),
        role: created.role === 'user' ? 'user' : 'admin',
        is_active: created.is_active === true,
      },
    });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return res.status(400).json({ success: false, error: 'Cuerpo de solicitud inválido', details: error.issues });
    }

    if (error instanceof SyntaxError) {
      return res.status(400).json({ success: false, error: 'JSON inválido en la solicitud' });
    }

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Error interno del servidor',
    });
  }
}
