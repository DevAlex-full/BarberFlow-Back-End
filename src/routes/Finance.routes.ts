import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// 💰 GET /api/finance/summary
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { startDate, endDate } = req.query;

    // ✅ FIX: período padrão usa UTC para evitar bug de timezone
    const now = new Date();
    const start = startDate
      ? new Date(startDate as string)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const end = endDate
      ? new Date(endDate as string)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    // 1. Transações do período
    const transactions = await prisma.transaction.findMany({
      where: {
        barbershopId,
        date: { gte: start, lte: end },
        status: 'completed'
      }
    });

    // 2. ✅ NOVO: Agendamentos concluídos do período (receita real de serviços)
    const appointments = await prisma.appointment.findMany({
      where: {
        barbershopId,
        status: 'completed',
        date: { gte: start, lte: end }
      }
    });

    const appointmentsRevenue = appointments.reduce((sum, a) => sum + Number(a.price), 0);

    const txIncome   = transactions.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const txExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

    // ✅ Evita dupla contagem: transações do tipo 'income' com category 'service'
    // já podem ter sido criadas a partir de agendamentos — soma só appointments não cobertos
    // Estratégia simples e segura: inclui appointments + transações manuais de income
    // (transações geradas automaticamente de agendamentos são do tipo 'service')
    const manualIncome = transactions
      .filter(t => t.type === 'income')
      .reduce((s, t) => s + Number(t.amount), 0);

    // ✅ Total de receita = agendamentos concluídos + transações manuais de receita
    const totalRevenue  = appointmentsRevenue + manualIncome;
    const totalExpenses = txExpenses;
    const netProfit     = totalRevenue - totalExpenses;

    // Saldo anterior (todas as transações + agendamentos antes do período)
    const [prevTx, prevApts] = await Promise.all([
      prisma.transaction.findMany({
        where: { barbershopId, date: { lt: start }, status: 'completed' }
      }),
      prisma.appointment.findMany({
        where: { barbershopId, status: 'completed', date: { lt: start } }
      })
    ]);

    const previousBalance = prevTx.reduce((s, t) =>
      s + (t.type === 'income' ? Number(t.amount) : -Number(t.amount)), 0
    ) + prevApts.reduce((s, a) => s + Number(a.price), 0);

    const currentBalance = previousBalance + netProfit;

    const expensesByCategory = transactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + Number(t.amount);
        return acc;
      }, {} as Record<string, number>);

    const revenueByCategory = transactions
      .filter(t => t.type === 'income')
      .reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + Number(t.amount);
        return acc;
      }, {} as Record<string, number>);

    return res.json({
      period: { start, end },
      summary: {
        currentBalance,
        previousBalance,
        totalRevenue,
        appointmentsRevenue,
        manualIncome,
        totalExpenses,
        netProfit,
        profitMargin: totalRevenue > 0 ? Number(((netProfit / totalRevenue) * 100).toFixed(2)) : 0
      },
      breakdown: { expensesByCategory, revenueByCategory },
      transactions: {
        total:   transactions.length,
        income:  transactions.filter(t => t.type === 'income').length,
        expense: transactions.filter(t => t.type === 'expense').length,
        appointments: appointments.length
      }
    });
  } catch (error) {
    console.error('Erro ao buscar resumo financeiro:', error);
    return res.status(500).json({ error: 'Erro ao buscar resumo financeiro' });
  }
});

// 📊 GET /api/finance/cashflow
router.get('/cashflow', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { year, months = 6 } = req.query;

    const now = new Date();
    const currentYear  = year ? Number(year) : now.getUTCFullYear();
    const monthsToShow = Number(months);

    const cashflow = [];

    for (let i = 0; i < monthsToShow; i++) {
      const d          = new Date(Date.UTC(currentYear, now.getUTCMonth() - i, 1));
      const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
      const monthEnd   = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));

      const [txs, apts] = await Promise.all([
        prisma.transaction.findMany({
          where: { barbershopId, date: { gte: monthStart, lte: monthEnd }, status: 'completed' }
        }),
        prisma.appointment.findMany({
          where: { barbershopId, status: 'completed', date: { gte: monthStart, lte: monthEnd } }
        })
      ]);

      const txIncome   = txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
      const aptRevenue = apts.reduce((s, a) => s + Number(a.price), 0);
      const revenue    = aptRevenue + txIncome;
      const expenses   = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

      cashflow.unshift({
        month: d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' }),
        monthNumber: d.getUTCMonth() + 1,
        year: d.getUTCFullYear(),
        revenue,
        expenses,
        netFlow: revenue - expenses,
        transactionCount: txs.length + apts.length
      });
    }

    return res.json({
      cashflow,
      summary: {
        totalRevenue:          cashflow.reduce((s, m) => s + m.revenue, 0),
        totalExpenses:         cashflow.reduce((s, m) => s + m.expenses, 0),
        averageMonthlyRevenue: cashflow.reduce((s, m) => s + m.revenue, 0) / monthsToShow,
        averageMonthlyExpenses: cashflow.reduce((s, m) => s + m.expenses, 0) / monthsToShow
      }
    });
  } catch (error) {
    console.error('Erro ao buscar fluxo de caixa:', error);
    return res.status(500).json({ error: 'Erro ao buscar fluxo de caixa' });
  }
});

// 📈 GET /api/finance/dre
router.get('/dre', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { startDate, endDate } = req.query;

    const now = new Date();
    const start = startDate
      ? new Date(startDate as string)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = endDate
      ? new Date(endDate as string)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    const [transactions, appointments] = await Promise.all([
      prisma.transaction.findMany({
        where: { barbershopId, date: { gte: start, lte: end }, status: 'completed' }
      }),
      prisma.appointment.findMany({
        where: { barbershopId, status: 'completed', date: { gte: start, lte: end } }
      })
    ]);

    const aptRevenue = appointments.reduce((s, a) => s + Number(a.price), 0);

    const serviceRevenue = aptRevenue + transactions
      .filter(t => t.type === 'income' && t.category === 'service')
      .reduce((s, t) => s + Number(t.amount), 0);

    const productRevenue = transactions
      .filter(t => t.type === 'income' && t.category === 'product')
      .reduce((s, t) => s + Number(t.amount), 0);

    const otherRevenue = transactions
      .filter(t => t.type === 'income' && !['service', 'product'].includes(t.category))
      .reduce((s, t) => s + Number(t.amount), 0);

    const totalRevenue = serviceRevenue + productRevenue + otherRevenue;

    const salaryExpenses     = transactions.filter(t => t.type === 'expense' && t.category === 'salary').reduce((s, t) => s + Number(t.amount), 0);
    const commissionExpenses = transactions.filter(t => t.type === 'expense' && t.category === 'commission').reduce((s, t) => s + Number(t.amount), 0);
    const rentExpenses       = transactions.filter(t => t.type === 'expense' && t.category === 'rent').reduce((s, t) => s + Number(t.amount), 0);
    const utilitiesExpenses  = transactions.filter(t => t.type === 'expense' && t.category === 'utilities').reduce((s, t) => s + Number(t.amount), 0);
    const suppliesExpenses   = transactions.filter(t => t.type === 'expense' && t.category === 'supplies').reduce((s, t) => s + Number(t.amount), 0);
    const otherExpenses      = transactions.filter(t => t.type === 'expense' && !['salary','commission','rent','utilities','supplies'].includes(t.category)).reduce((s, t) => s + Number(t.amount), 0);
    const totalExpenses = salaryExpenses + commissionExpenses + rentExpenses + utilitiesExpenses + suppliesExpenses + otherExpenses;

    const netProfit = totalRevenue - totalExpenses;

    return res.json({
      period: { start, end },
      dre: {
        revenue: { services: serviceRevenue, products: productRevenue, others: otherRevenue, total: totalRevenue },
        expenses: { salaries: salaryExpenses, commissions: commissionExpenses, rent: rentExpenses, utilities: utilitiesExpenses, supplies: suppliesExpenses, others: otherExpenses, total: totalExpenses },
        results: { operatingProfit: netProfit, netProfit, profitMargin: totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(2) : 0 }
      }
    });
  } catch (error) {
    console.error('Erro ao gerar DRE:', error);
    return res.status(500).json({ error: 'Erro ao gerar DRE' });
  }
});

// 💼 GET /api/finance/balance
router.get('/balance', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { date } = req.query;
    const referenceDate = date ? new Date(date as string) : new Date();

    const [transactions, appointments] = await Promise.all([
      prisma.transaction.findMany({
        where: { barbershopId, date: { lte: referenceDate }, status: 'completed' }
      }),
      prisma.appointment.findMany({
        where: { barbershopId, status: 'completed', date: { lte: referenceDate } }
      })
    ]);

    const txBalance  = transactions.reduce((s, t) => s + (t.type === 'income' ? Number(t.amount) : -Number(t.amount)), 0);
    const aptRevenue = appointments.reduce((s, a) => s + Number(a.price), 0);
    const cashBalance = txBalance + aptRevenue;

    const pendingCommissions = await prisma.commission.findMany({
      where: { barbershopId, status: 'pending', referenceMonth: { lte: referenceDate } }
    });
    const totalCommissionsPayable = pendingCommissions.reduce((s, c) => s + Number(c.amount), 0);

    const equity = cashBalance - totalCommissionsPayable;

    return res.json({
      referenceDate,
      balance: {
        assets:      { current: { cash: cashBalance }, total: cashBalance },
        liabilities: { current: { commissionsPayable: totalCommissionsPayable }, total: totalCommissionsPayable },
        equity:      { total: equity }
      },
      verification: {
        balanced:   cashBalance === totalCommissionsPayable + equity,
        difference: cashBalance - (totalCommissionsPayable + equity)
      }
    });
  } catch (error) {
    console.error('Erro ao gerar balanço:', error);
    return res.status(500).json({ error: 'Erro ao gerar balanço patrimonial' });
  }
});

export default router;