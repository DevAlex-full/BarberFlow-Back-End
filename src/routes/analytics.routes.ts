import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// 📊 GET /api/analytics/overview - Overview completo de analytics
router.get('/overview', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const now = new Date();
    
    // Período: últimos 30 dias
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Período: 60 dias atrás (para comparação)
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    // ========================================
    // 🔥 MAPA DE CALOR - Horários de Pico
    // ========================================
    const appointments = await prisma.appointment.findMany({
      where: {
        barbershopId,
        date: { gte: thirtyDaysAgo }
      },
      select: { date: true }
    });

    const heatmap = Array(7).fill(null).map(() => Array(24).fill(0));
    
    appointments.forEach(apt => {
      const day = apt.date.getDay(); // 0-6 (domingo-sábado)
      const hour = apt.date.getHours(); // 0-23
      heatmap[day][hour]++;
    });

    // Converter para formato mais amigável
    const heatmapData = [];
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    
    for (let day = 0; day < 7; day++) {
      for (let hour = 8; hour < 20; hour++) { // Apenas horário comercial
        heatmapData.push({
          day: days[day],
          hour: `${hour}:00`,
          value: heatmap[day][hour]
        });
      }
    }

    // ========================================
    // 👥 CLIENTES NOVOS VS RECORRENTES
    // ✅ FIX: inclui transações manuais como visitas
    // ========================================
    const allCustomers = await prisma.customer.findMany({
      where: { barbershopId, active: true },
      include: {
        appointments: {
          where: { date: { gte: thirtyDaysAgo } }
        },
        // ✅ FIX: transações manuais contam como visita ao barbeiro
        transactions: {
          where: {
            date: { gte: thirtyDaysAgo },
            type: 'income',
            status: 'completed'
          }
        }
      }
    });

    const newCustomers = allCustomers.filter(c => 
      c.createdAt >= thirtyDaysAgo
    ).length;

    // ✅ FIX: recorrente = mais de 1 visita (agendamento OU transação manual)
    const recurringCustomers = allCustomers.filter(c => 
      (c.appointments.length + c.transactions.length) > 1
    ).length;

    // ✅ FIX: uma visita = exatamente 1 (agendamento OU transação manual)
    const oneTimeCustomers = allCustomers.filter(c => 
      (c.appointments.length + c.transactions.length) === 1
    ).length;

    // ========================================
    // 📊 PERFORMANCE POR BARBEIRO
    // ✅ FIX: inclui receitas manuais do barbeiro
    // ========================================
    const barbers = await prisma.user.findMany({
      where: { barbershopId, role: 'barber', active: true },
      include: {
        appointments: {
          where: {
            date: { gte: thirtyDaysAgo },
            status: 'completed'
          }
        }
      }
    });

    // ✅ FIX: buscar receitas manuais por barbeiro
    const barberTransactions = await prisma.transaction.groupBy({
      by: ['barberId'],
      where: {
        barbershopId,
        type: 'income',
        status: 'completed',
        date: { gte: thirtyDaysAgo },
        barberId: { not: null }
      },
      _sum: { amount: true }
    });

    const barberTxMap: Record<string, number> = {};
    barberTransactions.forEach(t => {
      if (t.barberId) barberTxMap[t.barberId] = Number(t._sum.amount || 0);
    });

    const barberPerformance = barbers.map(barber => {
      const aptRevenue = barber.appointments.reduce((sum, apt) => sum + Number(apt.price), 0);
      const txRevenue = barberTxMap[barber.id] || 0;
      const totalRevenue = aptRevenue + txRevenue;

      return {
        name: barber.name,
        appointments: barber.appointments.length,
        revenue: totalRevenue,
        averageTicket: barber.appointments.length > 0
          ? totalRevenue / barber.appointments.length
          : 0
      };
    }).sort((a, b) => b.revenue - a.revenue);

    // ========================================
    // 🎯 TAXA DE CONVERSÃO (Funil)
    // ========================================
    const allAppointmentsLast30 = await prisma.appointment.findMany({
      where: {
        barbershopId,
        date: { gte: thirtyDaysAgo }
      }
    });

    const scheduled = allAppointmentsLast30.filter(a => a.status === 'scheduled').length;
    const confirmed = allAppointmentsLast30.filter(a => a.status === 'confirmed').length;
    const completed = allAppointmentsLast30.filter(a => a.status === 'completed').length;
    const cancelled = allAppointmentsLast30.filter(a => a.status === 'cancelled').length;
    const total = allAppointmentsLast30.length;

    const conversionFunnel = {
      scheduled,
      confirmed,
      completed,
      cancelled,
      total,
      conversionRate: total > 0 ? (completed / total) * 100 : 0,
      cancellationRate: total > 0 ? (cancelled / total) * 100 : 0
    };

    // ========================================
    // 💰 KPIS EM TEMPO REAL
    // ✅ FIX: inclui receitas de transações manuais
    // ========================================
    const completedLast30 = allAppointmentsLast30.filter(a => a.status === 'completed');
    const aptRevenueLast30 = completedLast30.reduce((sum, a) => sum + Number(a.price), 0);

    // ✅ FIX: buscar receitas manuais dos últimos 30 e 30-60 dias
    const [txLast30, txPrevious30, appointmentsPrevious30] = await Promise.all([
      prisma.transaction.aggregate({
        where: {
          barbershopId,
          type: 'income',
          status: 'completed',
          date: { gte: thirtyDaysAgo }
        },
        _sum: { amount: true }
      }),
      prisma.transaction.aggregate({
        where: {
          barbershopId,
          type: 'income',
          status: 'completed',
          date: { gte: sixtyDaysAgo, lt: thirtyDaysAgo }
        },
        _sum: { amount: true }
      }),
      prisma.appointment.findMany({
        where: {
          barbershopId,
          date: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
          status: 'completed'
        }
      })
    ]);

    // ✅ FIX: receita total = agendamentos + transações manuais
    const revenueLast30 = aptRevenueLast30 + Number(txLast30._sum.amount || 0);
    const avgRevenuePerDay = revenueLast30 / 30;

    const revenuePrevious30 =
      appointmentsPrevious30.reduce((sum, a) => sum + Number(a.price), 0) +
      Number(txPrevious30._sum.amount || 0);

    const growthRate = revenuePrevious30 > 0 
      ? ((revenueLast30 - revenuePrevious30) / revenuePrevious30) * 100
      : 0;

    // Tempo médio entre visitas (clientes recorrentes)
    // ✅ FIX: considera datas de agendamentos E transações manuais
    const recurringCustomersData = allCustomers.filter(c =>
      (c.appointments.length + c.transactions.length) > 1
    );
    let totalDaysBetweenVisits = 0;
    let visitPairs = 0;

    recurringCustomersData.forEach(customer => {
      const allDates = [
        ...customer.appointments.map(a => a.date),
        ...customer.transactions.map(t => t.date)
      ].sort((a, b) => a.getTime() - b.getTime());

      for (let i = 1; i < allDates.length; i++) {
        const daysDiff = (allDates[i].getTime() - allDates[i-1].getTime()) / (1000 * 60 * 60 * 24);
        totalDaysBetweenVisits += daysDiff;
        visitPairs++;
      }
    });

    const avgDaysBetweenVisits = visitPairs > 0 ? totalDaysBetweenVisits / visitPairs : 0;

    // Taxa de retorno
    const returnRate = allCustomers.length > 0 
      ? (recurringCustomers / allCustomers.length) * 100 
      : 0;

    const kpis = {
      avgRevenuePerDay,
      avgDaysBetweenVisits,
      growthRate,
      returnRate,
      totalRevenueLast30: revenueLast30,
      totalAppointmentsLast30: completedLast30.length
    };

    // ========================================
    // 🤖 INSIGHTS AUTOMÁTICOS
    // ========================================
    const insights = [];

    // Insight 1: Melhor dia da semana
    const appointmentsByDay = Array(7).fill(0);
    allAppointmentsLast30.forEach(apt => {
      appointmentsByDay[apt.date.getDay()]++;
    });
    const bestDayIndex = appointmentsByDay.indexOf(Math.max(...appointmentsByDay));
    if (appointmentsByDay[bestDayIndex] > 0) {
      insights.push({
        type: 'success',
        icon: '📅',
        message: `Seu melhor dia é ${days[bestDayIndex]} com ${appointmentsByDay[bestDayIndex]} agendamentos!`
      });
    }

    // Insight 2: Crescimento
    if (growthRate > 10) {
      insights.push({
        type: 'success',
        icon: '📈',
        message: `Receita cresceu ${growthRate.toFixed(1)}% em relação ao mês anterior!`
      });
    } else if (growthRate < -10) {
      insights.push({
        type: 'warning',
        icon: '📉',
        message: `Receita caiu ${Math.abs(growthRate).toFixed(1)}%. Considere ações de marketing.`
      });
    }

    // Insight 3: Taxa de cancelamento
    if (conversionFunnel.cancellationRate > 15) {
      insights.push({
        type: 'warning',
        icon: '⚠️',
        message: `Taxa de cancelamento em ${conversionFunnel.cancellationRate.toFixed(1)}%. Revise política de confirmação.`
      });
    }

    // Insight 4: Melhor barbeiro
    if (barberPerformance.length > 0 && barberPerformance[0].revenue > 0) {
      const topBarber = barberPerformance[0];
      insights.push({
        type: 'info',
        icon: '⭐',
        message: `${topBarber.name} é o destaque com R$ ${topBarber.revenue.toFixed(2)} em receita!`
      });
    }

    // Insight 5: Clientes novos
    if (newCustomers > 0) {
      insights.push({
        type: 'success',
        icon: '🎉',
        message: `${newCustomers} novo${newCustomers > 1 ? 's' : ''} cliente${newCustomers > 1 ? 's' : ''} nos últimos 30 dias!`
      });
    }

    // ========================================
    // 📦 RESPOSTA FINAL
    // ========================================
    return res.json({
      heatmap: heatmapData,
      customers: {
        new: newCustomers,
        recurring: recurringCustomers,
        oneTime: oneTimeCustomers,
        total: allCustomers.length
      },
      barberPerformance,
      conversionFunnel,
      kpis,
      insights
    });
  } catch (error) {
    console.error('Erro ao buscar analytics:', error);
    return res.status(500).json({ error: 'Erro ao buscar analytics' });
  }
});

// 🔥 GET /api/analytics/heatmap - Apenas mapa de calor (mais rápido)
router.get('/heatmap', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { days = 30 } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(days));

    const appointments = await prisma.appointment.findMany({
      where: {
        barbershopId,
        date: { gte: startDate }
      },
      select: { date: true }
    });

    const heatmap = Array(7).fill(null).map(() => Array(24).fill(0));
    
    appointments.forEach(apt => {
      const day = apt.date.getDay();
      const hour = apt.date.getHours();
      heatmap[day][hour]++;
    });

    const days_names = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const heatmapData = [];
    
    for (let day = 0; day < 7; day++) {
      for (let hour = 8; hour < 20; hour++) {
        heatmapData.push({
          day: days_names[day],
          hour: `${hour}:00`,
          value: heatmap[day][hour]
        });
      }
    }

    return res.json(heatmapData);
  } catch (error) {
    console.error('Erro ao buscar heatmap:', error);
    return res.status(500).json({ error: 'Erro ao buscar mapa de calor' });
  }
});

export default router;