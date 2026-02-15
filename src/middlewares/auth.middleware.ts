import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { TokenPayload } from '../types/express';

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const [, token] = authHeader.split(' ');

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
    
    req.user = {
      id: decoded.id,
      email: decoded.email,
      barbershopId: decoded.barbershopId,
      role: decoded.role as 'ADMIN' | 'BARBER',
    };
    
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// ✅ CORRIGIDO: Aceita 'admin' ou 'ADMIN' (case-insensitive)
export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  const role = req.user?.role?.toLowerCase();
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔐 Verificação isAdmin:');
  console.log('   User ID:', req.user?.id);
  console.log('   Role:', req.user?.role);
  console.log('   BarbershopId:', req.user?.barbershopId);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (role !== 'admin') {
    console.log('❌ Acesso negado: role não é admin');
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }
  
  console.log('✅ isAdmin passou!');
  return next();
};

// ✅ NOVO: Middleware específico para rotas que precisam de barbershopId
export const requireBarbershop = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user?.barbershopId) {
    console.log('❌ Acesso negado: usuário não tem barbershopId');
    return res.status(403).json({ 
      error: 'Esta ação requer que você esteja vinculado a uma barbearia.' 
    });
  }
  
  console.log('✅ requireBarbershop passou! BarbershopId:', req.user.barbershopId);
  return next();
};