import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z, ZodError } from 'zod';
import jwt from 'jsonwebtoken';

const authBodySchema = z.object({
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const adminPassword = process.env.ADMIN_PASSWORD;
    const jwtSecret = process.env.JWT_SECRET;

    if (!adminPassword) {
      return res.status(500).json({ error: 'Falta la variable de entorno requerida: ADMIN_PASSWORD' });
    }

    if (!jwtSecret) {
      return res.status(500).json({ error: 'Falta la variable de entorno requerida: JWT_SECRET' });
    }

    const rawBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { password } = authBodySchema.parse(rawBody ?? {});

    if (password !== adminPassword) {
      return res.status(401).json({ error: 'Contraseña inválida' });
    }

    const token = jwt.sign({ role: 'admin' }, jwtSecret, { expiresIn: '8h' });
    return res.status(200).json({ token });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Cuerpo de solicitud inválido', details: error.issues });
    }

    if (error instanceof SyntaxError) {
      return res.status(400).json({ error: 'JSON inválido en la solicitud' });
    }

    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return res.status(500).json({ error: message });
  }
}
