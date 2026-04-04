import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// 📦 GET /api/stock — Listar itens
router.get('/', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { category, search, lowStock } = req.query;

    const where: any = { barbershopId, active: true };
    if (category) where.category = category as string;
    if (search)   where.name = { contains: search as string, mode: 'insensitive' };

    const items = await prisma.stockItem.findMany({
      where,
      include: {
        movements: { orderBy: { createdAt: 'desc' }, take: 5 }
      },
      orderBy: { name: 'asc' }
    });

    const result = lowStock === 'true'
      ? items.filter(i => i.quantity <= i.minQuantity)
      : items;

    return res.json(result);
  } catch (error) {
    console.error('Erro ao listar estoque:', error);
    return res.status(500).json({ error: 'Erro ao listar estoque' });
  }
});

// 📊 GET /api/stock/summary — Resumo do estoque
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;

    const items = await prisma.stockItem.findMany({
      where: { barbershopId, active: true }
    });

    const totalItems    = items.length;
    const totalValue    = items.reduce((s, i) => s + Number(i.costPrice || 0) * i.quantity, 0);
    const lowStockItems = items.filter(i => i.quantity <= i.minQuantity).length;
    const outOfStock    = items.filter(i => i.quantity === 0).length;

    const byCategory = items.reduce((acc: any, item) => {
      if (!acc[item.category]) acc[item.category] = { count: 0, totalQty: 0 };
      acc[item.category].count++;
      acc[item.category].totalQty += item.quantity;
      return acc;
    }, {});

    return res.json({ totalItems, totalValue, lowStockItems, outOfStock, byCategory });
  } catch (error) {
    console.error('Erro ao buscar resumo:', error);
    return res.status(500).json({ error: 'Erro ao buscar resumo do estoque' });
  }
});

// ➕ POST /api/stock — Criar item
router.post('/', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { name, category, quantity, minQuantity, unit, costPrice, salePrice, supplier, notes } = req.body;

    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });

    const item = await prisma.stockItem.create({
      data: {
        barbershopId,
        name,
        category: category || 'product',
        quantity: quantity || 0,
        minQuantity: minQuantity || 5,
        unit: unit || 'un',
        costPrice: costPrice || null,
        salePrice: salePrice || null,
        supplier: supplier || null,
        notes: notes || null
      }
    });

    // Criar movimento inicial se tiver quantidade
    if (quantity > 0) {
      await prisma.stockMovement.create({
        data: {
          stockItemId: item.id,
          type: 'in',
          quantity,
          reason: 'Estoque inicial'
        }
      });
    }

    return res.status(201).json(item);
  } catch (error) {
    console.error('Erro ao criar item:', error);
    return res.status(500).json({ error: 'Erro ao criar item no estoque' });
  }
});

// ✏️ PUT /api/stock/:id — Atualizar item
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const barbershopId = req.user!.barbershopId!;
    const { name, category, minQuantity, unit, costPrice, salePrice, supplier, notes } = req.body;

    const existing = await prisma.stockItem.findFirst({ where: { id, barbershopId } });
    if (!existing) return res.status(404).json({ error: 'Item não encontrado' });

    const item = await prisma.stockItem.update({
      where: { id },
      data: { name, category, minQuantity, unit, costPrice, salePrice, supplier, notes }
    });

    return res.json(item);
  } catch (error) {
    console.error('Erro ao atualizar item:', error);
    return res.status(500).json({ error: 'Erro ao atualizar item' });
  }
});

// 📥 POST /api/stock/:id/movement — Registrar movimento (entrada/saída/ajuste)
router.post('/:id/movement', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const barbershopId = req.user!.barbershopId!;
    const { type, quantity, reason } = req.body;

    if (!type || !quantity) return res.status(400).json({ error: 'Tipo e quantidade são obrigatórios' });
    if (!['in', 'out', 'adjustment'].includes(type)) {
      return res.status(400).json({ error: 'Tipo deve ser: in, out ou adjustment' });
    }

    const existing = await prisma.stockItem.findFirst({ where: { id, barbershopId } });
    if (!existing) return res.status(404).json({ error: 'Item não encontrado' });

    // Calcular nova quantidade
    let newQty = existing.quantity;
    if (type === 'in')         newQty += Number(quantity);
    else if (type === 'out')   newQty -= Number(quantity);
    else                        newQty = Number(quantity); // adjustment = sobrescreve

    if (newQty < 0) return res.status(400).json({ error: 'Quantidade não pode ser negativa' });

    // Atualizar estoque e criar movimento
    const [updatedItem, movement] = await prisma.$transaction([
      prisma.stockItem.update({
        where: { id },
        data: { quantity: newQty }
      }),
      prisma.stockMovement.create({
        data: { stockItemId: id, type, quantity: Number(quantity), reason }
      })
    ]);

    return res.json({ item: updatedItem, movement });
  } catch (error) {
    console.error('Erro ao registrar movimento:', error);
    return res.status(500).json({ error: 'Erro ao registrar movimento de estoque' });
  }
});

// 📋 GET /api/stock/:id/movements — Histórico de movimentos
router.get('/:id/movements', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const barbershopId = req.user!.barbershopId!;

    const item = await prisma.stockItem.findFirst({ where: { id, barbershopId } });
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });

    const movements = await prisma.stockMovement.findMany({
      where: { stockItemId: id },
      orderBy: { createdAt: 'desc' }
    });

    return res.json(movements);
  } catch (error) {
    console.error('Erro ao listar movimentos:', error);
    return res.status(500).json({ error: 'Erro ao listar movimentos' });
  }
});

// 🗑️ DELETE /api/stock/:id — Desativar item (soft delete)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const barbershopId = req.user!.barbershopId!;

    const existing = await prisma.stockItem.findFirst({ where: { id, barbershopId } });
    if (!existing) return res.status(404).json({ error: 'Item não encontrado' });

    await prisma.stockItem.update({ where: { id }, data: { active: false } });
    return res.json({ message: 'Item removido do estoque' });
  } catch (error) {
    console.error('Erro ao remover item:', error);
    return res.status(500).json({ error: 'Erro ao remover item' });
  }
});

export default router;