import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middlewares/auth.middleware';
import { PLANS } from '../config/plans';

const router = Router();
const prisma = new PrismaClient();

// Listar planos disponíveis
router.get('/plans', async (req, res) => {
  try {
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
        daysLeft: trialDaysLeft,
        endsAt: barbershop.trialEndsAt
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao buscar assinatura' });
  }
});

// Criar/Atualizar assinatura (upgrade/downgrade)
router.post('/subscribe', authMiddleware, async (req, res) => {
  try {
    const { planId, paymentMethod } = req.body;

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

    // Validar se o plano comporta os dados atuais
    if (plan.features.maxBarbers !== -1 && barbershop._count.users > plan.features.maxBarbers) {
      return res.status(400).json({ 
        error: `Este plano suporta apenas ${plan.features.maxBarbers} barbeiro(s). Você tem ${barbershop._count.users}.` 
      });
    }

    if (plan.features.maxCustomers !== -1 && barbershop._count.customers > plan.features.maxCustomers) {
      return res.status(400).json({ 
        error: `Este plano suporta apenas ${plan.features.maxCustomers} clientes. Você tem ${barbershop._count.customers}.` 
      });
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

    // Criar nova assinatura
    const currentPeriodStart = new Date();
    const currentPeriodEnd = new Date();
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

    const subscription = await prisma.subscription.create({
      data: {
        barbershopId,
        plan: planId,
        status: 'active',
        amount: plan.price,
        paymentMethod: paymentMethod || 'pending',
        currentPeriodStart,
        currentPeriodEnd
      }
    });

    // Atualizar barbearia
    await prisma.barbershop.update({
      where: { id: barbershopId },
      data: {
        plan: planId,
        planStatus: 'active',
        planStartedAt: new Date(),
        planExpiresAt: currentPeriodEnd,
        maxBarbers: plan.features.maxBarbers,
        maxCustomers: plan.features.maxCustomers
      }
    });

    // Criar registro de pagamento
    await prisma.payment.create({
      data: {
        subscriptionId: subscription.id,
        amount: plan.price,
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
        price: plan.price
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

    // Mover barbearia para trial expirado (ainda pode usar até acabar o período)
    await prisma.barbershop.update({
      where: { id: barbershopId },
      data: {
        planStatus: 'cancelled'
      }
    });

    return res.json({
      message: 'Assinatura cancelada. Você pode usar até o fim do período pago.'
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao cancelar assinatura' });
  }
});

export default router;