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
    if (status)   where.status   = status   as string;

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
// ✅ B2: N+1 corrigido — de 3N queries seriais para 4 queries fixas
// ANTES: for (barber of barbers) { findFirst + findMany + create } = 3 queries por barbeiro
// DEPOIS: 2 queries em paralelo (existentes + agendamentos) → agrupamento em memória → createMany
// Contrato de resposta preservado: { message, commissions: [...] } com alreadyExists: true nos já calculados
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

    // QUERY 1: Buscar todos os barbeiros ativos da barbearia (igual ao antes)
    const barbers = await prisma.user.findMany({
      where: { barbershopId, role: 'barber', active: true }
    });

    if (barbers.length === 0) {
      return res.json({
        message: `Nenhum barbeiro ativo encontrado para ${month}/${year}`,
        commissions: []
      });
    }

    const barberIds = barbers.map(b => b.id);

    // ✅ QUERIES 2 e 3 em paralelo — 1 busca para TODOS os barbeiros simultaneamente
    // ANTES: 1 findFirst por barbeiro + 1 findMany por barbeiro = 2N queries seriais
    // DEPOIS: 2 queries fixas independente do número de barbeiros
    const [existingCommissions, allAppointments] = await Promise.all([
      // Comissões já calculadas neste mês para qualquer barbeiro desta barbearia
      prisma.commission.findMany({
        where: { barbershopId, referenceMonth, barberId: { in: barberIds } }
      }),
      // Agendamentos concluídos no mês para todos os barbeiros de uma vez
      prisma.appointment.findMany({
        where: {
          barbershopId,
          barberId: { in: barberIds },
          status:   'completed',
          date:     { gte: firstDay, lte: lastDay }
        },
        select: { barberId: true, price: true }
      })
    ]);

    // Montar set de barbeiros que já têm comissão calculada
    const alreadyCalculatedIds = new Set(existingCommissions.map(c => c.barberId));

    // Agrupar agendamentos por barbeiro em memória (zero queries adicionais)
    const revenueByBarber: Record<string, number> = {};
    for (const apt of allAppointments) {
      revenueByBarber[apt.barberId] = (revenueByBarber[apt.barberId] || 0) + Number(apt.price);
    }

    // Calcular quais comissões precisam ser criadas
    const toCreate: {
      barberId:       string;
      barbershopId:   string;
      percentage:     number;
      amount:         number;
      referenceMonth: Date;
      status:         string;
    }[] = [];

    const results: any[] = [];

    for (const barber of barbers) {
      // Já existe: adiciona ao resultado com flag alreadyExists
      if (alreadyCalculatedIds.has(barber.id)) {
        const existing = existingCommissions.find(c => c.barberId === barber.id)!;
        results.push({ ...existing, alreadyExists: true });
        continue;
      }

      const totalRevenue     = revenueByBarber[barber.id] || 0;
      const percentage       = barber.commissionPercentage || 40;
      const commissionAmount = totalRevenue * (percentage / 100);

      // Só cria comissão se houver valor (igual ao comportamento anterior)
      if (commissionAmount > 0) {
        toCreate.push({
          barberId:       barber.id,
          barbershopId,
          percentage,
          amount:         commissionAmount,
          referenceMonth,
          status:         'pending'
        });
      }
    }

    // QUERY 4: createMany para todos de uma vez + findMany para retornar com IDs
    // ANTES: 1 commission.create por barbeiro = N queries seriais
    // DEPOIS: 1 createMany (N inserts em 1 roundtrip) + 1 findMany para retornar dados completos
    if (toCreate.length > 0) {
      await prisma.commission.createMany({ data: toCreate });

      // Buscar as recém-criadas para retornar com ID e todos os campos
      const created = await prisma.commission.findMany({
        where: {
          barbershopId,
          referenceMonth,
          barberId:   { in: toCreate.map(c => c.barberId) },
          status:     'pending'
        }
      });

      results.push(...created);
    }

    return res.json({
      message:     `Comissões calculadas para ${month}/${year}`,
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
    const { id }       = req.params;
    const barbershopId = req.user!.barbershopId!;

    const existing = await prisma.commission.findFirst({
      where:   { id, barbershopId },
      include: { barber: { select: { name: true } } }
    });

    if (!existing)                    return res.status(404).json({ error: 'Comissão não encontrada' });
    if (existing.status === 'paid')   return res.status(400).json({ error: 'Comissão já foi paga' });

    const commission = await prisma.commission.update({
      where: { id },
      data:  { status: 'paid', paidAt: new Date() }
    });

    await prisma.transaction.create({
      data: {
        barbershopId,
        type:          'expense',
        category:      'commission',
        description:   `Comissão - ${existing.barber?.name || 'Barbeiro'}`,
        amount:        existing.amount,
        date:          new Date(),
        paymentMethod: 'cash',
        status:        'completed'
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
      where:   { barbershopId, referenceMonth },
      include: { barber: { select: { name: true, email: true, commissionPercentage: true } } }
    });

    const totalPending = commissions.filter(c => c.status === 'pending').reduce((s, c) => s + Number(c.amount), 0);
    const totalPaid    = commissions.filter(c => c.status === 'paid').reduce((s, c) => s + Number(c.amount), 0);

    return res.json({
      commissions,
      summary: {
        total:       commissions.length,
        pending:     commissions.filter(c => c.status === 'pending').length,
        paid:        commissions.filter(c => c.status === 'paid').length,
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
    const { id }       = req.params;
    const barbershopId = req.user!.barbershopId!;
    const { percentage, amount } = req.body;

    const existing = await prisma.commission.findFirst({ where: { id, barbershopId } });
    if (!existing)                    return res.status(404).json({ error: 'Comissão não encontrada' });
    if (existing.status === 'paid')   return res.status(400).json({ error: 'Não é possível editar comissão paga' });

    const commission = await prisma.commission.update({
      where: { id },
      data:  { percentage, amount }
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
    const { id }       = req.params;
    const barbershopId = req.user!.barbershopId!;

    const existing = await prisma.commission.findFirst({ where: { id, barbershopId } });
    if (!existing)                    return res.status(404).json({ error: 'Comissão não encontrada' });
    if (existing.status === 'paid')   return res.status(400).json({ error: 'Não é possível excluir comissão paga' });

    await prisma.commission.delete({ where: { id } });
    return res.json({ message: 'Comissão excluída com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir comissão:', error);
    return res.status(500).json({ error: 'Erro ao excluir comissão' });
  }
});

export default router;