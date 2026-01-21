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

    // ✅ EMAIL ATUALIZADO DO SUPER ADMIN
    const ADMIN_EMAILS = [
      'alex.bueno22@hotmail.com',  // ✅ NOVO EMAIL
      'appbarberflow@gmail.com'
    ];

    if (!ADMIN_EMAILS.includes(user.email)) {
      console.log('⛔ Acesso negado para:', user.email);
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }

    console.log('✅ Super Admin autorizado:', user.email);
    next();
  } catch (error) {
    console.error('Erro no middleware admin:', error);
    return res.status(500).json({ error: 'Erro ao verificar permissões' });
  }
}