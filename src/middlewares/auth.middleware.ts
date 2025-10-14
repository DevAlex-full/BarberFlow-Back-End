import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { TokenPayload } from '../types/express';

// ✅ REMOVIDO: Declaração duplicada de tipos (já está em src/types/express.d.ts)

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const [, token] = authHeader.split(' ');

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
    
    // ✅ Agora atribui ao req.user com a tipagem correta
    req.user = {
      id: decoded.id,
      email: decoded.email,
      barbershopId: decoded.barbershopId,
      role: decoded.role as 'ADMIN' | 'BARBER', // Cast explícito
    };
    
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  // ✅ Corrigido: 'admin' → 'ADMIN' (maiúsculo, conforme o tipo)
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }
  return next();
};