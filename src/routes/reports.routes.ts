import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';
import { generateAppointmentsPDF, generateRevenuePDF, generateCustomersPDF } from '../utils/pdf-generator';
import { generateAppointmentsExcel, generateRevenueExcel, generateCustomersExcel } from '../utils/excel-generator';

const router = Router();

function buildDateFilter(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return undefined;
  return { gte: new Date(startDate), lte: new Date(endDate) };
}

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Agendado', confirmed: 'Confirmado',
  completed: 'Concluído', cancelled: 'Cancelado'
};
const CATEGORY_LABEL: Record<string, string> = {
  service: 'Serviço', product: 'Produto', salary: 'Salário',
  commission: 'Comissão', rent: 'Aluguel', utilities: 'Utilidades',
  supplies: 'Insumos', other: 'Outro'
};
const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Dinheiro', pix: 'PIX', credit: 'Crédito', debit: 'Débito'
};

// ─────────────────────────────────────────────────────────────
// 📅 GET /api/reports/appointments — Histórico completo
// ─────────────────────────────────────────────────────────────
router.get('/appointments', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { startDate, endDate, barberId, status, serviceId, format = 'json' } = req.query;

    const where: any = { barbershopId };
    const dateFilter = buildDateFilter(startDate as string, endDate as string);
    if (dateFilter) where.date = dateFilter;
    if (barberId) where.barberId = barberId as string;
    if (status) where.status = status as string;
    if (serviceId) where.serviceId = serviceId as string;

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        customer: { select: { name: true, phone: true } },
        client:   { select: { name: true, phone: true } },
        barber:   { select: { name: true } },
        service:  { select: { name: true, duration: true } }
      },
      orderBy: { date: 'desc' }
    });

    const completed  = appointments.filter(a => a.status === 'completed');
    const cancelled  = appointments.filter(a => a.status === 'cancelled').length;
    const scheduled  = appointments.filter(a => a.status === 'scheduled').length;
    const confirmed  = appointments.filter(a => a.status === 'confirmed').length;
    const totalRevenue   = completed.reduce((s, a) => s + Number(a.price), 0);
    const averageTicket  = completed.length > 0 ? totalRevenue / completed.length : 0;

    // Agrupamentos
    const byBarber: Record<string, any> = {};
    const byService: Record<string, any> = {};
    appointments.forEach(a => {
      const bn = a.barber.name;
      if (!byBarber[bn]) byBarber[bn] = { name: bn, total: 0, completed: 0, revenue: 0 };
      byBarber[bn].total++;
      if (a.status === 'completed') { byBarber[bn].completed++; byBarber[bn].revenue += Number(a.price); }

      const sn = a.service.name;
      if (!byService[sn]) byService[sn] = { name: sn, count: 0, revenue: 0 };
      byService[sn].count++;
      if (a.status === 'completed') byService[sn].revenue += Number(a.price);
    });

    const data = {
      appointments: appointments.map(a => ({
        date:          a.date,
        customerName:  a.customer?.name || a.client?.name || 'Não identificado',
        customerPhone: a.customer?.phone || a.client?.phone || '-',
        barberName:    a.barber.name,
        serviceName:   a.service.name,
        serviceDuration: a.service.duration,
        status:        a.status,
        statusLabel:   STATUS_LABEL[a.status] || a.status,
        price:         Number(a.price),
        notes:         a.notes || ''
      })),
      summary: {
        total: appointments.length,
        completed: completed.length,
        cancelled,
        scheduled,
        confirmed,
        totalRevenue,
        averageTicket
      },
      byBarber:  Object.values(byBarber).sort((a: any, b: any) => b.revenue - a.revenue),
      byService: Object.values(byService).sort((a: any, b: any) => b.revenue - a.revenue),
      filters:   { startDate, endDate, barberId, status, serviceId }
    };

    if (format === 'pdf') {
      const buf = await generateAppointmentsPDF(data);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=relatorio-agendamentos.pdf');
      return res.send(buf);
    }
    if (format === 'excel') {
      const buf = await generateAppointmentsExcel(data);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=relatorio-agendamentos.xlsx');
      return res.send(buf);
    }
    return res.json(data);
  } catch (error) {
    console.error('Erro ao gerar relatório de agendamentos:', error);
    return res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

// ─────────────────────────────────────────────────────────────
// 💰 GET /api/reports/revenue — Faturamento completo
// ─────────────────────────────────────────────────────────────
router.get('/revenue', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { startDate, endDate, barberId, format = 'json' } = req.query;
    const dateFilter = buildDateFilter(startDate as string, endDate as string);

    // 1. Agendamentos concluídos
    const aptWhere: any = { barbershopId, status: 'completed' };
    if (dateFilter) aptWhere.date = dateFilter;
    if (barberId)   aptWhere.barberId = barberId as string;

    const appointments = await prisma.appointment.findMany({
      where: aptWhere,
      include: {
        barber:   { select: { name: true } },
        service:  { select: { name: true } },
        customer: { select: { name: true } },
        client:   { select: { name: true } }
      },
      orderBy: { date: 'desc' }
    });

    // 2. Transações manuais (receitas + despesas)
    const txWhere: any = { barbershopId };
    if (dateFilter) txWhere.date = dateFilter;
    if (barberId)   txWhere.barberId = barberId as string;

    const transactions = await prisma.transaction.findMany({
      where: txWhere,
      include: {
        barber:   { select: { name: true } },
        customer: { select: { name: true } }
      },
      orderBy: { date: 'desc' }
    });

    // 3. Comissões do período
    const commWhere: any = { barbershopId };
    if (dateFilter) commWhere.referenceMonth = dateFilter;

    const commissions = await prisma.commission.findMany({
      where: commWhere,
      include: { barber: { select: { name: true } } },
      orderBy: { referenceMonth: 'desc' }
    });

    // ── Cálculos ──
    const appointmentsRevenue    = appointments.reduce((s, a) => s + Number(a.price), 0);
    const manualIncomeRevenue    = transactions.filter(t => t.type === 'income' && t.status === 'completed').reduce((s, t) => s + Number(t.amount), 0);
    const totalRevenue           = appointmentsRevenue + manualIncomeRevenue;
    const totalExpenses          = transactions.filter(t => t.type === 'expense' && t.status === 'completed').reduce((s, t) => s + Number(t.amount), 0);
    const netProfit              = totalRevenue - totalExpenses;
    const averageTicket          = appointments.length > 0 ? appointmentsRevenue / appointments.length : 0;

    // Por barbeiro
    const byBarberMap: Record<string, any> = {};
    appointments.forEach(a => {
      const n = a.barber.name;
      if (!byBarberMap[n]) byBarberMap[n] = { name: n, appointmentsRevenue: 0, manualRevenue: 0, totalRevenue: 0, appointments: 0 };
      byBarberMap[n].appointmentsRevenue += Number(a.price);
      byBarberMap[n].totalRevenue        += Number(a.price);
      byBarberMap[n].appointments++;
    });
    transactions.filter(t => t.type === 'income' && t.barberId).forEach(t => {
      const n = t.barber?.name || 'Sem barbeiro';
      if (!byBarberMap[n]) byBarberMap[n] = { name: n, appointmentsRevenue: 0, manualRevenue: 0, totalRevenue: 0, appointments: 0 };
      byBarberMap[n].manualRevenue += Number(t.amount);
      byBarberMap[n].totalRevenue  += Number(t.amount);
    });

    // Por serviço
    const byServiceMap: Record<string, any> = {};
    appointments.forEach(a => {
      const n = a.service.name;
      if (!byServiceMap[n]) byServiceMap[n] = { name: n, revenue: 0, count: 0 };
      byServiceMap[n].revenue += Number(a.price);
      byServiceMap[n].count++;
    });
    transactions.filter(t => t.type === 'income' && t.serviceName).forEach(t => {
      const n = t.serviceName!;
      if (!byServiceMap[n]) byServiceMap[n] = { name: n, revenue: 0, count: 0 };
      byServiceMap[n].revenue += Number(t.amount);
      byServiceMap[n].count++;
    });

    // Despesas por categoria
    const expensesByCategory: Record<string, number> = {};
    transactions.filter(t => t.type === 'expense').forEach(t => {
      const label = CATEGORY_LABEL[t.category] || t.category;
      expensesByCategory[label] = (expensesByCategory[label] || 0) + Number(t.amount);
    });

    // Por método de pagamento
    const byPaymentMap: Record<string, any> = {};
    transactions.filter(t => t.type === 'income').forEach(t => {
      const m = PAYMENT_LABEL[t.paymentMethod || ''] || t.paymentMethod || 'Não informado';
      if (!byPaymentMap[m]) byPaymentMap[m] = { method: m, amount: 0, count: 0 };
      byPaymentMap[m].amount += Number(t.amount);
      byPaymentMap[m].count++;
    });

    const data = {
      summary: {
        totalRevenue,
        appointmentsRevenue,
        manualTransactionsRevenue: manualIncomeRevenue,
        totalExpenses,
        netProfit,
        profitMargin: totalRevenue > 0 ? Number(((netProfit / totalRevenue) * 100).toFixed(2)) : 0,
        totalAppointments: appointments.length,
        averageTicket
      },
      byBarber:          Object.values(byBarberMap).sort((a: any, b: any) => b.totalRevenue - a.totalRevenue),
      byService:         Object.values(byServiceMap).sort((a: any, b: any) => b.revenue - a.revenue),
      byPaymentMethod:   Object.values(byPaymentMap),
      expensesByCategory,
      transactions: transactions.map(t => ({
        date:          t.date,
        type:          t.type,
        typeLabel:     t.type === 'income' ? 'Receita' : 'Despesa',
        category:      t.category,
        categoryLabel: CATEGORY_LABEL[t.category] || t.category,
        description:   t.description,
        amount:        Number(t.amount),
        paymentMethod: PAYMENT_LABEL[t.paymentMethod || ''] || t.paymentMethod || '-',
        status:        t.status,
        barberName:    t.barber?.name || '-',
        customerName:  t.customer?.name || '-',
        serviceName:   t.serviceName || '-'
      })),
      commissions: commissions.map(c => ({
        barberName:     c.barber.name,
        amount:         Number(c.amount),
        percentage:     c.percentage,
        referenceMonth: c.referenceMonth,
        status:         c.status,
        statusLabel:    c.status === 'paid' ? 'Pago' : 'Pendente',
        paidAt:         c.paidAt
      })),
      filters: { startDate, endDate, barberId }
    };

    if (format === 'pdf') {
      const buf = await generateRevenuePDF(data);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=relatorio-receita.pdf');
      return res.send(buf);
    }
    if (format === 'excel') {
      const buf = await generateRevenueExcel(data);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=relatorio-receita.xlsx');
      return res.send(buf);
    }
    return res.json(data);
  } catch (error) {
    console.error('Erro ao gerar relatório de receita:', error);
    return res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

// ─────────────────────────────────────────────────────────────
// 👥 GET /api/reports/customers — Análise completa de clientes
// ─────────────────────────────────────────────────────────────
router.get('/customers', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { startDate, endDate, format = 'json' } = req.query;
    const dateFilter = buildDateFilter(startDate as string, endDate as string);

    const customers = await prisma.customer.findMany({
      where: { barbershopId, active: true },
      include: {
        appointments: {
          where: dateFilter ? { date: dateFilter } : {},
          include: {
            service: { select: { name: true } },
            barber:  { select: { name: true } }
          }
        },
        transactions: {
          where: {
            type: 'income',
            ...(dateFilter ? { date: dateFilter } : {})
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    const totalCustomers = customers.length;
    const totalRevenue   = customers.reduce((sum, c) => {
      const fromApts = c.appointments.filter(a => a.status === 'completed').reduce((s, a) => s + Number(a.price), 0);
      const fromTx   = c.transactions.reduce((s, t) => s + Number(t.amount), 0);
      return sum + fromApts + fromTx;
    }, 0);

    const newCustomers = customers.filter(c => {
      if (!startDate || !endDate) return false;
      return c.createdAt >= new Date(startDate as string) && c.createdAt <= new Date(endDate as string);
    }).length;

    const customersList = customers.map(c => {
      const completedApts  = c.appointments.filter(a => a.status === 'completed');
      const revenueFromApts = completedApts.reduce((s, a) => s + Number(a.price), 0);
      const revenueFromTx   = c.transactions.reduce((s, t) => s + Number(t.amount), 0);
      const totalVisits     = completedApts.length + c.transactions.length;
      const totalRev        = revenueFromApts + revenueFromTx;

      // Serviço favorito
      const serviceCount: Record<string, number> = {};
      completedApts.forEach(a => { serviceCount[a.service.name] = (serviceCount[a.service.name] || 0) + 1; });
      const favoriteService = Object.entries(serviceCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';

      // Barbeiro favorito
      const barberCount: Record<string, number> = {};
      completedApts.forEach(a => { barberCount[a.barber.name] = (barberCount[a.barber.name] || 0) + 1; });
      const favoriteBarber = Object.entries(barberCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';

      // Datas
      const allDates = [
        ...completedApts.map(a => a.date.getTime()),
        ...c.transactions.map(t => t.date.getTime())
      ];

      return {
        name:           c.name,
        phone:          c.phone,
        email:          c.email || '-',
        createdAt:      c.createdAt,
        totalVisits,
        totalRevenue:   totalRev,
        averageTicket:  totalVisits > 0 ? totalRev / totalVisits : 0,
        lastVisit:      allDates.length > 0 ? new Date(Math.max(...allDates)) : null,
        firstVisit:     allDates.length > 0 ? new Date(Math.min(...allDates)) : null,
        favoriteService,
        favoriteBarber,
        isNew: startDate && endDate
          ? c.createdAt >= new Date(startDate as string) && c.createdAt <= new Date(endDate as string)
          : false
      };
    }).sort((a, b) => b.totalVisits - a.totalVisits);

    const activeCustomers = customersList.filter(c => c.totalVisits > 0).length;

    const data = {
      summary: {
        totalCustomers,
        activeCustomers,
        newCustomers,
        inactiveCustomers:           totalCustomers - activeCustomers,
        totalRevenue,
        averageRevenuePerCustomer:   totalCustomers > 0 ? totalRevenue / totalCustomers : 0
      },
      customers: customersList,
      filters:   { startDate, endDate }
    };

    if (format === 'pdf') {
      const buf = await generateCustomersPDF(data);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=relatorio-clientes.pdf');
      return res.send(buf);
    }
    if (format === 'excel') {
      const buf = await generateCustomersExcel(data);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=relatorio-clientes.xlsx');
      return res.send(buf);
    }
    return res.json(data);
  } catch (error) {
    console.error('Erro ao gerar relatório de clientes:', error);
    return res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

export default router;