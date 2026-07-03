import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Listar serviços
// ✅ B5: Paginação opcional via ?page= e ?limit=
// Sem params → retorna todos os registros (comportamento idêntico ao anterior)
// Com params → retorna a fatia solicitada
// Headers adicionados em ambos os casos (não breaking):
//   X-Total-Count, X-Total-Pages, X-Current-Page
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { search, active } = req.query;
    const where: any = { barbershopId: req.user!.barbershopId! };

    if (search) {
      where.name = { contains: search as string, mode: 'insensitive' };
    }
    if (active === 'true') where.active = true;

    // ✅ Paginação ativa apenas quando params são fornecidos explicitamente
    const paginate = req.query.page !== undefined || req.query.limit !== undefined;
    const page     = paginate ? Math.max(1, parseInt(req.query.page  as string) || 1)   : 1;
    const limit    = paginate ? Math.min(parseInt(req.query.limit as string) || 50, 500) : undefined;
    const skip     = paginate && limit ? (page - 1) * limit : undefined;

    const [services, total] = await Promise.all([
      prisma.service.findMany({
        where,
        include: { barber: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        ...(paginate && limit !== undefined ? { take: limit, skip } : {})
      }),
      prisma.service.count({ where })
    ]);

    res.setHeader('X-Total-Count',  total);
    res.setHeader('X-Total-Pages',  paginate && limit ? Math.ceil(total / limit) : 1);
    res.setHeader('X-Current-Page', page);

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

// ✅ SEGURANÇA: IDOR corrigido — verifica se o serviço pertence à barbearia do usuário
// Atualizar serviço
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const barbershopId = req.user!.barbershopId!;
    const { name, description, price, duration, barberId, active } = req.body;

    // Garante que o serviço pertence à barbearia do usuário autenticado
    const existing = await prisma.service.findFirst({
      where: { id, barbershopId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Serviço não encontrado' });
    }

    const service = await prisma.service.update({
      where: { id },
      data: {
        name,
        description,
        price:    price    ? parseFloat(price)    : undefined,
        duration: duration ? parseInt(duration)   : undefined,
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

// ✅ SEGURANÇA: IDOR corrigido — verifica se o serviço pertence à barbearia do usuário
// Deletar serviço
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const barbershopId = req.user!.barbershopId!;

    // Garante que o serviço pertence à barbearia do usuário autenticado
    const existing = await prisma.service.findFirst({
      where: { id, barbershopId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Serviço não encontrado' });
    }

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