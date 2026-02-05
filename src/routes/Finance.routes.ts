import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// 💰 GET /api/finance/summary - Resumo financeiro geral
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { startDate, endDate } = req.query;

    // Período padrão: mês atual
    const start = startDate 
      ? new Date(startDate as string)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    
    const end = endDate
      ? new Date(endDate as string)
      : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);

    // Buscar transações do período
    const transactions = await prisma.transaction.findMany({
      where: {
        barbershopId,
        date: { gte: start, lte: end },
        status: 'completed'
      }
    });

    // Calcular totais
    const totalRevenue = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const totalExpenses = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const netProfit = totalRevenue - totalExpenses;

    // Buscar saldo anterior (todas as transações antes do período)
    const previousTransactions = await prisma.transaction.findMany({
      where: {
        barbershopId,
        date: { lt: start },
        status: 'completed'
      }
    });

    const previousBalance = previousTransactions.reduce((sum, t) => {
      return sum + (t.type === 'income' ? Number(t.amount) : -Number(t.amount));
    }, 0);

    const currentBalance = previousBalance + netProfit;

    // Agrupar despesas por categoria
    const expensesByCategory = transactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => {
        const category = t.category;
        if (!acc[category]) {
          acc[category] = 0;
        }
        acc[category] += Number(t.amount);
        return acc;
      }, {} as Record<string, number>);

    // Agrupar receitas por categoria
    const revenueByCategory = transactions
      .filter(t => t.type === 'income')
      .reduce((acc, t) => {
        const category = t.category;
        if (!acc[category]) {
          acc[category] = 0;
        }
        acc[category] += Number(t.amount);
        return acc;
      }, {} as Record<string, number>);

    return res.json({
      period: { start, end },
      summary: {
        currentBalance,
        previousBalance,
        totalRevenue,
        totalExpenses,
        netProfit,
        profitMargin: totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(2) : 0
      },
      breakdown: {
        expensesByCategory,
        revenueByCategory
      },
      transactions: {
        total: transactions.length,
        income: transactions.filter(t => t.type === 'income').length,
        expense: transactions.filter(t => t.type === 'expense').length
      }
    });
  } catch (error) {
    console.error('Erro ao buscar resumo financeiro:', error);
    return res.status(500).json({ error: 'Erro ao buscar resumo financeiro' });
  }
});

// 📊 GET /api/finance/cashflow - Fluxo de caixa mensal
router.get('/cashflow', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { year, months = 12 } = req.query;

    const currentYear = year ? Number(year) : new Date().getFullYear();
    const monthsToShow = Number(months);

    const cashflow = [];

    for (let i = 0; i < monthsToShow; i++) {
      const date = new Date(currentYear, new Date().getMonth() - i, 1);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);

      const transactions = await prisma.transaction.findMany({
        where: {
          barbershopId,
          date: { gte: monthStart, lte: monthEnd },
          status: 'completed'
        }
      });

      const revenue = transactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const expenses = transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      cashflow.unshift({
        month: date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
        monthNumber: date.getMonth() + 1,
        year: date.getFullYear(),
        revenue,
        expenses,
        netFlow: revenue - expenses,
        transactionCount: transactions.length
      });
    }

    return res.json({
      cashflow,
      summary: {
        totalRevenue: cashflow.reduce((sum, m) => sum + m.revenue, 0),
        totalExpenses: cashflow.reduce((sum, m) => sum + m.expenses, 0),
        averageMonthlyRevenue: cashflow.reduce((sum, m) => sum + m.revenue, 0) / monthsToShow,
        averageMonthlyExpenses: cashflow.reduce((sum, m) => sum + m.expenses, 0) / monthsToShow
      }
    });
  } catch (error) {
    console.error('Erro ao buscar fluxo de caixa:', error);
    return res.status(500).json({ error: 'Erro ao buscar fluxo de caixa' });
  }
});

// 📈 GET /api/finance/dre - Demonstrativo de Resultados do Exercício
router.get('/dre', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { startDate, endDate } = req.query;

    // Período padrão: mês atual
    const start = startDate 
      ? new Date(startDate as string)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    
    const end = endDate
      ? new Date(endDate as string)
      : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);

    const transactions = await prisma.transaction.findMany({
      where: {
        barbershopId,
        date: { gte: start, lte: end },
        status: 'completed'
      }
    });

    // Receitas
    const serviceRevenue = transactions
      .filter(t => t.type === 'income' && t.category === 'service')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const productRevenue = transactions
      .filter(t => t.type === 'income' && t.category === 'product')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const otherRevenue = transactions
      .filter(t => t.type === 'income' && !['service', 'product'].includes(t.category))
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const totalRevenue = serviceRevenue + productRevenue + otherRevenue;

    // Despesas Operacionais
    const salaryExpenses = transactions
      .filter(t => t.type === 'expense' && t.category === 'salary')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const commissionExpenses = transactions
      .filter(t => t.type === 'expense' && t.category === 'commission')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const rentExpenses = transactions
      .filter(t => t.type === 'expense' && t.category === 'rent')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const utilitiesExpenses = transactions
      .filter(t => t.type === 'expense' && t.category === 'utilities')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const suppliesExpenses = transactions
      .filter(t => t.type === 'expense' && t.category === 'supplies')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const otherExpenses = transactions
      .filter(t => t.type === 'expense' && !['salary', 'commission', 'rent', 'utilities', 'supplies'].includes(t.category))
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const totalExpenses = salaryExpenses + commissionExpenses + rentExpenses + 
                         utilitiesExpenses + suppliesExpenses + otherExpenses;

    // Resultados
    const operatingProfit = totalRevenue - totalExpenses;
    const netProfit = operatingProfit; // Simplificado (sem impostos/juros)

    return res.json({
      period: { start, end },
      dre: {
        revenue: {
          services: serviceRevenue,
          products: productRevenue,
          others: otherRevenue,
          total: totalRevenue
        },
        expenses: {
          salaries: salaryExpenses,
          commissions: commissionExpenses,
          rent: rentExpenses,
          utilities: utilitiesExpenses,
          supplies: suppliesExpenses,
          others: otherExpenses,
          total: totalExpenses
        },
        results: {
          operatingProfit,
          netProfit,
          profitMargin: totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(2) : 0
        }
      }
    });
  } catch (error) {
    console.error('Erro ao gerar DRE:', error);
    return res.status(500).json({ error: 'Erro ao gerar DRE' });
  }
});

// 💼 GET /api/finance/balance - Balanço Patrimonial Simplificado
router.get('/balance', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { date } = req.query;

    const referenceDate = date 
      ? new Date(date as string)
      : new Date();

    // Buscar todas as transações até a data de referência
    const transactions = await prisma.transaction.findMany({
      where: {
        barbershopId,
        date: { lte: referenceDate },
        status: 'completed'
      }
    });

    // Calcular saldo (caixa)
    const cashBalance = transactions.reduce((sum, t) => {
      return sum + (t.type === 'income' ? Number(t.amount) : -Number(t.amount));
    }, 0);

    // Buscar comissões pendentes (passivo)
    const pendingCommissions = await prisma.commission.findMany({
      where: {
        barbershopId,
        status: 'pending',
        referenceMonth: { lte: referenceDate }
      }
    });

    const totalCommissionsPayable = pendingCommissions.reduce(
      (sum, c) => sum + Number(c.amount), 
      0
    );

    // Ativos
    const assets = {
      cash: cashBalance,
      total: cashBalance
    };

    // Passivos
    const liabilities = {
      commissionsPayable: totalCommissionsPayable,
      total: totalCommissionsPayable
    };

    // Patrimônio Líquido
    const equity = assets.total - liabilities.total;

    return res.json({
      referenceDate,
      balance: {
        assets: {
          current: {
            cash: assets.cash
          },
          total: assets.total
        },
        liabilities: {
          current: {
            commissionsPayable: liabilities.commissionsPayable
          },
          total: liabilities.total
        },
        equity: {
          total: equity
        }
      },
      verification: {
        balanced: (assets.total === liabilities.total + equity),
        difference: assets.total - (liabilities.total + equity)
      }
    });
  } catch (error) {
    console.error('Erro ao gerar balanço:', error);
    return res.status(500).json({ error: 'Erro ao gerar balanço patrimonial' });
  }
});

export default router;