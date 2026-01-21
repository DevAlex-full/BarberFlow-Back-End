import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Listar serviços
router.get('/', authMiddleware, async (req, res) => {
  try {
    const services = await prisma.service.findMany({
      where: { barbershopId: req.user!.barbershopId! },
      include: { barber: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' }
    });

    return res.json(services);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao buscar serviços' });
  }
});

// Criar serviço
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, description, price, duration, barberId } = req.body;

    const service = await prisma.service.create({
      data: {
        name,
        description,
        price: parseFloat(price),
        duration: parseInt(duration),
        barbershopId: req.user!.barbershopId!,
        barberId: barberId || null
      }
    });

    return res.status(201).json(service);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao criar serviço' });
  }
});

// Atualizar serviço
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, duration, barberId, active } = req.body;

    const service = await prisma.service.update({
      where: { id },
      data: {
        name,
        description,
        price: price ? parseFloat(price) : undefined,
        duration: duration ? parseInt(duration) : undefined,
        barberId: barberId || null,
        active
      }
    });

    return res.json(service);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao atualizar serviço' });
  }
});

// Deletar serviço
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.service.delete({
      where: { id }
    });

    return res.json({ message: 'Serviço deletado com sucesso' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao deletar serviço' });
  }
});

export default router;