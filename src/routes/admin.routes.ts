import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { adminMiddleware } from '../middlewares/admin.middleware';
import { prisma } from '../config/prisma';

const router = Router();

// Aplicar middlewares em todas as rotas
router.use(authMiddleware);
router.use(adminMiddleware);

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — reutilizados em múltiplas queries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna a cláusula Prisma WHERE para barbearias ATIVAS.
 * Ativa = planStatus 'active' E não expirou (trial ou pago).
 */
function whereActive(now: Date) {
  return {
    planStatus: 'active',
    OR: [
      // Trial ainda dentro do prazo
      {
        plan: 'trial',
        trialEndsAt: { gte: now }
      },
      // Plano pago sem data de expiração (ex: gerenciado manualmente)
      {
        plan: { not: 'trial' },
        planExpiresAt: null
      },
      // Plano pago dentro do prazo
      {
        plan: { not: 'trial' },
        planExpiresAt: { gte: now }
      }
    ]
  };
}

/**
 * Retorna a cláusula Prisma WHERE para barbearias EXPIRADAS.
 * Expirada = planStatus 'expired' OU trial passou do trialEndsAt OU planExpiresAt no passado.
 */
function whereExpired(now: Date) {
  return {
    OR: [
      // Já marcada como expired no banco (cron job faz isso)
      { planStatus: 'expired' },
      // Trial não marcado ainda, mas data passou (fallback)
      {
        plan: 'trial',
        planStatus: { not: 'expired' },
        trialEndsAt: { lt: now }
      },
      // Plano pago com data expirada não marcado ainda (fallback)
      {
        plan: { not: 'trial' },
        planStatus: { not: 'expired' },
        planExpiresAt: {
          not: null,
          lt: now
        }
      }
    ]
  };
}

/**
 * Calcula dias restantes e status efetivo para uma barbearia.
 * Considera trialEndsAt para trials e planExpiresAt para pagos.
 */
function computeBarbershopStatus(b: any, now: Date) {
  const isTrialPlan = b.plan === 'trial';

  // Data de referência para expiração
  const expiresAt = isTrialPlan ? b.trialEndsAt : b.planExpiresAt;

  // Dias restantes
  let daysRemaining = 0;
  if (expiresAt) {
    const diffMs = new Date(expiresAt).getTime() - now.getTime();
    daysRemaining = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    daysRemaining = daysRemaining > 0 ? daysRemaining : 0;
  }

  // Status efetivo: prioriza o banco, mas faz fallback pelo tempo
  let effectiveStatus = b.planStatus;
  if (effectiveStatus === 'active') {
    if (expiresAt && new Date(expiresAt) < now) {
      effectiveStatus = 'expired';
    }
  }

  return { daysRemaining, effectiveStatus };
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD — Estatísticas gerais
// ─────────────────────────────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const now = new Date();

    const [
      totalBarbershops,
      activeBarbershops,
      expiredBarbershops,
      totalUsers,
      totalCustomers,
      totalAppointments,
      activeSubscriptions,
      pendingSubscriptions,
      totalRevenue,
      revenueThisMonth,
      newBarbershopsThisMonth
    ] = await Promise.all([
      prisma.barbershop.count(),

      // ✅ Ativas: usa helper que cobre trial + plano pago
      prisma.barbershop.count({ where: whereActive(now) }),

      // ✅ Expiradas: usa helper que cobre trial + plano pago + fallback
      prisma.barbershop.count({ where: whereExpired(now) }),

      prisma.user.count(),
      prisma.customer.count(),
      prisma.appointment.count(),

      prisma.subscription.count({ where: { status: 'active' } }),
      prisma.subscription.count({ where: { status: 'pending' } }),

      prisma.payment.aggregate({
        where: { status: 'paid' },
        _sum: { amount: true }
      }),

      prisma.payment.aggregate({
        where: {
          status: 'paid',
          paidAt: {
            gte: new Date(now.getFullYear(), now.getMonth(), 1)
          }
        },
        _sum: { amount: true }
      }),

      prisma.barbershop.count({
        where: {
          createdAt: {
            gte: new Date(now.getFullYear(), now.getMonth(), 1)
          }
        }
      })
    ]);

    const mrr = await prisma.subscription.aggregate({
      where: { status: 'active', plan: { not: 'trial' } },
      _sum: { amount: true }
    });

    return res.json({
      barbershops: {
        total: totalBarbershops,
        active: activeBarbershops,
        expired: expiredBarbershops,
        newThisMonth: newBarbershopsThisMonth
      },
      users: { total: totalUsers },
      customers: { total: totalCustomers },
      appointments: { total: totalAppointments },
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
    console.error('❌ Erro no dashboard admin:', error);
    return res.status(500).json({
      error: 'Erro ao buscar estatísticas',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// LISTAR TODAS AS BARBEARIAS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/barbershops', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, plan, status } = req.query;
    const now = new Date();

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

    // ✅ Filtro por status — usa helpers para cobrir trial + plano pago
    if (status && status !== 'all') {
      if (status === 'active') {
        // Merge do where já existente com whereActive
        const activeClause = whereActive(now);
        where.planStatus = activeClause.planStatus;
        where.OR = activeClause.OR;
      } else if (status === 'expired') {
        const expiredClause = whereExpired(now);
        // Se já há OR de busca, precisamos combinar com AND
        if (where.OR) {
          where.AND = [{ OR: where.OR }, expiredClause];
          delete where.OR;
        } else {
          where.OR = expiredClause.OR;
        }
      } else {
        // cancelled, suspended — direto no planStatus
        where.planStatus = status;
      }
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
      barbershops: barbershops.map(b => {
        // ✅ Usa helper para calcular dias e status efetivo
        const { daysRemaining, effectiveStatus } = computeBarbershopStatus(b, now);

        return {
          id: b.id,
          name: b.name,
          email: b.email,
          phone: b.phone,
          city: b.city,
          state: b.state,
          plan: b.plan,
          planStatus: effectiveStatus, // ✅ Status real, não só do banco
          planExpiresAt: b.plan === 'trial' ? b.trialEndsAt : b.planExpiresAt, // ✅ Data correta por tipo
          daysRemaining,
          trialEndsAt: b.trialEndsAt,
          totalUsers: b._count.users,
          totalCustomers: b._count.customers,
          totalAppointments: b._count.appointments,
          createdAt: b.createdAt,
          hasActiveSubscription: b.subscriptions.length > 0,
          currentSubscription: b.subscriptions[0] || null
        };
      })
    });
  } catch (error) {
    console.error('❌ Erro ao buscar barbearias:', error);
    return res.status(500).json({
      error: 'Erro ao buscar barbearias',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DETALHES DE UMA BARBEARIA
// ─────────────────────────────────────────────────────────────────────────────
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
    console.error('❌ Erro ao buscar detalhes:', error);
    return res.status(500).json({
      error: 'Erro ao buscar detalhes',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// LISTAR TODOS OS PAGAMENTOS
// ─────────────────────────────────────────────────────────────────────────────
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
                select: { id: true, name: true, email: true }
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
    console.error('❌ Erro ao buscar pagamentos:', error);
    return res.status(500).json({
      error: 'Erro ao buscar pagamentos',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GRÁFICO DE RECEITA (últimos 12 meses)
// ─────────────────────────────────────────────────────────────────────────────
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
          paidAt: { gte: date, lt: nextMonth }
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
    console.error('❌ Erro ao gerar gráfico:', error);
    return res.status(500).json({
      error: 'Erro ao gerar gráfico',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DISTRIBUIÇÃO DE PLANOS
// ─────────────────────────────────────────────────────────────────────────────
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
    console.error('❌ Erro ao buscar distribuição:', error);
    return res.status(500).json({
      error: 'Erro ao buscar distribuição',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ESTATÍSTICAS DE STATUS DE PLANOS (para gráfico de pizza)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/plan-stats', async (req, res) => {
  try {
    const now = new Date();

    const [active, expired, trial, expiringSoon] = await Promise.all([
      // ✅ Ativas
      prisma.barbershop.count({ where: whereActive(now) }),

      // ✅ Expiradas
      prisma.barbershop.count({ where: whereExpired(now) }),

      // Trial (qualquer status)
      prisma.barbershop.count({ where: { plan: 'trial' } }),

      // Expirando em 7 dias (trial ou pago)
      prisma.barbershop.count({
        where: {
          planStatus: 'active',
          OR: [
            // Trial expirando em 7 dias
            {
              plan: 'trial',
              trialEndsAt: {
                gte: now,
                lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
              }
            },
            // Plano pago expirando em 7 dias
            {
              plan: { not: 'trial' },
              planExpiresAt: {
                gte: now,
                lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
              }
            }
          ]
        }
      })
    ]);

    return res.json({ active, expired, trial, expiringSoon });
  } catch (error) {
    console.error('❌ Erro ao buscar estatísticas de planos:', error);
    return res.status(500).json({
      error: 'Erro ao buscar estatísticas',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

export default router;