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
    // ✅ C4: Guard de JWT_SECRET — falha explícita em vez de asserção silenciosa com !
    // ANTES: jwt.verify(token, process.env.JWT_SECRET!) — o ! suprime o erro de tipo mas
    //        não previne o crash em runtime se a variável não estiver definida.
    // DEPOIS: verificação explícita com resposta controlada de 500.
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('❌ FATAL: JWT_SECRET não definido nas variáveis de ambiente');
      return res.status(500).json({ error: 'Erro de configuração do servidor' });
    }

    const decoded = jwt.verify(token, jwtSecret) as TokenPayload;

    req.user = {
      id:           decoded.id,
      email:        decoded.email,
      barbershopId: decoded.barbershopId,
      role:         decoded.role as 'ADMIN' | 'BARBER',
    };

    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// ✅ CORRIGIDO: Aceita 'admin' ou 'ADMIN' (case-insensitive)
// ✅ C3: Removidos console.log com PII (User ID, Role, BarbershopId) — dados sensíveis
//        não devem aparecer em logs de produção em cada request autenticado.
export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  const role = req.user?.role?.toLowerCase();

  if (role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }

  return next();
};

// ✅ Middleware específico para rotas que precisam de barbershopId
// ✅ C3: Removido console.log com barbershopId — dado sensível de tenant
export const requireBarbershop = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user?.barbershopId) {
    return res.status(403).json({
      error: 'Esta ação requer que você esteja vinculado a uma barbearia.'
    });
  }

  return next();
};