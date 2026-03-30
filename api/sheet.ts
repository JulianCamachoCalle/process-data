import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z, ZodError } from 'zod';
import jwt from 'jsonwebtoken';
import { getGoogleSheet, getRawSheet } from '../src/lib/google-sheets';

const querySchema = z.object({
  name: z.string().min(1, 'El nombre de la hoja es obligatorio'),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { name } = querySchema.parse(req.query);

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ error: 'Falta la variable de entorno requerida: JWT_SECRET' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    try {
      jwt.verify(token, jwtSecret);
    } catch {
      return res.status(401).json({ error: 'No autorizado' });
    }

    if (req.method === 'GET') {
      const data = await getGoogleSheet(name);
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      return res.status(200).json(data);
    } 
    
    else if (req.method === 'POST') {
      const sheet = await getRawSheet(name);
      await sheet.addRow(req.body);
      return res.status(201).json({ success: true });
    } 
    
    else if (req.method === 'PUT' || req.method === 'PATCH') {
      const { _rowIndex, ...updateData } = req.body;
      if (typeof _rowIndex !== 'number') {
        return res.status(400).json({ error: 'El campo _rowIndex es obligatorio' });
      }
      const sheet = await getRawSheet(name);
      const rows = await sheet.getRows();
      if (!rows[_rowIndex]) {
        return res.status(404).json({ error: 'Registro no encontrado' });
      }
      
      rows[_rowIndex].assign(updateData);
      await rows[_rowIndex].save();
      
      return res.status(200).json({ success: true });
    } 
    
    else if (req.method === 'DELETE') {
      const rowIndex = parseInt(req.query._rowIndex as string, 10);
      if (isNaN(rowIndex)) {
        return res.status(400).json({ error: 'El parámetro _rowIndex es obligatorio' });
      }
      const sheet = await getRawSheet(name);
      const rows = await sheet.getRows();
      if (!rows[rowIndex]) {
        return res.status(404).json({ error: 'Registro no encontrado' });
      }
      
      await rows[rowIndex].delete();
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (error: unknown) {
    console.error('API Error:', error);
    
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Parámetros de consulta inválidos', details: (error as any).issues });
    }
    
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return res.status(500).json({ error: message });
  }
}
