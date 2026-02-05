import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// 🎯 GET /api/goals - Listar metas
router.get('/', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { status } = req.query;

    const where: any = { barbershopId };
    if (status) where.status = status as string;

    const goals = await prisma.goal.findMany({
      where,
      orderBy: { endDate: 'asc' }
    });

    return res.json(goals);
  } catch (error) {
    console.error('Erro ao listar metas:', error);
    return res.status(500).json({ error: 'Erro ao listar metas' });
  }
});

// 📊 GET /api/goals/progress - Progresso geral das metas
router.get('/progress', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;

    const goals = await prisma.goal.findMany({
      where: {
        barbershopId,
        status: 'active'
      }
    });

    const progress = goals.map(goal => {
      const percentage = (Number(goal.currentAmount) / Number(goal.targetAmount)) * 100;
      const remaining = Number(goal.targetAmount) - Number(goal.currentAmount);
      const daysRemaining = Math.ceil(
        (new Date(goal.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        id: goal.id,
        name: goal.name,
        targetAmount: goal.targetAmount,
        currentAmount: goal.currentAmount,
        percentage: Math.min(percentage, 100).toFixed(2),
        remaining,
        daysRemaining,
        status: percentage >= 100 ? 'completed' : daysRemaining < 0 ? 'expired' : 'active',
        startDate: goal.startDate,
        endDate: goal.endDate
      };
    });

    return res.json({
      goals: progress,
      summary: {
        total: goals.length,
        completed: progress.filter(g => g.status === 'completed').length,
        active: progress.filter(g => g.status === 'active').length,
        expired: progress.filter(g => g.status === 'expired').length
      }
    });
  } catch (error) {
    console.error('Erro ao buscar progresso das metas:', error);
    return res.status(500).json({ error: 'Erro ao buscar progresso das metas' });
  }
});

// ➕ POST /api/goals - Criar meta
router.post('/', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { name, targetAmount, startDate, endDate } = req.body;

    if (!name || !targetAmount || !startDate || !endDate) {
      return res.status(400).json({ 
        error: 'Nome, valor alvo, data inicial e final são obrigatórios' 
      });
    }

    const goal = await prisma.goal.create({
      data: {
        barbershopId,
        name,
        targetAmount,
        currentAmount: 0,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        status: 'active'
      }
    });

    return res.status(201).json(goal);
  } catch (error) {
    console.error('Erro ao criar meta:', error);
    return res.status(500).json({ error: 'Erro ao criar meta' });
  }
});

// ✏️ PUT /api/goals/:id - Atualizar meta
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const barbershopId = req.user!.barbershopId!;
    const { name, targetAmount, startDate, endDate, status } = req.body;

    const existing = await prisma.goal.findFirst({
      where: { id, barbershopId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Meta não encontrada' });
    }

    const goal = await prisma.goal.update({
      where: { id },
      data: {
        name,
        targetAmount,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        status
      }
    });

    return res.json(goal);
  } catch (error) {
    console.error('Erro ao atualizar meta:', error);
    return res.status(500).json({ error: 'Erro ao atualizar meta' });
  }
});

// 🔄 PUT /api/goals/:id/update-progress - Atualizar progresso da meta
router.put('/:id/update-progress', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const barbershopId = req.user!.barbershopId!;
    const { amount } = req.body;

    if (amount === undefined) {
      return res.status(400).json({ error: 'Valor é obrigatório' });
    }

    const existing = await prisma.goal.findFirst({
      where: { id, barbershopId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Meta não encontrada' });
    }

    // Atualizar progresso
    const newAmount = Number(existing.currentAmount) + Number(amount);
    const percentage = (newAmount / Number(existing.targetAmount)) * 100;

    // Se atingiu 100%, marcar como completa
    const newStatus = percentage >= 100 ? 'completed' : existing.status;

    const goal = await prisma.goal.update({
      where: { id },
      data: {
        currentAmount: newAmount,
        status: newStatus
      }
    });

    return res.json(goal);
  } catch (error) {
    console.error('Erro ao atualizar progresso:', error);
    return res.status(500).json({ error: 'Erro ao atualizar progresso' });
  }
});

// 🔄 PUT /api/goals/:id/sync - Sincronizar progresso com receitas reais
router.put('/:id/sync', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const barbershopId = req.user!.barbershopId!;

    const goal = await prisma.goal.findFirst({
      where: { id, barbershopId }
    });

    if (!goal) {
      return res.status(404).json({ error: 'Meta não encontrada' });
    }

    // Calcular receita real entre startDate e endDate
    const transactions = await prisma.transaction.findMany({
      where: {
        barbershopId,
        type: 'income',
        date: {
          gte: goal.startDate,
          lte: goal.endDate
        },
        status: 'completed'
      }
    });

    const totalRevenue = transactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const percentage = (totalRevenue / Number(goal.targetAmount)) * 100;
    const newStatus = percentage >= 100 ? 'completed' : 'active';

    const updatedGoal = await prisma.goal.update({
      where: { id },
      data: {
        currentAmount: totalRevenue,
        status: newStatus
      }
    });

    return res.json({
      goal: updatedGoal,
      synced: true,
      totalRevenue,
      percentage: percentage.toFixed(2)
    });
  } catch (error) {
    console.error('Erro ao sincronizar meta:', error);
    return res.status(500).json({ error: 'Erro ao sincronizar meta' });
  }
});

// 🗑️ DELETE /api/goals/:id - Excluir meta
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const barbershopId = req.user!.barbershopId!;

    const existing = await prisma.goal.findFirst({
      where: { id, barbershopId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Meta não encontrada' });
    }

    await prisma.goal.delete({
      where: { id }
    });

    return res.json({ message: 'Meta excluída com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir meta:', error);
    return res.status(500).json({ error: 'Erro ao excluir meta' });
  }
});

export default router;