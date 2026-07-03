import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';
import { checkPlanActive, checkCustomerLimit } from '../middlewares/plan.middleware';

const router = Router();

// Listar clientes
// ✅ B5: Paginação opcional via ?page= e ?limit=
// Sem params → retorna todos os registros (comportamento idêntico ao anterior)
// Com params → retorna a fatia solicitada
// Headers adicionados em ambos os casos (não breaking):
//   X-Total-Count, X-Total-Pages, X-Current-Page
router.get('/', authMiddleware, checkPlanActive, async (req, res) => {
  try {
    const { search } = req.query;
    const barbershopId = req.user!.barbershopId!;

    const where: any = { barbershopId };
    if (search) {
      where.name = { contains: search as string, mode: 'insensitive' };
    }

    // ✅ Paginação ativa apenas quando params são fornecidos explicitamente
    const paginate  = req.query.page !== undefined || req.query.limit !== undefined;
    const page      = paginate ? Math.max(1, parseInt(req.query.page  as string) || 1)  : 1;
    const limit     = paginate ? Math.min(parseInt(req.query.limit as string) || 50, 500) : undefined;
    const skip      = paginate && limit ? (page - 1) * limit : undefined;

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        include: {
          _count: {
            select: { appointments: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        ...(paginate && limit !== undefined ? { take: limit, skip } : {})
      }),
      prisma.customer.count({ where })
    ]);

    res.setHeader('X-Total-Count',  total);
    res.setHeader('X-Total-Pages',  paginate && limit ? Math.ceil(total / limit) : 1);
    res.setHeader('X-Current-Page', page);

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