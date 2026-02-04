import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';
import { generateAppointmentsPDF, generateRevenuePDF, generateCustomersPDF } from '../utils/pdf-generator';
import { generateAppointmentsExcel, generateRevenueExcel, generateCustomersExcel } from '../utils/excel-generator';

const router = Router();

// 📊 GET /api/reports/appointments - Relatório de Agendamentos
router.get('/appointments', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { startDate, endDate, barberId, status, serviceId, format = 'json' } = req.query;

    // Construir filtros
    const where: any = { barbershopId };

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      };
    }

    if (barberId) where.barberId = barberId as string;
    if (status) where.status = status as string;
    if (serviceId) where.serviceId = serviceId as string;

    // Buscar agendamentos
    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        customer: { select: { name: true, phone: true } },
        barber: { select: { name: true } },
        service: { select: { name: true, duration: true } }
      },
      orderBy: { date: 'desc' }
    });

    // Estatísticas
    const total = appointments.length;
    const completed = appointments.filter(a => a.status === 'completed').length;
    const cancelled = appointments.filter(a => a.status === 'cancelled').length;
    const totalRevenue = appointments
      .filter(a => a.status === 'completed')
      .reduce((sum, a) => sum + Number(a.price), 0);

    const data = {
      appointments,
      summary: {
        total,
        completed,
        cancelled,
        totalRevenue
      },
      filters: { startDate, endDate, barberId, status, serviceId }
    };

    // Retornar no formato solicitado
    if (format === 'pdf') {
      const pdfBuffer = await generateAppointmentsPDF(data);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=relatorio-agendamentos.pdf');
      return res.send(pdfBuffer);
    }

    if (format === 'excel') {
      const excelBuffer = await generateAppointmentsExcel(data);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=relatorio-agendamentos.xlsx');
      return res.send(excelBuffer);
    }

    return res.json(data);
  } catch (error) {
    console.error('Erro ao gerar relatório de agendamentos:', error);
    return res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

// 💰 GET /api/reports/revenue - Relatório de Receita
router.get('/revenue', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { startDate, endDate, barberId, format = 'json' } = req.query;

    const where: any = {
      barbershopId,
      status: 'completed'
    };

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      };
    }

    if (barberId) where.barberId = barberId as string;

    // Buscar agendamentos completados
    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        barber: { select: { name: true } },
        service: { select: { name: true } }
      },
      orderBy: { date: 'desc' }
    });

    // Análises
    const totalRevenue = appointments.reduce((sum, a) => sum + Number(a.price), 0);
    const totalAppointments = appointments.length;
    const averageTicket = totalAppointments > 0 ? totalRevenue / totalAppointments : 0;

    // Receita por barbeiro
    const revenueByBarber = appointments.reduce((acc: any, a) => {
      const barberName = a.barber.name;
      if (!acc[barberName]) {
        acc[barberName] = { name: barberName, revenue: 0, appointments: 0 };
      }
      acc[barberName].revenue += Number(a.price);
      acc[barberName].appointments += 1;
      return acc;
    }, {});

    // Receita por serviço
    const revenueByService = appointments.reduce((acc: any, a) => {
      const serviceName = a.service.name;
      if (!acc[serviceName]) {
        acc[serviceName] = { name: serviceName, revenue: 0, count: 0 };
      }
      acc[serviceName].revenue += Number(a.price);
      acc[serviceName].count += 1;
      return acc;
    }, {});

    const data = {
      summary: {
        totalRevenue,
        totalAppointments,
        averageTicket
      },
      revenueByBarber: Object.values(revenueByBarber),
      revenueByService: Object.values(revenueByService),
      filters: { startDate, endDate, barberId }
    };

    if (format === 'pdf') {
      const pdfBuffer = await generateRevenuePDF(data);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=relatorio-receita.pdf');
      return res.send(pdfBuffer);
    }

    if (format === 'excel') {
      const excelBuffer = await generateRevenueExcel(data);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=relatorio-receita.xlsx');
      return res.send(excelBuffer);
    }

    return res.json(data);
  } catch (error) {
    console.error('Erro ao gerar relatório de receita:', error);
    return res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

// 👥 GET /api/reports/customers - Relatório de Clientes
router.get('/customers', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { startDate, endDate, format = 'json' } = req.query;

    // Buscar todos os clientes
    const customers = await prisma.customer.findMany({
      where: { barbershopId, active: true },
      include: {
        appointments: {
          where: {
            ...(startDate && endDate ? {
              date: {
                gte: new Date(startDate as string),
                lte: new Date(endDate as string)
              }
            } : {})
          }
        }
      }
    });

    // Análises
    const totalCustomers = customers.length;
    const activeCustomers = customers.filter(c => c.appointments.length > 0).length;
    const newCustomers = customers.filter(c => {
      if (!startDate || !endDate) return false;
      return c.createdAt >= new Date(startDate as string) && c.createdAt <= new Date(endDate as string);
    }).length;

    // Clientes por frequência
    const customersByFrequency = customers.map(c => ({
      name: c.name,
      phone: c.phone,
      email: c.email,
      totalAppointments: c.appointments.length,
      lastVisit: c.appointments.length > 0 
        ? new Date(Math.max(...c.appointments.map(a => a.date.getTime())))
        : null
    })).sort((a, b) => b.totalAppointments - a.totalAppointments);

    const data = {
      summary: {
        totalCustomers,
        activeCustomers,
        newCustomers,
        inactiveCustomers: totalCustomers - activeCustomers
      },
      customers: customersByFrequency,
      filters: { startDate, endDate }
    };

    if (format === 'pdf') {
      const pdfBuffer = await generateCustomersPDF(data);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=relatorio-clientes.pdf');
      return res.send(pdfBuffer);
    }

    if (format === 'excel') {
      const excelBuffer = await generateCustomersExcel(data);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=relatorio-clientes.xlsx');
      return res.send(excelBuffer);
    }

    return res.json(data);
  } catch (error) {
    console.error('Erro ao gerar relatório de clientes:', error);
    return res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

export default router;