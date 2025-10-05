import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middlewares/auth.middleware';
import { checkPlanActive, checkCustomerLimit } from '../middlewares/plan.middleware';

const router = Router();
const prisma = new PrismaClient();

// Listar clientes
router.get('/', authMiddleware, checkPlanActive, async (req, res) => {
  try {
    const customers = await prisma.customer.findMany({
      where: { barbershopId: req.user!.barbershopId! },
      include: {
        _count: {
          select: { appointments: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.json(customers);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao buscar clientes' });
  }
});

// Buscar cliente por ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        appointments: {
          include: {
            service: true,
            barber: { select: { name: true } }
          },
          orderBy: { date: 'desc' }
        }
      }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    return res.json(customer);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao buscar cliente' });
  }
});

// Criar cliente
router.post('/', authMiddleware, checkPlanActive, checkCustomerLimit, async (req, res) => {
  try {
    const { name, email, phone, birthDate, notes } = req.body;

    const customer = await prisma.customer.create({
      data: {
        name,
        email,
        phone,
        birthDate: birthDate ? new Date(birthDate) : null,
        notes,
        barbershopId: req.user!.barbershopId!
      }
    });

    return res.status(201).json(customer);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao criar cliente' });
  }
});

// Atualizar cliente
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, birthDate, notes, active } = req.body;

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        name,
        email,
        phone,
        birthDate: birthDate ? new Date(birthDate) : null,
        notes,
        active
      }
    });

    return res.json(customer);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao atualizar cliente' });
  }
});

// Deletar cliente
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.customer.delete({
      where: { id }
    });

    return res.json({ message: 'Cliente deletado com sucesso' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao deletar cliente' });
  }
});

export default router;