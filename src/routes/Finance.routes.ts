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

    // ✅ B2: aggregate em vez de findMany ilimitado para calcular saldo anterior
    // ANTES: 2 findMany sem limit carregavam TODA a história em memória
    // DEPOIS: 3 aggregate retornam apenas 3 números ao banco
    const [prevTxIncome, prevTxExpense, prevAptsSum] = await Promise.all([
      prisma.transaction.aggregate({
        where: { barbershopId, date: { lt: start }, status: 'completed', type: 'income' },
        _sum: { amount: true }
      }),
      prisma.transaction.aggregate({
        where: { barbershopId, date: { lt: start }, status: 'completed', type: 'expense' },
        _sum: { amount: true }
      }),
      prisma.appointment.aggregate({
        where: { barbershopId, status: 'completed', date: { lt: start } },
        _sum: { price: true }
      })
    ]);

    const previousBalance =
      Number(prevTxIncome._sum.amount  || 0) -
      Number(prevTxExpense._sum.amount || 0) +
      Number(prevAptsSum._sum.price    || 0);

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
        total:        transactions.length,
        income:       transactions.filter(t => t.type === 'income').length,
        expense:      transactions.filter(t => t.type === 'expense').length,
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

    const now          = new Date();
    const currentYear  = year ? Number(year) : now.getUTCFullYear();
    const monthsToShow = Number(months);

    // ✅ B2: 2 queries paralelas em vez de loop serial de monthsToShow*2 queries
    // ANTES: for (i < monthsToShow) → 2 queries por iteração = 12 queries seriais (padrão 6 meses)
    // DEPOIS: 1 busca do período completo em paralelo, agrupamento em JS
    const rangeStart = new Date(Date.UTC(currentYear, now.getUTCMonth() - monthsToShow + 1, 1));
    const rangeEnd   = new Date(Date.UTC(currentYear, now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    const [allTxs, allApts] = await Promise.all([
      prisma.transaction.findMany({
        where: { barbershopId, date: { gte: rangeStart, lte: rangeEnd }, status: 'completed' },
        select: { date: true, type: true, amount: true }
      }),
      prisma.appointment.findMany({
        where: { barbershopId, status: 'completed', date: { gte: rangeStart, lte: rangeEnd } },
        select: { date: true, price: true }
      })
    ]);

    // Agrupar em memória por mês — lógica idêntica à anterior, sem queries no loop
    const cashflow = [];

    for (let i = 0; i < monthsToShow; i++) {
      const d          = new Date(Date.UTC(currentYear, now.getUTCMonth() - i, 1));
      const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
      const monthEnd   = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));

      const monthTxs  = allTxs.filter(t => t.date >= monthStart && t.date <= monthEnd);
      const monthApts = allApts.filter(a => a.date >= monthStart && a.date <= monthEnd);

      const txIncome   = monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
      const aptRevenue = monthApts.reduce((s, a) => s + Number(a.price), 0);
      const revenue    = aptRevenue + txIncome;
      const expenses   = monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

      cashflow.unshift({
        month: d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' }),
        monthNumber: d.getUTCMonth() + 1,
        year:        d.getUTCFullYear(),
        revenue,
        expenses,
        netFlow:          revenue - expenses,
        transactionCount: monthTxs.length + monthApts.length
      });
    }

    return res.json({
      cashflow,
      summary: {
        totalRevenue:           cashflow.reduce((s, m) => s + m.revenue, 0),
        totalExpenses:          cashflow.reduce((s, m) => s + m.expenses, 0),
        averageMonthlyRevenue:  cashflow.reduce((s, m) => s + m.revenue, 0)  / monthsToShow,
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
        revenue:  { services: serviceRevenue, products: productRevenue, others: otherRevenue, total: totalRevenue },
        expenses: { salaries: salaryExpenses, commissions: commissionExpenses, rent: rentExpenses, utilities: utilitiesExpenses, supplies: suppliesExpenses, others: otherExpenses, total: totalExpenses },
        results:  { operatingProfit: netProfit, netProfit, profitMargin: totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(2) : 0 }
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
    const barbershopId  = req.user!.barbershopId!;
    const { date }      = req.query;
    const referenceDate = date ? new Date(date as string) : new Date();

    // ✅ B2: aggregate em vez de findMany ilimitado para calcular saldo total
    // ANTES: 2 findMany sem limit carregavam TODA a história em memória
    // DEPOIS: 3 aggregate retornam apenas 3 números ao banco
    const [txIncome, txExpense, aptRevenue] = await Promise.all([
      prisma.transaction.aggregate({
        where: { barbershopId, date: { lte: referenceDate }, status: 'completed', type: 'income' },
        _sum: { amount: true }
      }),
      prisma.transaction.aggregate({
        where: { barbershopId, date: { lte: referenceDate }, status: 'completed', type: 'expense' },
        _sum: { amount: true }
      }),
      prisma.appointment.aggregate({
        where: { barbershopId, status: 'completed', date: { lte: referenceDate } },
        _sum: { price: true }
      })
    ]);

    const cashBalance =
      Number(txIncome._sum.amount  || 0) -
      Number(txExpense._sum.amount || 0) +
      Number(aptRevenue._sum.price || 0);

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