import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Listar itens do estoque
// ✅ B5: Paginação opcional via ?page= e ?limit=
// Sem params → retorna todos os registros (comportamento idêntico ao anterior)
// Com params → retorna a fatia solicitada
// Filtro lowStock mantido em JavaScript conforme comportamento atual (não alterado)
// Headers adicionados em ambos os casos (não breaking):
//   X-Total-Count, X-Total-Pages, X-Current-Page
router.get('/', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { search, category, lowStock } = req.query;

    const where: any = { barbershopId, active: true };

    if (search) {
      where.name = { contains: search as string, mode: 'insensitive' };
    }
    if (category) {
      where.category = category as string;
    }

    // ✅ Paginação ativa apenas quando params são fornecidos explicitamente
    const paginate = req.query.page !== undefined || req.query.limit !== undefined;
    const page     = paginate ? Math.max(1, parseInt(req.query.page  as string) || 1)   : 1;
    const limit    = paginate ? Math.min(parseInt(req.query.limit as string) || 50, 500) : undefined;
    const skip     = paginate && limit ? (page - 1) * limit : undefined;

    // Buscar itens — include de movements mantido idêntico ao original
    const items = await prisma.stockItem.findMany({
      where,
      include: {
        movements: {
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      },
      orderBy: { name: 'asc' },
      ...(paginate && limit !== undefined ? { take: limit, skip } : {})
    });

    // ✅ Filtro lowStock mantido em JavaScript (sem alteração da lógica original)
    const result = lowStock === 'true'
      ? items.filter(item => item.quantity <= item.minQuantity)
      : items;

    // Total para headers: conta antes do filtro lowStock (total real de itens no where)
    // Se lowStock ativo, o total reflete o subconjunto filtrado em memória
    const total = lowStock === 'true'
      ? result.length
      : await prisma.stockItem.count({ where });

    res.setHeader('X-Total-Count',  total);
    res.setHeader('X-Total-Pages',  paginate && limit ? Math.ceil(total / limit) : 1);
    res.setHeader('X-Current-Page', page);

    return res.json(result);
  } catch (error) {
    console.error('Erro ao buscar estoque:', error);
    return res.status(500).json({ error: 'Erro ao buscar estoque' });
  }
});

// Buscar item por ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const barbershopId = req.user!.barbershopId!;

    const item = await prisma.stockItem.findFirst({
      where: { id, barbershopId },
      include: {
        movements: {
          orderBy: { createdAt: 'desc' },
          take: 20
        }
      }
    });

    if (!item) {
      return res.status(404).json({ error: 'Item não encontrado' });
    }

    return res.json(item);
  } catch (error) {
    console.error('Erro ao buscar item:', error);
    return res.status(500).json({ error: 'Erro ao buscar item do estoque' });
  }
});

// Criar item
router.post('/', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const {
      name, category, quantity, minQuantity,
      unit, costPrice, salePrice, supplier, notes
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    const item = await prisma.stockItem.create({
      data: {
        barbershopId,
        name,
        category:    category    || 'product',
        quantity:    quantity    || 0,
        minQuantity: minQuantity || 5,
        unit:        unit        || 'un',
        costPrice:   costPrice   || null,
        salePrice:   salePrice   || null,
        supplier:    supplier    || null,
        notes:       notes       || null
      }
    });

    // Criar movimento inicial se quantidade > 0
    if (quantity > 0) {
      await prisma.stockMovement.create({
        data: {
          stockItemId: item.id,
          type:        'in',
          quantity:    quantity,
          reason:      'Estoque inicial'
        }
      });
    }

    return res.status(201).json(item);
  } catch (error) {
    console.error('Erro ao criar item:', error);
    return res.status(500).json({ error: 'Erro ao criar item do estoque' });
  }
});

// Atualizar item
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const barbershopId = req.user!.barbershopId!;

    const existing = await prisma.stockItem.findFirst({
      where: { id, barbershopId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Item não encontrado' });
    }

    const {
      name, category, minQuantity,
      unit, costPrice, salePrice, supplier, notes, active
    } = req.body;

    const item = await prisma.stockItem.update({
      where: { id },
      data: {
        name,
        category,
        minQuantity,
        unit,
        costPrice,
        salePrice,
        supplier,
        notes,
        active
      }
    });

    return res.json(item);
  } catch (error) {
    console.error('Erro ao atualizar item:', error);
    return res.status(500).json({ error: 'Erro ao atualizar item do estoque' });
  }
});

// Deletar item (soft delete via active = false)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const barbershopId = req.user!.barbershopId!;

    const existing = await prisma.stockItem.findFirst({
      where: { id, barbershopId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Item não encontrado' });
    }

    await prisma.stockItem.update({
      where: { id },
      data:  { active: false }
    });

    return res.json({ message: 'Item removido do estoque com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar item:', error);
    return res.status(500).json({ error: 'Erro ao deletar item do estoque' });
  }
});

// Registrar movimentação de estoque
router.post('/:id/movements', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const barbershopId = req.user!.barbershopId!;

    const item = await prisma.stockItem.findFirst({
      where: { id, barbershopId }
    });

    if (!item) {
      return res.status(404).json({ error: 'Item não encontrado' });
    }

    const { type, quantity, reason, unitPrice, barberId, customerId } = req.body;

    if (!type || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Tipo e quantidade são obrigatórios' });
    }

    if (!['in', 'out', 'adjustment'].includes(type)) {
      return res.status(400).json({ error: 'Tipo inválido. Use: in, out, adjustment' });
    }

    // Calcular nova quantidade
    let newQuantity: number;
    if (type === 'in') {
      newQuantity = item.quantity + quantity;
    } else if (type === 'out') {
      newQuantity = item.quantity - quantity;
      if (newQuantity < 0) {
        return res.status(400).json({ error: 'Quantidade insuficiente em estoque' });
      }
    } else {
      // adjustment: define a quantidade absoluta
      newQuantity = quantity;
    }

    // Criar movimentação e atualizar quantidade em paralelo
    const [movement] = await Promise.all([
      prisma.stockMovement.create({
        data: {
          stockItemId: id,
          type,
          quantity,
          reason:    reason    || null,
          unitPrice: unitPrice || null,
          barberId:  barberId  || null
        }
      }),
      prisma.stockItem.update({
        where: { id },
        data:  { quantity: newQuantity }
      })
    ]);

    return res.status(201).json({
      movement,
      newQuantity
    });
  } catch (error) {
    console.error('Erro ao registrar movimentação:', error);
    return res.status(500).json({ error: 'Erro ao registrar movimentação' });
  }
});

// Buscar movimentações de um item
router.get('/:id/movements', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const barbershopId = req.user!.barbershopId!;

    const item = await prisma.stockItem.findFirst({
      where: { id, barbershopId }
    });

    if (!item) {
      return res.status(404).json({ error: 'Item não encontrado' });
    }

    const movements = await prisma.stockMovement.findMany({
      where:   { stockItemId: id },
      orderBy: { createdAt: 'desc' }
    });

    return res.json(movements);
  } catch (error) {
    console.error('Erro ao buscar movimentações:', error);
    return res.status(500).json({ error: 'Erro ao buscar movimentações' });
  }
});

export default router;