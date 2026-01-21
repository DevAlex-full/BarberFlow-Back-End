import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Dashboard stats
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

export default router;