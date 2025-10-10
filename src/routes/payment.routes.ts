import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middlewares/auth.middleware';
import { preference } from '../config/mercadopago';
import { PLANS } from '../config/plans';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { sendPaymentConfirmationEmail } from '../services/email.service';

const router = Router();
const prisma = new PrismaClient();

// Cliente Mercado Pago para buscar pagamentos
const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
  options: { timeout: 5000 }
});
const paymentClient = new Payment(mpClient);

// ✅ VALORES ATUALIZADOS DOS PLANOS
const PLAN_PRICES: Record<string, { monthly: number; semiannual: number; annual: number }> = {
  basic: {
    monthly: 34.90,
    semiannual: 177.99,
    annual: 418.80
  },
  standard: {
    monthly: 48.90,
    semiannual: 249.51,
    annual: 586.80
  },
  premium: {
    monthly: 75.60,
    semiannual: 385.56,
    annual: 907.20
  },
  enterprise: {
    monthly: 102.80,
    semiannual: 524.28,
    annual: 1233.60
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

    const price = PLAN_PRICES[plan][period as 'monthly' | 'semiannual' | 'annual'];
    const planConfig = PLANS[plan as keyof typeof PLANS];
    
    let discountPercentage = 0;
    if (period === 'semiannual') discountPercentage = 15;
    if (period === 'annual') discountPercentage = 30;

    const periodNames: Record<string, string> = {
      monthly: 'Mensal',
      semiannual: 'Semestral',
      annual: 'Anual'
    };

    const preferenceData: any = {
      items: [
        {
          title: `${planConfig.name} - ${periodNames[period]}`,
          description: `BarberFlow - ${planConfig.description}${discountPercentage > 0 ? ` (${discountPercentage}% OFF)` : ''}`,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: price
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
        barbershop_name: barbershop.name,
        barbershop_email: barbershop.email,
        user_id: user.id,
        plan: plan,
        period: period,
        price: price.toString(),
        discount: discountPercentage.toString()
      },
      notification_url: `${process.env.BACKEND_URL}/api/payment/webhook`,
      statement_descriptor: 'BARBERFLOW',
      external_reference: `${barbershop.id}-${plan}-${Date.now()}`
    };

    console.log('📦 Criando preferência Mercado Pago:', {
      barbershop: barbershop.name,
      plan: plan,
      period: period,
      price: price
    });

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
  } catch (error: any) {
    console.error('❌ Erro ao criar preferência:', error);
    return res.status(500).json({ 
      error: 'Erro ao criar preferência de pagamento',
      details: error.message 
    });
  }
});

// ✅ WEBHOOK DO MERCADO PAGO (PRINCIPAL)
router.post('/webhook', async (req, res) => {
  try {
    console.log('🔔 Webhook recebido do Mercado Pago');
    console.log('📋 Headers:', req.headers);
    console.log('📦 Body:', JSON.stringify(req.body, null, 2));

    const { type, action, data } = req.body;

    // Responder imediatamente para o MP
    res.status(200).send('OK');

    // Processar apenas notificações de pagamento
    if (type === 'payment' || action === 'payment.created' || action === 'payment.updated') {
      const paymentId = data?.id;

      if (!paymentId) {
        console.log('⚠️ Webhook sem ID de pagamento');
        return;
      }

      console.log(`💳 Processando pagamento ID: ${paymentId}`);

      // Aguardar um pouco antes de buscar
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Buscar detalhes do pagamento no Mercado Pago
      const payment = await paymentClient.get({ id: paymentId });

      console.log('💰 Detalhes do pagamento:', {
        id: payment.id,
        status: payment.status,
        status_detail: payment.status_detail,
        transaction_amount: payment.transaction_amount,
        external_reference: payment.external_reference,
        metadata: payment.metadata
      });

      // Extrair metadados
      const metadata = payment.metadata as any;
      const barbershopId = metadata?.barbershop_id;
      const planId = metadata?.plan;
      const period = metadata?.period || 'monthly';
      const price = parseFloat(metadata?.price || '0');

      if (!barbershopId || !planId) {
        console.log('⚠️ Webhook sem barbershop_id ou plan nos metadados');
        return;
      }

      // Buscar barbearia
      const barbershop = await prisma.barbershop.findUnique({
        where: { id: barbershopId }
      });

      if (!barbershop) {
        console.log(`⚠️ Barbearia ${barbershopId} não encontrada`);
        return;
      }

      // Processar baseado no status
      if (payment.status === 'approved') {
        console.log('✅ Pagamento APROVADO - Ativando plano');

        // Cancelar assinaturas ativas anteriores
        await prisma.subscription.updateMany({
          where: {
            barbershopId: barbershopId,
            status: 'active'
          },
          data: {
            status: 'cancelled',
            cancelledAt: new Date()
          }
        });

        // Calcular datas
        const currentPeriodStart = new Date();
        const currentPeriodEnd = new Date();
        
        if (period === 'annual') {
          currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
        } else if (period === 'semiannual') {
          currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 6);
        } else {
          currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
        }

        // Criar nova assinatura ativa
        const subscription = await prisma.subscription.create({
          data: {
            barbershopId: barbershopId,
            plan: planId,
            status: 'active',
            amount: price,
            paymentMethod: payment.payment_type_id || 'mercadopago',
            externalId: payment.id?.toString(),
            currentPeriodStart,
            currentPeriodEnd
          }
        });

        // Atualizar limites da barbearia
        const planConfig = PLANS[planId as keyof typeof PLANS];
        const maxBarbers = planConfig.features.maxBarbers === -1 ? 999 : planConfig.features.maxBarbers;
        const maxCustomers = planConfig.features.maxCustomers === -1 ? 999999 : planConfig.features.maxCustomers;

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
            amount: price,
            status: 'paid',
            paymentMethod: payment.payment_type_id || 'mercadopago',
            externalId: payment.id?.toString(),
            paidAt: new Date()
          }
        });

        console.log('✅ Assinatura ativada com sucesso!');

        // Enviar email de confirmação
        try {
          await sendPaymentConfirmationEmail({
            to: barbershop.email,
            barbershopName: barbershop.name,
            planName: planConfig.name,
            amount: price,
            period: period,
            expiresAt: currentPeriodEnd
          });
          console.log('📧 Email de confirmação enviado');
        } catch (emailError) {
          console.error('❌ Erro ao enviar email:', emailError);
        }

      } else if (payment.status === 'pending') {
        console.log('⏳ Pagamento PENDENTE');

      } else if (payment.status === 'rejected' || payment.status === 'cancelled') {
        console.log('❌ Pagamento REJEITADO/CANCELADO');
      }

    } else {
      console.log(`ℹ️ Tipo de notificação ignorado: ${type || action}`);
    }

  } catch (error: any) {
    console.error('❌ Erro no webhook:', error);
  }
});

// ✅ VERIFICAR STATUS DO PAGAMENTO
router.get('/check-payment/:paymentId', authMiddleware, async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    console.log(`🔍 Verificando pagamento: ${paymentId}`);
    
    const payment = await paymentClient.get({ id: paymentId });
    
    return res.json({ 
      status: payment.status,
      status_detail: payment.status_detail,
      transaction_amount: payment.transaction_amount,
      payment_type: payment.payment_type_id,
      date_approved: payment.date_approved
    });
  } catch (error: any) {
    console.error('❌ Erro ao verificar pagamento:', error);
    return res.status(500).json({ 
      error: 'Erro ao verificar pagamento',
      details: error.message 
    });
  }
});

// ✅ CALCULAR PREÇO
router.post('/calculate-price', async (req, res) => {
  try {
    const { plan, period = 'monthly' } = req.body;

    if (!PLAN_PRICES[plan]) {
      return res.status(400).json({ error: 'Plano inválido' });
    }

    const prices = PLAN_PRICES[plan];
    const planConfig = PLANS[plan as keyof typeof PLANS];

    let discountPercentage = 0;
    if (period === 'semiannual') discountPercentage = 15;
    if (period === 'annual') discountPercentage = 30;

    const finalPrice = prices[period as 'monthly' | 'semiannual' | 'annual'];
    const monthlyPrice = prices.monthly;
    const totalMonths = period === 'annual' ? 12 : period === 'semiannual' ? 6 : 1;
    const fullPrice = monthlyPrice * totalMonths;
    const savings = fullPrice - finalPrice;

    return res.json({
      plan: {
        id: plan,
        name: planConfig.name
      },
      period,
      price: finalPrice,
      monthlyPrice: monthlyPrice,
      fullPrice: fullPrice,
      discount: discountPercentage,
      savings: savings,
      perMonth: (finalPrice / totalMonths).toFixed(2)
    });
  } catch (error: any) {
    console.error('❌ Erro ao calcular preço:', error);
    return res.status(500).json({ 
      error: 'Erro ao calcular preço',
      details: error.message 
    });
  }
});

export default router;