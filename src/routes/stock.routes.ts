import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// 📦 GET /api/stock
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

// 📊 GET /api/stock/summary
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

// ➕ POST /api/stock
router.post('/', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { name, category, quantity, minQuantity, unit, costPrice, salePrice, supplier, notes } = req.body;

    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });

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

    if (quantity > 0) {
      await prisma.stockMovement.create({
        data: { stockItemId: item.id, type: 'in', quantity, reason: 'Estoque inicial' }
      });
    }

    return res.status(201).json(item);
  } catch (error) {
    console.error('Erro ao criar item:', error);
    return res.status(500).json({ error: 'Erro ao criar item no estoque' });
  }
});

// ✏️ PUT /api/stock/:id
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id }       = req.params;
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

// 📥 POST /api/stock/:id/movement — Entrada / Saída (venda) / Ajuste
router.post('/:id/movement', authMiddleware, async (req, res) => {
  try {
    const { id }       = req.params;
    const barbershopId = req.user!.barbershopId!;
    const { type, quantity, reason, barberId, customerId, unitPrice } = req.body;

    if (!type || !quantity) return res.status(400).json({ error: 'Tipo e quantidade são obrigatórios' });
    if (!['in', 'out', 'adjustment'].includes(type)) {
      return res.status(400).json({ error: 'Tipo deve ser: in, out ou adjustment' });
    }

    // ✅ Venda (saída) exige barbeiro
    if (type === 'out' && !barberId) {
      return res.status(400).json({ error: 'Informe o barbeiro responsável pela venda' });
    }

    const existing = await prisma.stockItem.findFirst({ where: { id, barbershopId } });
    if (!existing) return res.status(404).json({ error: 'Item não encontrado' });

    // Calcular nova quantidade
    let newQty = existing.quantity;
    if (type === 'in')       newQty += Number(quantity);
    else if (type === 'out') newQty -= Number(quantity);
    else                     newQty  = Number(quantity); // adjustment

    if (newQty < 0) return res.status(400).json({ error: 'Estoque insuficiente para esta saída' });

    // ✅ Preço unitário: usa o informado ou fallback para salePrice do item
    const effectiveUnitPrice = unitPrice
      ? Number(unitPrice)
      : (type === 'out' ? Number(existing.salePrice || 0) : 0);

    const totalSaleValue = type === 'out' ? effectiveUnitPrice * Number(quantity) : 0;

    // Atualizar estoque + criar movimento em transaction
    const [updatedItem, movement] = await prisma.$transaction([
      prisma.stockItem.update({
        where: { id },
        data:  { quantity: newQty }
      }),
      prisma.stockMovement.create({
        data: {
          stockItemId: id,
          type,
          quantity:   Number(quantity),
          reason:     reason || null,
          unitPrice:  effectiveUnitPrice > 0 ? effectiveUnitPrice : null,
          barberId:   barberId   || null,
          customerId: customerId || null
        }
      })
    ]);

    // ✅ Se for VENDA (out) com valor > 0: gera receita + comissão
    if (type === 'out' && totalSaleValue > 0 && barberId) {
      const barber = await prisma.user.findUnique({
        where:  { id: barberId },
        select: { id: true, name: true, commissionPercentage: true }
      });

      if (barber) {
        const commissionPct = barber.commissionPercentage || 40;
        const commissionAmt = totalSaleValue * (commissionPct / 100);

        // 1. Criar transação de receita no financeiro
        await prisma.transaction.create({
          data: {
            barbershopId,
            type:          'income',
            category:      'product',
            description:   `Venda de produto — ${existing.name} (${quantity}x ${existing.unit}) — ${barber.name}`,
            amount:        totalSaleValue,
            date:          new Date(),
            paymentMethod: 'cash',
            status:        'completed',
            barberId:      barberId,
            customerId:    customerId || null,
            serviceName:   existing.name
          }
        });

        // 2. Criar/atualizar comissão do barbeiro no mês atual
        const now            = new Date();
        const referenceMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const existingComm = await prisma.commission.findFirst({
          where: { barberId, barbershopId, referenceMonth }
        });

        if (existingComm) {
          await prisma.commission.update({
            where: { id: existingComm.id },
            data:  { amount: Number(existingComm.amount) + commissionAmt }
          });
        } else {
          await prisma.commission.create({
            data: {
              barberId,
              barbershopId,
              percentage:     commissionPct,
              amount:         commissionAmt,
              referenceMonth,
              status:         'pending'
            }
          });
        }

        return res.json({
          item:         updatedItem,
          movement,
          sale: {
            totalValue:  totalSaleValue,
            commission:  commissionAmt,
            barberName:  barber.name,
            message:     `✅ Venda registrada! R$ ${totalSaleValue.toFixed(2)} no financeiro. Comissão de R$ ${commissionAmt.toFixed(2)} para ${barber.name}.`
          }
        });
      }
    }

    return res.json({ item: updatedItem, movement });
  } catch (error) {
    console.error('Erro ao registrar movimento:', error);
    return res.status(500).json({ error: 'Erro ao registrar movimento de estoque' });
  }
});

// 📋 GET /api/stock/:id/movements — Histórico com barbeiro
router.get('/:id/movements', authMiddleware, async (req, res) => {
  try {
    const { id }       = req.params;
    const barbershopId = req.user!.barbershopId!;

    const item = await prisma.stockItem.findFirst({ where: { id, barbershopId } });
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });

    const movements = await prisma.stockMovement.findMany({
      where:   { stockItemId: id },
      include: { barber: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }
    });

    return res.json(movements);
  } catch (error) {
    console.error('Erro ao listar movimentos:', error);
    return res.status(500).json({ error: 'Erro ao listar movimentos' });
  }
});

// 🗑️ DELETE /api/stock/:id — Soft delete
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id }       = req.params;
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