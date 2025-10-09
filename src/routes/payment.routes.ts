import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middlewares/auth.middleware';
import { preference } from '../config/mercadopago';
import { PLANS } from '../config/plans';

const router = Router();
const prisma = new PrismaClient();

// ✅ VALORES ATUALIZADOS DOS PLANOS
const PLAN_PRICES: Record<string, { monthly: number; semiannual: number; annual: number }> = {
  basic: {
    monthly: 34.90,
    semiannual: 177.99, // 34.90 * 6 * 0.85 (15% desconto)
    annual: 418.80 // 30% desconto
  },
  standard: {
    monthly: 48.90,
    semiannual: 249.51, // 48.90 * 6 * 0.85 (15% desconto)
    annual: 586.80 // 30% desconto
  },
  premium: {
    monthly: 75.60,
    semiannual: 385.56, // 75.60 * 6 * 0.85 (15% desconto)
    annual: 907.20 // 30% desconto
  },
  enterprise: {
    monthly: 102.80,
    semiannual: 524.28, // 102.80 * 6 * 0.85 (15% desconto)
    annual: 1233.60 // 30% desconto
  }
};

// ✅ CRIAR PREFERÊNCIA DE PAGAMENTO
router.post('/create-preference', authMiddleware, async (req, res) => {
  try {
    const { plan, period = 'monthly' } = req.body;
    const user = req.user!;

    if (!PLAN_PRICES[plan]) {
      return res.status(400).json({ error: 'Plano inválido' });
    }

    if (!['monthly', 'semiannual', 'annual'].includes(period)) {
      return res.status(400).json({ error: 'Período inválido' });
    }

    const barbershop = await prisma.barbershop.findUnique({
      where: { id: user.barbershopId! }
    });

    if (!barbershop) {
      return res.status(404).json({ error: 'Barbearia não encontrada' });
    }

    // ✅ CALCULAR PREÇO COM BASE NO PERÍODO
    const price = PLAN_PRICES[plan][period as keyof typeof PLAN_PRICES[typeof plan]];
    const planConfig = PLANS[plan as keyof typeof PLANS];
    
    // ✅ CALCULAR DESCONTO
    let discountPercentage = 0;
    if (period === 'semiannual') discountPercentage = 15;
    if (period === 'annual') discountPercentage = 30;

    // ✅ NOME DO PLANO COM PERÍODO
    const periodNames = {
      monthly: 'Mensal',
      semiannual: 'Semestral',
      annual: 'Anual'
    };

    const preferenceData: any = {
      items: [
        {
          title: `${planConfig.name} - ${periodNames[period as keyof typeof periodNames]}`,
          description: `Assinatura ${periodNames[period as keyof typeof periodNames]} do ${planConfig.name}${discountPercentage > 0 ? ` (${discountPercentage}% OFF)` : ''}`,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: Number(price.toFixed(2)) // ✅ GARANTIR 2 casas decimais
        }
      ],
      back_urls: {
        success: `${process.env.FRONTEND_URL}/payment-success?plan=${plan}&period=${period}`,
        failure: `${process.env.FRONTEND_URL}/payment-failure`,
        pending: `${process.env.FRONTEND_URL}/payment-pending`
      },
      auto_return: 'approved',
      metadata: {
        barbershop_id: barbershop.id,
        user_id: user.id,
        plan: plan,
        period: period,
        price: price
      },
      notification_url: `${process.env.BACKEND_URL}/api/payment/webhook`
    };

    console.log('📦 Criando preferência:', JSON.stringify(preferenceData, null, 2));

    const response = await preference.create({ body: preferenceData });

    console.log('✅ Preferência criada:', response.id);

    return res.json({
      id: response.id,
      init_point: response.init_point,
      plan: {
        id: plan,
        name: planConfig.name,
        period: period,
        price: price,
        discount: discountPercentage
      }
    });
  } catch (error) {
    console.error('❌ Erro ao criar preferência:', error);
    return res.status(500).json({ error: 'Erro ao criar preferência de pagamento' });
  }
});

// ✅ WEBHOOK PARA PROCESSAR PAGAMENTOS
router.post('/webhook', async (req, res) => {
  try {
    const { type, data, action } = req.body;

    console.log('🔔 Webhook recebido:', JSON.stringify({ type, action, data }, null, 2));

    if (type === 'payment') {
      const paymentId = data.id;
      
      console.log('💳 Pagamento ID recebido:', paymentId);

      // ⚠️ IMPORTANTE: Você deve implementar a busca real no Mercado Pago
      // Descomente o código abaixo quando tiver o SDK instalado:
      
      /*
      import { MercadoPagoConfig, Payment } from 'mercadopago';
      
      const client = new MercadoPagoConfig({ 
        accessToken: process.env.MP_ACCESS_TOKEN! 
      });
      const paymentClient = new Payment(client);
      
      const paymentInfo = await paymentClient.get({ id: paymentId });
      
      console.log('💰 Status do pagamento:', paymentInfo.status);

      if (paymentInfo.status === 'approved') {
        const metadata = paymentInfo.metadata as any;
        const { barbershop_id, plan, period, user_id } = metadata;

        // Calcular data de expiração
        const expiresAt = new Date();
        if (period === 'monthly') {
          expiresAt.setMonth(expiresAt.getMonth() + 1);
        } else if (period === 'semiannual') {
          expiresAt.setMonth(expiresAt.getMonth() + 6);
        } else if (period === 'annual') {
          expiresAt.setFullYear(expiresAt.getFullYear() + 1);
        }

        // Criar nova assinatura
        await prisma.subscription.create({
          data: {
            barbershopId: barbershop_id,
            plan: plan,
            status: 'active',
            amount: paymentInfo.transaction_amount,
            paymentMethod: 'mercado_pago',
            currentPeriodStart: new Date(),
            currentPeriodEnd: expiresAt
          }
        });

        // Atualizar barbearia
        const planConfig = PLANS[plan as keyof typeof PLANS];
        const maxBarbers = planConfig.features.maxBarbers === -1 ? 999 : planConfig.features.maxBarbers;
        const maxCustomers = planConfig.features.maxCustomers === -1 ? 999999 : planConfig.features.maxCustomers;

        await prisma.barbershop.update({
          where: { id: barbershop_id },
          data: {
            plan: plan,
            planStatus: 'active',
            planStartedAt: new Date(),
            planExpiresAt: expiresAt,
            maxBarbers: maxBarbers,
            maxCustomers: maxCustomers
          }
        });

        // Criar registro de pagamento
        await prisma.payment.create({
          data: {
            subscriptionId: subscription.id,
            amount: paymentInfo.transaction_amount,
            status: 'completed',
            paymentMethod: 'mercado_pago',
            externalId: paymentId
          }
        });

        console.log('✅ Assinatura ativada para barbearia:', barbershop_id);
      } else if (paymentInfo.status === 'rejected') {
        console.log('❌ Pagamento rejeitado:', paymentId);
      }
      */

      // ⚠️ REMOVER DEPOIS: Apenas para testes
      console.log('⚠️ WEBHOOK EM MODO DE TESTE - Implemente a lógica real acima');
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    return res.status(500).json({ error: 'Erro ao processar webhook' });
  }
});

// ✅ VERIFICAR STATUS DO PAGAMENTO
router.get('/check-payment/:paymentId', authMiddleware, async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    // ⚠️ IMPLEMENTAR: Buscar status real no Mercado Pago
    /*
    const paymentInfo = await paymentClient.get({ id: paymentId });
    
    return res.json({ 
      status: paymentInfo.status,
      statusDetail: paymentInfo.status_detail,
      amount: paymentInfo.transaction_amount
    });
    */
    
    // ⚠️ REMOVER DEPOIS: Apenas para testes
    return res.json({ 
      status: 'pending',
      message: 'Pagamento em processamento'
    });
  } catch (error) {
    console.error('❌ Erro ao verificar pagamento:', error);
    return res.status(500).json({ error: 'Erro ao verificar pagamento' });
  }
});

// ✅ CALCULAR PREÇO
router.post('/calculate-price', async (req, res) => {
  try {
    const { plan, period = 'monthly' } = req.body;

    if (!PLAN_PRICES[plan]) {
      return res.status(400).json({ error: 'Plano inválido' });
    }

    if (!['monthly', 'semiannual', 'annual'].includes(period)) {
      return res.status(400).json({ error: 'Período inválido' });
    }

    const prices = PLAN_PRICES[plan];
    const planConfig = PLANS[plan as keyof typeof PLANS];

    let discountPercentage = 0;
    if (period === 'semiannual') discountPercentage = 15;
    if (period === 'annual') discountPercentage = 30;

    const selectedPrice = prices[period as keyof typeof prices];
    const monthlyEquivalent = period === 'monthly' 
      ? selectedPrice 
      : selectedPrice / (period === 'semiannual' ? 6 : 12);

    const fullPriceWithoutDiscount = prices.monthly * (period === 'monthly' ? 1 : period === 'semiannual' ? 6 : 12);
    const savings = fullPriceWithoutDiscount - selectedPrice;

    return res.json({
      plan: {
        id: plan,
        name: planConfig.name
      },
      period,
      price: Number(selectedPrice.toFixed(2)),
      monthlyPrice: Number(prices.monthly.toFixed(2)),
      monthlyEquivalent: Number(monthlyEquivalent.toFixed(2)),
      discount: discountPercentage,
      savings: Number(savings.toFixed(2))
    });
  } catch (error) {
    console.error('❌ Erro ao calcular preço:', error);
    return res.status(500).json({ error: 'Erro ao calcular preço' });
  }
});

export default router;