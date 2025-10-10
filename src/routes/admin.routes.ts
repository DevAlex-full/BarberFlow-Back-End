import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middlewares/auth.middleware';
import { adminMiddleware } from '../middlewares/admin.middleware';

const router = Router();
const prisma = new PrismaClient();

// Aplicar middlewares em todas as rotas
router.use(authMiddleware);
router.use(adminMiddleware);

// ✅ DASHBOARD - Estatísticas gerais
router.get('/dashboard', async (req, res) => {
  try {
    const [
      totalBarbershops,
      activeBarbershops,
      totalUsers,
      totalCustomers,
      totalAppointments,
      activeSubscriptions,
      pendingSubscriptions,
      totalRevenue,
      revenueThisMonth,
      newBarbershopsThisMonth
    ] = await Promise.all([
      // Total de barbearias
      prisma.barbershop.count(),
      
      // Barbearias ativas (com plano ativo)
      prisma.barbershop.count({ where: { planStatus: 'active' } }),
      
      // Total de usuários
      prisma.user.count(),
      
      // Total de clientes
      prisma.customer.count(),
      
      // Total de agendamentos
      prisma.appointment.count(),
      
      // Assinaturas ativas
      prisma.subscription.count({ where: { status: 'active' } }),
      
      // Assinaturas pendentes
      prisma.subscription.count({ where: { status: 'pending' } }),
      
      // Receita total
      prisma.payment.aggregate({
        where: { status: 'paid' },
        _sum: { amount: true }
      }),
      
      // Receita deste mês
      prisma.payment.aggregate({
        where: {
          status: 'paid',
          paidAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          }
        },
        _sum: { amount: true }
      }),
      
      // Novas barbearias este mês
      prisma.barbershop.count({
        where: {
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          }
        }
      })
    ]);

    // MRR (Monthly Recurring Revenue)
    const mrr = await prisma.subscription.aggregate({
      where: { status: 'active', plan: { not: 'trial' } },
      _sum: { amount: true }
    });

    return res.json({
      barbershops: {
        total: totalBarbershops,
        active: activeBarbershops,
        newThisMonth: newBarbershopsThisMonth
      },
      users: {
        total: totalUsers
      },
      customers: {
        total: totalCustomers
      },
      appointments: {
        total: totalAppointments
      },
      subscriptions: {
        active: activeSubscriptions,
        pending: pendingSubscriptions
      },
      revenue: {
        total: totalRevenue._sum.amount || 0,
        thisMonth: revenueThisMonth._sum.amount || 0,
        mrr: mrr._sum.amount || 0
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

// ✅ LISTAR TODAS AS BARBEARIAS
router.get('/barbershops', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, plan, status } = req.query;

    const where: any = {};

    // Filtro de busca
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    // Filtro por plano
    if (plan && plan !== 'all') {
      where.plan = plan;
    }

    // Filtro por status
    if (status && status !== 'all') {
      where.planStatus = status;
    }

    const [total, barbershops] = await Promise.all([
      prisma.barbershop.count({ where }),
      prisma.barbershop.findMany({
        where,
        include: {
          _count: {
            select: {
              users: true,
              customers: true,
              appointments: true
            }
          },
          subscriptions: {
            where: { status: 'active' },
            take: 1,
            orderBy: { createdAt: 'desc' }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit)
      })
    ]);

    return res.json({
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
      barbershops: barbershops.map(b => ({
        id: b.id,
        name: b.name,
        email: b.email,
        phone: b.phone,
        city: b.city,
        state: b.state,
        plan: b.plan,
        planStatus: b.planStatus,
        planExpiresAt: b.planExpiresAt,
        trialEndsAt: b.trialEndsAt,
        totalUsers: b._count.users,
        totalCustomers: b._count.customers,
        totalAppointments: b._count.appointments,
        createdAt: b.createdAt,
        hasActiveSubscription: b.subscriptions.length > 0,
        currentSubscription: b.subscriptions[0] || null
      }))
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao buscar barbearias' });
  }
});

// ✅ DETALHES DE UMA BARBEARIA
router.get('/barbershops/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const barbershop = await prisma.barbershop.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            active: true,
            createdAt: true
          }
        },
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          include: {
            payments: {
              orderBy: { createdAt: 'desc' }
            }
          }
        },
        _count: {
          select: {
            customers: true,
            appointments: true,
            services: true
          }
        }
      }
    });

    if (!barbershop) {
      return res.status(404).json({ error: 'Barbearia não encontrada' });
    }

    return res.json(barbershop);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao buscar detalhes' });
  }
});

// ✅ LISTAR TODOS OS PAGAMENTOS
router.get('/payments', async (req, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query;

    const where: any = {};

    if (status && status !== 'all') {
      where.status = status;
    }

    const [total, payments] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        include: {
          subscription: {
            include: {
              barbershop: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit)
      })
    ]);

    return res.json({
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
      payments: payments.map(p => ({
        id: p.id,
        amount: p.amount,
        status: p.status,
        paymentMethod: p.paymentMethod,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
        barbershop: p.subscription.barbershop,
        plan: p.subscription.plan
      }))
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao buscar pagamentos' });
  }
});

// ✅ GRÁFICO DE RECEITA (últimos 12 meses)
router.get('/revenue-chart', async (req, res) => {
  try {
    const months = [];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

      const revenue = await prisma.payment.aggregate({
        where: {
          status: 'paid',
          paidAt: {
            gte: date,
            lt: nextMonth
          }
        },
        _sum: { amount: true },
        _count: true
      });

      months.push({
        month: date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
        revenue: revenue._sum.amount || 0,
        transactions: revenue._count
      });
    }

    return res.json(months);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao gerar gráfico' });
  }
});

// ✅ DISTRIBUIÇÃO DE PLANOS
router.get('/plans-distribution', async (req, res) => {
  try {
    const distribution = await prisma.barbershop.groupBy({
      by: ['plan'],
      _count: true
    });

    return res.json(
      distribution.map(d => ({
        plan: d.plan,
        count: d._count
      }))
    );
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao buscar distribuição' });
  }
});

export default router;