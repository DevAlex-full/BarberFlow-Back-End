import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';
import { PLANS, canChangeToPlan } from '../config/plans';

const router = Router();

// ─── Planos que exigem pagamento via checkout ─────────────────────────────────
// Ativação direta via /subscribe é bloqueada para esses planos.
// A ativação ocorrerá exclusivamente via webhook de pagamento (Asaas — fase futura).
const PAID_PLANS = ['basic', 'standard', 'premium', 'enterprise'];

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

    const isInTrial = barbershop.plan === 'trial';
    const trialDaysLeft = barbershop.trialEndsAt
      ? Math.ceil((new Date(barbershop.trialEndsAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return res.json({
      currentPlan: {
        ...currentPlan,
        id:     barbershop.plan,
        status: barbershop.planStatus
      },
      subscription,
      usage: {
        barbers:   barbershop._count.users,
        customers: barbershop._count.customers
      },
      limits: currentPlan?.features || {},
      trial: {
        isInTrial,
        daysLeft: Math.max(0, trialDaysLeft),
        endsAt:   barbershop.trialEndsAt
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao buscar assinatura' });
  }
});

// ✅ CRIAR/ATUALIZAR ASSINATURA
// ─── SEGURANÇA: planos pagos não podem ser ativados diretamente (Bloco A) ─────
// ─── D6: operações de escrita envolvidas em prisma.$transaction ───────────────
// ANTES: 4 writes sequenciais independentes (updateMany + create + update + create)
//        Se qualquer um falhasse no meio, o banco ficava em estado inconsistente:
//        ex. assinatura anterior cancelada mas nova não criada, ou nova criada mas
//        plano da barbearia não atualizado.
// DEPOIS: todas as 4 operações rodam em uma única transação atômica do PostgreSQL.
//         Ou tudo é confirmado, ou tudo é revertido — sem estado parcial.
router.post('/subscribe', authMiddleware, async (req, res) => {
  try {
    const { planId, paymentMethod, period = 'monthly' } = req.body;

    if (!PLANS[planId as keyof typeof PLANS]) {
      return res.status(400).json({ error: 'Plano inválido' });
    }

    if (!['monthly', 'semiannual', 'annual'].includes(period)) {
      return res.status(400).json({ error: 'Período inválido. Use: monthly, semiannual ou annual' });
    }

    // ✅ BLOQUEIO: planos pagos não podem ser ativados via request direto
    if (PAID_PLANS.includes(planId)) {
      return res.status(402).json({
        error:   'Para assinar um plano pago, utilize o fluxo de pagamento da plataforma.',
        code:    'CHECKOUT_REQUIRED',
        message: 'A ativação de planos pagos é processada automaticamente após a confirmação do pagamento.'
      });
    }

    // A partir deste ponto, apenas planos gratuitos/trial passam
    const plan         = PLANS[planId as keyof typeof PLANS];
    const barbershopId = req.user!.barbershopId!;

    const barbershop = await prisma.barbershop.findUnique({
      where:   { id: barbershopId },
      include: { _count: { select: { users: true, customers: true } } }
    });

    if (!barbershop) {
      return res.status(404).json({ error: 'Barbearia não encontrada' });
    }

    const validation = canChangeToPlan(
      barbershop.plan,
      planId,
      barbershop._count.users,
      barbershop._count.customers
    );

    if (!validation.canChange) {
      return res.status(400).json({ error: validation.reason });
    }

    // ─── Calcular datas do período ─────────────────────────────────────────────
    const currentPeriodStart = new Date();
    const currentPeriodEnd   = new Date();

    if (period === 'monthly') {
      currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
    } else if (period === 'semiannual') {
      currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 6);
    } else if (period === 'annual') {
      currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
    }

    const amount       = plan.price;
    const maxBarbers   = plan.features.maxBarbers   === -1 ? 999    : plan.features.maxBarbers;
    const maxCustomers = plan.features.maxCustomers === -1 ? 999999 : plan.features.maxCustomers;

    // ✅ D6: transação atômica — as 4 operações são confirmadas juntas ou revertidas juntas
    const subscription = await prisma.$transaction(async (tx) => {

      // 1. Cancelar assinatura anterior (se existir)
      await tx.subscription.updateMany({
        where: { barbershopId, status: 'active' },
        data:  { status: 'cancelled', cancelledAt: new Date() }
      });

      // 2. Criar nova assinatura
      const newSubscription = await tx.subscription.create({
        data: {
          barbershopId,
          plan:               planId,
          status:             'active',
          amount,
          paymentMethod:      paymentMethod || 'free',
          currentPeriodStart,
          currentPeriodEnd
        }
      });

      // 3. Atualizar limites e status da barbearia
      await tx.barbershop.update({
        where: { id: barbershopId },
        data: {
          plan:         planId,
          planStatus:   'active',
          planStartedAt: new Date(),
          planExpiresAt: currentPeriodEnd,
          maxBarbers,
          maxCustomers
        }
      });

      // 4. Registrar pagamento vinculado à assinatura recém-criada
      await tx.payment.create({
        data: {
          subscriptionId: newSubscription.id,
          amount,
          status:        'pending',
          paymentMethod: paymentMethod || 'free'
        }
      });

      return newSubscription;
    });

    return res.status(201).json({
      message:      'Assinatura criada com sucesso!',
      subscription,
      plan: {
        id:     planId,
        name:   plan.name,
        price:  plan.price,
        period,
        amount
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

    const cancelledSubscriptions = await prisma.subscription.updateMany({
      where: { barbershopId, status: 'active' },
      data:  { status: 'cancelled', cancelledAt: new Date() }
    });

    if (cancelledSubscriptions.count === 0) {
      return res.status(404).json({ error: 'Nenhuma assinatura ativa encontrada' });
    }

    await prisma.barbershop.update({
      where: { id: barbershopId },
      data:  { planStatus: 'cancelled' }
    });

    return res.json({
      message: 'Assinatura cancelada com sucesso! Você pode usar até o fim do período pago.'
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao cancelar assinatura' });
  }
});

// Validar se pode mudar para um plano
router.post('/validate-change', authMiddleware, async (req, res) => {
  try {
    const { targetPlan } = req.body;
    const barbershopId   = req.user!.barbershopId!;

    const barbershop = await prisma.barbershop.findUnique({
      where:   { id: barbershopId },
      include: { _count: { select: { users: true, customers: true } } }
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
      reason:    validation.reason,
      currentUsage: {
        barbers:   barbershop._count.users,
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