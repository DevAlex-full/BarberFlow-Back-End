import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // Verificar se o usuário está autenticado (já passa pelo authMiddleware)
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    // Buscar usuário no banco
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Verificar se é admin/super-admin
    // Você pode adicionar um campo "isSuperAdmin" na tabela users
    // Ou verificar por email específico
    const ADMIN_EMAILS = [
      'alex.bueno@hotmail.com',
      'appbarberflow@gmail.com'
    ];

    if (!ADMIN_EMAILS.includes(user.email)) {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }

    next();
  } catch (error) {
    console.error('Erro no middleware admin:', error);
    return res.status(500).json({ error: 'Erro ao verificar permissões' });
  }
}