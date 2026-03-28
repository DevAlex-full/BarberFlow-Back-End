import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Dashboard stats (rota existente)
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);

    const [
      totalCustomers,
      totalServices,
      todayAppointments,
      monthRevenue,
      monthTransactionRevenue,
      monthAppointments,
      upcomingAppointments
    ] = await Promise.all([
      prisma.customer.count({
        where: { barbershopId, active: true }
      }),
      prisma.service.count({
        where: { barbershopId, active: true }
      }),
      prisma.appointment.count({
        where: {
          barbershopId,
          date: { gte: today, lt: tomorrow }
        }
      }),
      prisma.appointment.aggregate({
        where: {
          barbershopId,
          status: 'completed',
          date: { gte: firstDayOfMonth, lte: lastDayOfMonth }
        },
        _sum: { price: true }
      }),
      // ✅ FIX: inclui receitas manuais (transações) além dos agendamentos
      prisma.transaction.aggregate({
        where: {
          barbershopId,
          type: 'income',
          status: 'completed',
          date: { gte: firstDayOfMonth, lte: lastDayOfMonth }
        },
        _sum: { amount: true }
      }),
      prisma.appointment.count({
        where: {
          barbershopId,
          date: { gte: firstDayOfMonth, lte: lastDayOfMonth }
        }
      }),
      prisma.appointment.findMany({
        where: {
          barbershopId,
          date: { gte: new Date() },
          status: { in: ['scheduled', 'confirmed'] }
        },
        include: {
          customer: { select: { name: true, phone: true } },
          barber: { select: { name: true } },
          service: { select: { name: true, duration: true } }
        },
        orderBy: { date: 'asc' },
        take: 5
      })
    ]);

    // ✅ FIX: soma agendamentos + transações manuais
    const totalMonthRevenue =
      Number(monthRevenue._sum.price || 0) +
      Number(monthTransactionRevenue._sum.amount || 0);

    return res.json({
      totalCustomers,
      totalServices,
      todayAppointments,
      monthRevenue: totalMonthRevenue,
      monthAppointments,
      upcomingAppointments
    });
  } catch (error) {
    console.error('Erro ao buscar stats:', error);
    return res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

// 📊 NOVA ROTA: Dashboard charts e analytics (OTIMIZADA)
router.get('/charts', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const now = new Date();

    // ========================================
    // 📈 RECEITA MENSAL (últimos 12 meses)
    // ========================================
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    // Buscar agendamentos e transações dos últimos 12 meses em paralelo
    const [allAppointments, allTransactions] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          barbershopId,
          status: 'completed',
          date: { gte: twelveMonthsAgo }
        },
        select: { date: true, price: true }
      }),
      prisma.transaction.findMany({
        where: {
          barbershopId,
          type: 'income',
          status: 'completed',
          date: { gte: twelveMonthsAgo }
        },
        select: { date: true, amount: true }
      })
    ]);

    const revenueChart = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);

      const appointmentRevenue = allAppointments
        .filter(apt => apt.date >= firstDay && apt.date <= lastDay)
        .reduce((sum, apt) => sum + Number(apt.price || 0), 0);

      // ✅ FIX: inclui transações manuais no gráfico de receita
      const transactionRevenue = allTransactions
        .filter(t => t.date >= firstDay && t.date <= lastDay)
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);

      revenueChart.push({
        month: monthNames[date.getMonth()],
        revenue: appointmentRevenue + transactionRevenue
      });
    }

    // ========================================
    // 📅 AGENDAMENTOS DIÁRIOS (últimos 30 dias)
    // ========================================
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const allAppointmentsLast30 = await prisma.appointment.findMany({
      where: {
        barbershopId,
        date: { gte: thirtyDaysAgo }
      },
      select: { date: true }
    });

    const appointmentsChart = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);

      const count = allAppointmentsLast30.filter(
        apt => apt.date >= date && apt.date < nextDay
      ).length;

      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');

      appointmentsChart.push({
        date: `${day}/${month}`,
        count
      });
    }

    // ========================================
    // ✂️ TOP 3 SERVIÇOS MAIS VENDIDOS
    // ========================================
    const topServicesData = await prisma.appointment.groupBy({
      by: ['serviceId'],
      where: {
        barbershopId,
        status: 'completed'
      },
      _count: { serviceId: true },
      _sum: { price: true },
      orderBy: {
        _count: { serviceId: 'desc' }
      },
      take: 3
    });

    const topServices = await Promise.all(
      topServicesData.map(async (item) => {
        const service = await prisma.service.findUnique({
          where: { id: item.serviceId },
          select: { name: true }
        });

        return {
          name: service?.name || 'Serviço removido',
          count: item._count.serviceId,
          revenue: item._sum.price ? Number(item._sum.price) : 0
        };
      })
    );

    // ========================================
    // 📊 TAXA DE OCUPAÇÃO (últimos 30 dias)
    // ========================================
    const totalAppointmentsLast30Days = allAppointmentsLast30.length;

    const barbersCount = await prisma.user.count({
      where: { barbershopId, role: 'barber', active: true }
    });

    const numberOfBarbers = barbersCount || 1;
    const slotsPerDay = 20;
    const totalSlots = slotsPerDay * 30 * numberOfBarbers;
    const occupancyRate = totalSlots > 0 ? (totalAppointmentsLast30Days / totalSlots) * 100 : 0;

    // ========================================
    // 📈 COMPARATIVO: MÊS ATUAL VS ANTERIOR
    // ========================================
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const currentMonthApts = allAppointments.filter(
      apt => apt.date >= currentMonthStart && apt.date <= currentMonthEnd
    );
    const previousMonthApts = allAppointments.filter(
      apt => apt.date >= previousMonthStart && apt.date <= previousMonthEnd
    );

    const currentMonthTxs = allTransactions.filter(
      t => t.date >= currentMonthStart && t.date <= currentMonthEnd
    );
    const previousMonthTxs = allTransactions.filter(
      t => t.date >= previousMonthStart && t.date <= previousMonthEnd
    );

    // ✅ FIX: soma agendamentos + transações manuais no comparativo
    const currentRevenue =
      currentMonthApts.reduce((sum, apt) => sum + Number(apt.price || 0), 0) +
      currentMonthTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const previousRevenue =
      previousMonthApts.reduce((sum, apt) => sum + Number(apt.price || 0), 0) +
      previousMonthTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const currentMonthAppointments = currentMonthApts.length;
    const previousMonthAppointments = previousMonthApts.length;

    const revenueGrowth = previousRevenue > 0
      ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
      : 0;

    const appointmentsGrowth = previousMonthAppointments > 0
      ? ((currentMonthAppointments - previousMonthAppointments) / previousMonthAppointments) * 100
      : 0;

    return res.json({
      revenueChart,
      appointmentsChart,
      topServices,
      occupancyRate: Math.min(occupancyRate, 100).toFixed(1),
      comparison: {
        currentMonth: {
          revenue: currentRevenue,
          appointments: currentMonthAppointments
        },
        previousMonth: {
          revenue: previousRevenue,
          appointments: previousMonthAppointments
        },
        growth: {
          revenue: revenueGrowth.toFixed(1),
          appointments: appointmentsGrowth.toFixed(1)
        }
      }
    });
  } catch (error) {
    console.error('Erro ao buscar charts:', error);
    return res.status(500).json({ error: 'Erro ao buscar gráficos' });
  }
});

export default router;