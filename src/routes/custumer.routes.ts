import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';
import { checkPlanActive, checkCustomerLimit } from '../middlewares/plan.middleware';

const router = Router();

// Listar clientes
router.get('/', authMiddleware, checkPlanActive, async (req, res) => {
  try {
    const { search } = req.query;
    const where: any = { barbershopId: req.user!.barbershopId! };
    if (search) {
      where.name = { contains: search as string, mode: 'insensitive' };
    }

    const customers = await prisma.customer.findMany({
      where,
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

// ✅ SEGURANÇA: IDOR corrigido — findFirst com barbershopId garante isolamento de tenant
// Buscar cliente por ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const barbershopId = req.user!.barbershopId!;

    // Garante que o cliente pertence à barbearia do usuário autenticado
    const customer = await prisma.customer.findFirst({
      where: { id, barbershopId },
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

// ✅ SEGURANÇA: IDOR corrigido — verifica se o cliente pertence à barbearia do usuário
// Atualizar cliente
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const barbershopId = req.user!.barbershopId!;
    const { name, email, phone, birthDate, notes, active } = req.body;

    // Garante que o cliente pertence à barbearia do usuário autenticado
    const existing = await prisma.customer.findFirst({
      where: { id, barbershopId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

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

// ✅ SEGURANÇA: IDOR corrigido — verifica se o cliente pertence à barbearia do usuário
// Deletar cliente
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const barbershopId = req.user!.barbershopId!;

    // Garante que o cliente pertence à barbearia do usuário autenticado
    const existing = await prisma.customer.findFirst({
      where: { id, barbershopId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

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