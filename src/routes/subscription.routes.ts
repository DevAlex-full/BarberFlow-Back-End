import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';
import { PLANS, canChangeToPlan } from '../config/plans';

const router = Router();

// Listar planos disponíveis
router.get('/plans', async (req, res) => {
  try {
    // ✅ RETORNAR TODOS OS PLANOS INCLUINDO O NOVO 'STANDARD'
    return res.json(PLANS);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao buscar planos' });
  }
});

// Buscar assinatura atual
router.get('/current', authMiddleware, async (req, res) => {
  try {
    const barbershop = await prisma.barbershop.findUnique({
      where: { id: req.user!.barbershopId! },
      include: {
        subscriptions: {
          where: { status: 'active' },
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        _count: {
          select: {
            users: true,
            customers: true
          }
        }
      }
    });

    if (!barbershop) {
      return res.status(404).json({ error: 'Barbearia não encontrada' });
    }

    const currentPlan = PLANS[barbershop.plan as keyof typeof PLANS];
    const subscription = barbershop.subscriptions[0] || null;

    // Verificar se está em trial
    const isInTrial = barbershop.plan === 'trial';
    const trialDaysLeft = barbershop.trialEndsAt 
      ? Math.ceil((new Date(barbershop.trialEndsAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return res.json({
      currentPlan: {
        ...currentPlan,
        id: barbershop.plan,
        status: barbershop.planStatus
      },
      subscription,
      usage: {
        barbers: barbershop._count.users,
        customers: barbershop._count.customers
      },
      limits: currentPlan?.features || {},
      trial: {
        isInTrial,
        daysLeft: Math.max(0, trialDaysLeft),
        endsAt: barbershop.trialEndsAt
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao buscar assinatura' });
  }
});

// ✅ CRIAR/ATUALIZAR ASSINATURA ATUALIZADO
router.post('/subscribe', authMiddleware, async (req, res) => {
  try {
    const { planId, paymentMethod, period = 'monthly' } = req.body;

    if (!PLANS[planId as keyof typeof PLANS]) {
      return res.status(400).json({ error: 'Plano inválido' });
    }

    const plan = PLANS[planId as keyof typeof PLANS];
    const barbershopId = req.user!.barbershopId!;

    // Verificar limites antes de fazer upgrade
    const barbershop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      include: {
        _count: {
          select: { users: true, customers: true }
        }
      }
    });

    if (!barbershop) {
      return res.status(404).json({ error: 'Barbearia não encontrada' });
    }

    // ✅ USAR NOVA FUNÇÃO DE VALIDAÇÃO
    const validation = canChangeToPlan(
      barbershop.plan, 
      planId, 
      barbershop._count.users, 
      barbershop._count.customers
    );

    if (!validation.canChange) {
      return res.status(400).json({ error: validation.reason });
    }

    // Cancelar assinatura anterior se existir
    await prisma.subscription.updateMany({
      where: {
        barbershopId,
        status: 'active'
      },
      data: {
        status: 'cancelled',
        cancelledAt: new Date()
      }
    });

    // ✅ CALCULAR DATAS COM BASE NO PERÍODO
    const currentPeriodStart = new Date();
    const currentPeriodEnd = new Date();
    
    if (period === 'monthly') {
      currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
    } else if (period === 'semiannual') {
      currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 6);
    } else if (period === 'annual') {
      currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
    }

    // ✅ CALCULAR VALOR COM BASE NO PERÍODO
    let amount = plan.price;
    if (period === 'semiannual') {
      amount = plan.price * 6 * 0.85; // 15% desconto
    } else if (period === 'annual') {
      amount = plan.price * 12 * 0.70; // 30% desconto
    }

    // Criar nova assinatura
    const subscription = await prisma.subscription.create({
      data: {
        barbershopId,
        plan: planId,
        status: 'active',
        amount: amount,
        paymentMethod: paymentMethod || 'pending',
        currentPeriodStart,
        currentPeriodEnd
      }
    });

    // ✅ ATUALIZAR LIMITES DA BARBEARIA
    const maxBarbers = plan.features.maxBarbers === -1 ? 999 : plan.features.maxBarbers;
    const maxCustomers = plan.features.maxCustomers === -1 ? 999999 : plan.features.maxCustomers;

    await prisma.barbershop.update({
      where: { id: barbershopId },
      data: {
        plan: planId,
        planStatus: 'active',
        planStartedAt: new Date(),
        planExpiresAt: currentPeriodEnd,
        maxBarbers: maxBarbers,
        maxCustomers: maxCustomers
      }
    });

    // Criar registro de pagamento
    await prisma.payment.create({
      data: {
        subscriptionId: subscription.id,
        amount: amount,
        status: 'pending',
        paymentMethod: paymentMethod || 'pending'
      }
    });

    return res.status(201).json({
      message: 'Assinatura criada com sucesso!',
      subscription,
      plan: {
        id: planId,
        name: plan.name,
        price: plan.price,
        period: period,
        amount: amount
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao criar assinatura' });
  }
});

// Cancelar assinatura
router.post('/cancel', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;

    // Cancelar assinatura ativa
    const cancelledSubscriptions = await prisma.subscription.updateMany({
      where: {
        barbershopId,
        status: 'active'
      },
      data: {
        status: 'cancelled',
        cancelledAt: new Date()
      }
    });

    if (cancelledSubscriptions.count === 0) {
      return res.status(404).json({ error: 'Nenhuma assinatura ativa encontrada' });
    }

    // Mover barbearia para trial expirado (ainda pode usar até acabar o período)
    await prisma.barbershop.update({
      where: { id: barbershopId },
      data: {
        planStatus: 'cancelled'
      }
    });

    return res.json({
      message: 'Assinatura cancelada com sucesso! Você pode usar até o fim do período pago.'
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao cancelar assinatura' });
  }
});

// ✅ NOVO: Validar se pode mudar para um plano
router.post('/validate-change', authMiddleware, async (req, res) => {
  try {
    const { targetPlan } = req.body;
    const barbershopId = req.user!.barbershopId!;

    const barbershop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      include: {
        _count: {
          select: { users: true, customers: true }
        }
      }
    });

    if (!barbershop) {
      return res.status(404).json({ error: 'Barbearia não encontrada' });
    }

    const validation = canChangeToPlan(
      barbershop.plan,
      targetPlan,
      barbershop._count.users,
      barbershop._count.customers
    );

    return res.json({
      canChange: validation.canChange,
      reason: validation.reason,
      currentUsage: {
        barbers: barbershop._count.users,
        customers: barbershop._count.customers
      },
      targetLimits: PLANS[targetPlan as keyof typeof PLANS]?.features
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao validar mudança de plano' });
  }
});

export default router;