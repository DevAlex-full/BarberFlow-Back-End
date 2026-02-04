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
    // ========================================
    const allCustomers = await prisma.customer.findMany({
      where: { barbershopId, active: true },
      include: {
        appointments: {
          where: { date: { gte: thirtyDaysAgo } }
        }
      }
    });

    const newCustomers = allCustomers.filter(c => 
      c.createdAt >= thirtyDaysAgo
    ).length;

    const recurringCustomers = allCustomers.filter(c => 
      c.appointments.length > 1
    ).length;

    const oneTimeCustomers = allCustomers.filter(c => 
      c.appointments.length === 1
    ).length;

    // ========================================
    // 📊 PERFORMANCE POR BARBEIRO
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

    const barberPerformance = barbers.map(barber => ({
      name: barber.name,
      appointments: barber.appointments.length,
      revenue: barber.appointments.reduce((sum, apt) => sum + Number(apt.price), 0),
      averageTicket: barber.appointments.length > 0
        ? barber.appointments.reduce((sum, apt) => sum + Number(apt.price), 0) / barber.appointments.length
        : 0
    })).sort((a, b) => b.revenue - a.revenue);

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
    // ========================================
    const completedLast30 = allAppointmentsLast30.filter(a => a.status === 'completed');
    const revenueLast30 = completedLast30.reduce((sum, a) => sum + Number(a.price), 0);
    const avgRevenuePerDay = revenueLast30 / 30;

    // Período anterior (30-60 dias atrás)
    const appointmentsPrevious30 = await prisma.appointment.findMany({
      where: {
        barbershopId,
        date: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
        status: 'completed'
      }
    });
    
    const revenuePrevious30 = appointmentsPrevious30.reduce((sum, a) => sum + Number(a.price), 0);
    const growthRate = revenuePrevious30 > 0 
      ? ((revenueLast30 - revenuePrevious30) / revenuePrevious30) * 100
      : 0;

    // Tempo médio entre visitas (clientes recorrentes)
    const recurringCustomersData = allCustomers.filter(c => c.appointments.length > 1);
    let totalDaysBetweenVisits = 0;
    let visitPairs = 0;

    recurringCustomersData.forEach(customer => {
      const sortedApts = customer.appointments.sort((a, b) => a.date.getTime() - b.date.getTime());
      for (let i = 1; i < sortedApts.length; i++) {
        const daysDiff = (sortedApts[i].date.getTime() - sortedApts[i-1].date.getTime()) / (1000 * 60 * 60 * 24);
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
    insights.push({
      type: 'success',
      icon: '📅',
      message: `Seu melhor dia é ${days[bestDayIndex]} com ${appointmentsByDay[bestDayIndex]} agendamentos!`
    });

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
    if (barberPerformance.length > 0) {
      const topBarber = barberPerformance[0];
      insights.push({
        type: 'info',
        icon: '⭐',
        message: `${topBarber.name} é o destaque com R$ ${topBarber.revenue.toFixed(2)} em receita!`
      });
    }

    // Insight 5: Clientes novos
    if (newCustomers > 10) {
      insights.push({
        type: 'success',
        icon: '🎉',
        message: `${newCustomers} novos clientes nos últimos 30 dias!`
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