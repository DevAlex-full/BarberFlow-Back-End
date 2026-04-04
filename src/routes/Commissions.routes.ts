import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// 💵 GET /api/commissions
router.get('/', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { barberId, month, year, status } = req.query;

    const where: any = { barbershopId };

    if (barberId) where.barberId = barberId as string;
    if (status)   where.status   = status as string;

    if (month && year) {
      const refMonth = new Date(Number(year), Number(month) - 1, 1);
      where.referenceMonth = refMonth;
    }

    const commissions = await prisma.commission.findMany({
      where,
      include: { barber: { select: { name: true, email: true, commissionPercentage: true } } },
      orderBy: { referenceMonth: 'desc' }
    });

    return res.json(commissions);
  } catch (error) {
    console.error('Erro ao listar comissões:', error);
    return res.status(500).json({ error: 'Erro ao listar comissões' });
  }
});

// 🧮 POST /api/commissions/calculate
// ✅ FIX: usa barber.commissionPercentage em vez de hardcoded 40
router.post('/calculate', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({ error: 'Mês e ano são obrigatórios' });
    }

    const referenceMonth = new Date(Number(year), Number(month) - 1, 1);
    const firstDay       = new Date(Number(year), Number(month) - 1, 1);
    const lastDay        = new Date(Number(year), Number(month), 0, 23, 59, 59);

    const barbers = await prisma.user.findMany({
      where: { barbershopId, role: 'barber', active: true }
    });

    const results = [];

    for (const barber of barbers) {
      const existing = await prisma.commission.findFirst({
        where: { barberId: barber.id, barbershopId, referenceMonth }
      });

      if (existing) {
        results.push({ ...existing, alreadyExists: true });
        continue;
      }

      const appointments = await prisma.appointment.findMany({
        where: {
          barbershopId,
          barberId: barber.id,
          status: 'completed',
          date: { gte: firstDay, lte: lastDay }
        }
      });

      const totalRevenue = appointments.reduce((sum, apt) => sum + Number(apt.price), 0);

      // ✅ CORRIGIDO: usa o percentual cadastrado para cada barbeiro
      const percentage       = barber.commissionPercentage || 40;
      const commissionAmount = totalRevenue * (percentage / 100);

      if (commissionAmount > 0) {
        const commission = await prisma.commission.create({
          data: {
            barberId: barber.id,
            barbershopId,
            percentage,
            amount: commissionAmount,
            referenceMonth,
            status: 'pending'
          }
        });
        results.push(commission);
      }
    }

    return res.json({
      message: `Comissões calculadas para ${month}/${year}`,
      commissions: results
    });
  } catch (error) {
    console.error('Erro ao calcular comissões:', error);
    return res.status(500).json({ error: 'Erro ao calcular comissões' });
  }
});

// 💰 PUT /api/commissions/:id/pay
router.put('/:id/pay', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const barbershopId = req.user!.barbershopId!;

    const existing = await prisma.commission.findFirst({
      where: { id, barbershopId },
      include: { barber: { select: { name: true } } }
    });

    if (!existing) return res.status(404).json({ error: 'Comissão não encontrada' });
    if (existing.status === 'paid') return res.status(400).json({ error: 'Comissão já foi paga' });

    const commission = await prisma.commission.update({
      where: { id },
      data: { status: 'paid', paidAt: new Date() }
    });

    await prisma.transaction.create({
      data: {
        barbershopId,
        type: 'expense',
        category: 'commission',
        description: `Comissão - ${existing.barber?.name || 'Barbeiro'}`,
        amount: existing.amount,
        date: new Date(),
        paymentMethod: 'cash',
        status: 'completed'
      }
    });

    return res.json(commission);
  } catch (error) {
    console.error('Erro ao pagar comissão:', error);
    return res.status(500).json({ error: 'Erro ao pagar comissão' });
  }
});

// 📊 GET /api/commissions/report
router.get('/report', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({ error: 'Mês e ano são obrigatórios' });
    }

    const referenceMonth = new Date(Number(year), Number(month) - 1, 1);

    const commissions = await prisma.commission.findMany({
      where: { barbershopId, referenceMonth },
      include: { barber: { select: { name: true, email: true, commissionPercentage: true } } }
    });

    const totalPending = commissions.filter(c => c.status === 'pending').reduce((s, c) => s + Number(c.amount), 0);
    const totalPaid    = commissions.filter(c => c.status === 'paid').reduce((s, c) => s + Number(c.amount), 0);

    return res.json({
      commissions,
      summary: {
        total: commissions.length,
        pending: commissions.filter(c => c.status === 'pending').length,
        paid: commissions.filter(c => c.status === 'paid').length,
        totalPending,
        totalPaid,
        totalAmount: totalPending + totalPaid
      }
    });
  } catch (error) {
    console.error('Erro ao gerar relatório:', error);
    return res.status(500).json({ error: 'Erro ao gerar relatório de comissões' });
  }
});

// ✏️ PUT /api/commissions/:id
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const barbershopId = req.user!.barbershopId!;
    const { percentage, amount } = req.body;

    const existing = await prisma.commission.findFirst({ where: { id, barbershopId } });
    if (!existing)               return res.status(404).json({ error: 'Comissão não encontrada' });
    if (existing.status === 'paid') return res.status(400).json({ error: 'Não é possível editar comissão paga' });

    const commission = await prisma.commission.update({
      where: { id },
      data: { percentage, amount }
    });

    return res.json(commission);
  } catch (error) {
    console.error('Erro ao atualizar comissão:', error);
    return res.status(500).json({ error: 'Erro ao atualizar comissão' });
  }
});

// 🗑️ DELETE /api/commissions/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const barbershopId = req.user!.barbershopId!;

    const existing = await prisma.commission.findFirst({ where: { id, barbershopId } });
    if (!existing)               return res.status(404).json({ error: 'Comissão não encontrada' });
    if (existing.status === 'paid') return res.status(400).json({ error: 'Não é possível excluir comissão paga' });

    await prisma.commission.delete({ where: { id } });
    return res.json({ message: 'Comissão excluída com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir comissão:', error);
    return res.status(500).json({ error: 'Erro ao excluir comissão' });
  }
});

export default router;