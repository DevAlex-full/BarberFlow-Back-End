import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, isAdmin } from '../middlewares/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

// Buscar dados da barbearia
router.get('/', authMiddleware, async (req, res) => {
  try {
    const barbershop = await prisma.barbershop.findUnique({
      where: { id: req.user!.barbershopId! },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            phone: true,
            active: true
          }
        }
      }
    });

    if (!barbershop) {
      return res.status(404).json({ error: 'Barbearia não encontrada' });
    }

    return res.json(barbershop);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao buscar barbearia' });
  }
});

// Atualizar dados da barbearia
router.put('/', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { name, phone, address, city, state } = req.body;

    const barbershop = await prisma.barbershop.update({
      where: { id: req.user!.barbershopId! },
      data: { name, phone, address, city, state }
    });

    return res.json(barbershop);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao atualizar barbearia' });
  }
});

export default router;