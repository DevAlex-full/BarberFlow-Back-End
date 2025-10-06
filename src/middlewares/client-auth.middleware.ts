import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ClientPayload {
  id: string;
  type: 'client';
}

// Extender o tipo Request do Express
declare global {
  namespace Express {
    interface Request {
      client?: {
        id: string;
        name: string;
        email: string;
      };
    }
  }
}

export async function clientAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    const [, token] = authHeader.split(' ');

    if (!token) {
      return res.status(401).json({ error: 'Token mal formatado' });
    }

    // Verificar token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-secret-key'
    ) as ClientPayload;

    if (decoded.type !== 'client') {
      return res.status(401).json({ error: 'Tipo de token inválido' });
    }

    // Buscar cliente no banco
    const client = await prisma.client.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
      },
    });

    if (!client) {
      return res.status(401).json({ error: 'Cliente não encontrado' });
    }

    if (!client.active) {
      return res.status(401).json({ error: 'Conta desativada' });
    }

    // Adicionar cliente ao request
    req.client = client;

    next();
  } catch (error) {
    console.error('Erro na autenticação:', error);
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}