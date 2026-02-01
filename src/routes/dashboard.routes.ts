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

    // Total de clientes
    const totalCustomers = await prisma.customer.count({
      where: { barbershopId, active: true }
    });

    // Total de serviços
    const totalServices = await prisma.service.count({
      where: { barbershopId, active: true }
    });

    // Agendamentos de hoje
    const todayAppointments = await prisma.appointment.count({
      where: {
        barbershopId,
        date: { gte: today, lt: tomorrow }
      }
    });

    // Receita do mês
    const monthRevenue = await prisma.appointment.aggregate({
      where: {
        barbershopId,
        status: 'completed',
        date: { gte: firstDayOfMonth, lte: lastDayOfMonth }
      },
      _sum: { price: true }
    });

    // Agendamentos do mês
    const monthAppointments = await prisma.appointment.count({
      where: {
        barbershopId,
        date: { gte: firstDayOfMonth, lte: lastDayOfMonth }
      }
    });

    // Próximos agendamentos
    const upcomingAppointments = await prisma.appointment.findMany({
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
    });

    return res.json({
      totalCustomers,
      totalServices,
      todayAppointments,
      monthRevenue: monthRevenue._sum.price || 0,
      monthAppointments,
      upcomingAppointments
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

// 📊 NOVA ROTA: Dashboard charts e analytics
router.get('/charts', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const now = new Date();

    // ========================================
    // 📈 RECEITA MENSAL (últimos 12 meses)
    // ========================================
    const revenueChart = [];
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);

      const revenue = await prisma.appointment.aggregate({
        where: {
          barbershopId,
          status: 'completed',
          date: { gte: firstDay, lte: lastDay }
        },
        _sum: { price: true }
      });

      revenueChart.push({
        month: monthNames[date.getMonth()],
        revenue: revenue._sum.price ? Number(revenue._sum.price) : 0
      });
    }

    // ========================================
    // 📅 AGENDAMENTOS DIÁRIOS (últimos 30 dias)
    // ========================================
    const appointmentsChart = [];
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);

      const count = await prisma.appointment.count({
        where: {
          barbershopId,
          date: { gte: date, lt: nextDay }
        }
      });

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
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const totalAppointmentsLast30Days = await prisma.appointment.count({
      where: {
        barbershopId,
        date: { gte: thirtyDaysAgo }
      }
    });

    // Calcular slots disponíveis (assumindo 10h/dia, 30min por slot = 20 slots/dia * 30 dias = 600 slots)
    const barbersCount = await prisma.user.count({
      where: { barbershopId, role: 'barber' }
    });

    const numberOfBarbers = barbersCount || 1; // Mínimo 1 barbeiro
    const slotsPerDay = 20; // 10h de trabalho, 30min por slot
    const totalSlots = slotsPerDay * 30 * numberOfBarbers;
    const occupancyRate = totalSlots > 0 ? (totalAppointmentsLast30Days / totalSlots) * 100 : 0;

    // ========================================
    // 📈 COMPARATIVO: MÊS ATUAL VS ANTERIOR
    // ========================================
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // Mês atual
    const currentMonthRevenue = await prisma.appointment.aggregate({
      where: {
        barbershopId,
        status: 'completed',
        date: { gte: currentMonthStart, lte: currentMonthEnd }
      },
      _sum: { price: true }
    });

    const currentMonthAppointments = await prisma.appointment.count({
      where: {
        barbershopId,
        date: { gte: currentMonthStart, lte: currentMonthEnd }
      }
    });

    // Mês anterior
    const previousMonthRevenue = await prisma.appointment.aggregate({
      where: {
        barbershopId,
        status: 'completed',
        date: { gte: previousMonthStart, lte: previousMonthEnd }
      },
      _sum: { price: true }
    });

    const previousMonthAppointments = await prisma.appointment.count({
      where: {
        barbershopId,
        date: { gte: previousMonthStart, lte: previousMonthEnd }
      }
    });

    // Calcular crescimento
    const currentRevenue = currentMonthRevenue._sum.price ? Number(currentMonthRevenue._sum.price) : 0;
    const previousRevenue = previousMonthRevenue._sum.price ? Number(previousMonthRevenue._sum.price) : 0;
    const revenueGrowth = previousRevenue > 0 
      ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 
      : 0;

    const appointmentsGrowth = previousMonthAppointments > 0
      ? ((currentMonthAppointments - previousMonthAppointments) / previousMonthAppointments) * 100
      : 0;

    // ========================================
    // 📦 RESPOSTA FINAL
    // ========================================
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