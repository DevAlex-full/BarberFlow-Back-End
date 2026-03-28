import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// 💰 GET /api/transactions - Listar transações
router.get('/', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { startDate, endDate, type, category, status } = req.query;

    const where: any = { barbershopId };

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      };
    }

    if (type) where.type = type as string;
    if (category) where.category = category as string;
    if (status) where.status = status as string;

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 100
    });

    return res.json(transactions);
  } catch (error) {
    console.error('Erro ao listar transações:', error);
    return res.status(500).json({ error: 'Erro ao listar transações' });
  }
});

// 📊 GET /api/transactions/summary - Resumo financeiro
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { startDate, endDate } = req.query;

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const dateFilter = startDate && endDate ? {
      gte: new Date(startDate as string),
      lte: new Date(endDate as string)
    } : {
      gte: firstDayOfMonth,
      lte: lastDayOfMonth
    };

    // Receitas
    const incomes = await prisma.transaction.aggregate({
      where: {
        barbershopId,
        type: 'income',
        status: 'completed',
        date: dateFilter
      },
      _sum: { amount: true },
      _count: true
    });

    // Despesas
    const expenses = await prisma.transaction.aggregate({
      where: {
        barbershopId,
        type: 'expense',
        status: 'completed',
        date: dateFilter
      },
      _sum: { amount: true },
      _count: true
    });

    const totalIncome = Number(incomes._sum.amount || 0);
    const totalExpense = Number(expenses._sum.amount || 0);
    const netProfit = totalIncome - totalExpense;

    // Receitas de agendamentos (para comparar)
    const appointmentsRevenue = await prisma.appointment.aggregate({
      where: {
        barbershopId,
        status: 'completed',
        date: dateFilter
      },
      _sum: { price: true }
    });

    // Despesas por categoria
    const expensesByCategory = await prisma.transaction.groupBy({
      by: ['category'],
      where: {
        barbershopId,
        type: 'expense',
        status: 'completed',
        date: dateFilter
      },
      _sum: { amount: true }
    });

    return res.json({
      summary: {
        totalIncome,
        totalExpense,
        netProfit,
        incomeCount: incomes._count,
        expenseCount: expenses._count,
        profitMargin: totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0
      },
      appointmentsRevenue: Number(appointmentsRevenue._sum.price || 0),
      expensesByCategory: expensesByCategory.map(item => ({
        category: item.category,
        amount: Number(item._sum.amount || 0)
      }))
    });
  } catch (error) {
    console.error('Erro ao buscar resumo:', error);
    return res.status(500).json({ error: 'Erro ao buscar resumo financeiro' });
  }
});

// 💵 POST /api/transactions - Criar transação
router.post('/', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const {
      type, category, description, amount, date, paymentMethod, status,
      // Novos campos para receita manual
      barberId, customerId, customerName, customerPhone, serviceName
    } = req.body;

    if (!type || !['income', 'expense'].includes(type)) {
      return res.status(400).json({ error: 'Tipo inválido (use income ou expense)' });
    }

    if (!category || !description || !amount) {
      return res.status(400).json({ error: 'Categoria, descrição e valor são obrigatórios' });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'Valor deve ser maior que zero' });
    }

    // Validação extra para receita com barbeiro
    if (type === 'income' && barberId) {
      if (!serviceName) {
        return res.status(400).json({ error: 'Serviço é obrigatório para receitas com barbeiro' });
      }
      if (!customerId && !customerName) {
        return res.status(400).json({ error: 'Cliente é obrigatório para receitas com barbeiro' });
      }
    }

    // Se novo cliente, salvar na tabela customers
    let finalCustomerId = customerId || null;
    if (type === 'income' && barberId && !customerId && customerName) {
      const newCustomer = await prisma.customer.create({
        data: {
          name: customerName.trim(),
          phone: customerPhone?.replace(/\D/g, '') || '00000000000',
          barbershopId,
          active: true
        }
      });
      finalCustomerId = newCustomer.id;
    }

    const transaction = await prisma.transaction.create({
      data: {
        barbershopId,
        type,
        category,
        description,
        amount,
        date: date ? new Date(date) : new Date(),
        paymentMethod: paymentMethod || null,
        status: status || 'completed',
        barberId: barberId || null,
        customerId: finalCustomerId,
        serviceName: serviceName || null
      }
    });

    // Gerar comissão automaticamente para receita com barbeiro
    if (type === 'income' && barberId) {
      const barber = await prisma.user.findUnique({
        where: { id: barberId },
        select: { commissionPercentage: true }
      });

      if (barber) {
        const commissionAmount = (Number(amount) * barber.commissionPercentage) / 100;
        const now = new Date();
        await prisma.commission.create({
          data: {
            barberId,
            barbershopId,
            percentage: barber.commissionPercentage,
            amount: commissionAmount,
            referenceMonth: new Date(now.getFullYear(), now.getMonth(), 1),
            status: 'pending'
          }
        });
      }
    }

    return res.status(201).json(transaction);
  } catch (error) {
    console.error('Erro ao criar transação:', error);
    return res.status(500).json({ error: 'Erro ao criar transação' });
  }
});

// ✏️ PUT /api/transactions/:id - Atualizar transação
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const barbershopId = req.user!.barbershopId!;
    const { type, category, description, amount, date, paymentMethod, status } = req.body;

    // Verificar se existe e pertence à barbearia
    const existing = await prisma.transaction.findFirst({
      where: { id, barbershopId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Transação não encontrada' });
    }

    const transaction = await prisma.transaction.update({
      where: { id },
      data: {
        type,
        category,
        description,
        amount,
        date: date ? new Date(date) : undefined,
        paymentMethod,
        status
      }
    });

    return res.json(transaction);
  } catch (error) {
    console.error('Erro ao atualizar transação:', error);
    return res.status(500).json({ error: 'Erro ao atualizar transação' });
  }
});

// 🗑️ DELETE /api/transactions/:id - Excluir transação
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const barbershopId = req.user!.barbershopId!;

    // Verificar se existe e pertence à barbearia
    const existing = await prisma.transaction.findFirst({
      where: { id, barbershopId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Transação não encontrada' });
    }

    await prisma.transaction.delete({
      where: { id }
    });

    return res.json({ message: 'Transação excluída com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir transação:', error);
    return res.status(500).json({ error: 'Erro ao excluir transação' });
  }
});

// 📈 GET /api/transactions/cashflow - Fluxo de caixa
router.get('/cashflow', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { months = 6 } = req.query;

    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - Number(months) + 1, 1);

    const transactions = await prisma.transaction.findMany({
      where: {
        barbershopId,
        date: { gte: startDate },
        status: 'completed'
      },
      orderBy: { date: 'asc' }
    });

    // Agrupar por mês
    const monthlyData: any = {};
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    transactions.forEach(t => {
      const monthKey = `${t.date.getFullYear()}-${t.date.getMonth()}`;
      const monthLabel = `${monthNames[t.date.getMonth()]}/${t.date.getFullYear()}`;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthLabel,
          income: 0,
          expense: 0,
          net: 0
        };
      }

      if (t.type === 'income') {
        monthlyData[monthKey].income += Number(t.amount);
      } else {
        monthlyData[monthKey].expense += Number(t.amount);
      }

      monthlyData[monthKey].net = monthlyData[monthKey].income - monthlyData[monthKey].expense;
    });

    const cashflow = Object.values(monthlyData);

    return res.json(cashflow);
  } catch (error) {
    console.error('Erro ao buscar fluxo de caixa:', error);
    return res.status(500).json({ error: 'Erro ao buscar fluxo de caixa' });
  }
});

export default router;