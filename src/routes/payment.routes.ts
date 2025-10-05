import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middlewares/auth.middleware';
import { preference } from '../config/mercadopago';

const router = Router();
const prisma = new PrismaClient();

// Valores dos planos
const PLAN_PRICES = {
  basic: 49.90,
  premium: 99.90,
  enterprise: 199.90
};

// Criar preferência de pagamento
router.post('/create-preference', authMiddleware, async (req, res) => {
  try {
    const { plan } = req.body;
    const user = req.user!;

    if (!PLAN_PRICES[plan as keyof typeof PLAN_PRICES]) {
      return res.status(400).json({ error: 'Plano inválido' });
    }

    const barbershop = await prisma.barbershop.findUnique({
      where: { id: user.barbershopId! }
    });

    if (!barbershop) {
      return res.status(404).json({ error: 'Barbearia não encontrada' });
    }

    const preferenceData = {
      items: [
        {
          title: `Plano ${plan.charAt(0).toUpperCase() + plan.slice(1)} - BarberFlow`,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: PLAN_PRICES[plan as keyof typeof PLAN_PRICES]
        }
      ],
      back_urls: {
        success: 'http://localhost:3000/payment-success',
        failure: 'http://localhost:3000/payment-failure',
        pending: 'http://localhost:3000/payment-pending'
      },
      metadata: {
        barbershop_id: barbershop.id,
        user_id: user.id,
        plan: plan
      }
    };

    console.log('Criando preferência:', JSON.stringify(preferenceData, null, 2));

    const response = await preference.create({ body: preferenceData });

    return res.json({
      id: response.id,
      init_point: response.init_point
    });
  } catch (error) {
    console.error('Erro ao criar preferência:', error);
    return res.status(500).json({ error: 'Erro ao criar preferência de pagamento' });
  }
});

// Webhook do Mercado Pago
router.post('/webhook', async (req, res) => {
  try {
    const { type, data } = req.body;

    if (type === 'payment') {
      const paymentId = data.id;

      // Aqui você pode buscar os detalhes do pagamento e atualizar o banco
      // const payment = await mercadopago.payment.get(paymentId);

      console.log('Pagamento recebido:', paymentId);

      // Atualizar status da assinatura no banco de dados
      // TODO: Implementar lógica de atualização
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Erro no webhook:', error);
    return res.status(500).json({ error: 'Erro ao processar webhook' });
  }
});

// Verificar status do pagamento
router.get('/check-payment/:paymentId', authMiddleware, async (req, res) => {
  try {
    const { paymentId } = req.params;

    // Buscar no banco de dados o status do pagamento
    // TODO: Implementar busca no banco

    return res.json({ status: 'approved' });
  } catch (error) {
    console.error('Erro ao verificar pagamento:', error);
    return res.status(500).json({ error: 'Erro ao verificar pagamento' });
  }
});

export default router;