import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middlewares/auth.middleware';
import { preference } from '../config/mercadopago';

const router = Router();
const prisma = new PrismaClient();

const PLAN_PRICES: Record<string, number> = {
  basic: 49.90,
  premium: 99.90,
  enterprise: 199.90
};

router.post('/create-preference', authMiddleware, async (req, res) => {
  try {
    const { plan } = req.body;
    const user = req.user!;

    if (!PLAN_PRICES[plan]) {
      return res.status(400).json({ error: 'Plano inválido' });
    }

    const barbershop = await prisma.barbershop.findUnique({
      where: { id: user.barbershopId! }
    });

    if (!barbershop) {
      return res.status(404).json({ error: 'Barbearia não encontrada' });
    }

    const preferenceData: any = {
      items: [
        {
          title: `Plano ${plan.charAt(0).toUpperCase() + plan.slice(1)} - BarberFlow`,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: PLAN_PRICES[plan]
        }
      ],
      back_urls: {
        success: `${process.env.FRONTEND_URL}/payment-success`,
        failure: `${process.env.FRONTEND_URL}/payment-failure`,
        pending: `${process.env.FRONTEND_URL}/payment-pending`
      },
      auto_return: 'approved',
      metadata: {
        barbershop_id: barbershop.id,
        user_id: user.id,
        plan: plan
      },
      notification_url: `${process.env.BACKEND_URL}/api/payment/webhook`
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

router.post('/webhook', async (req, res) => {
  try {
    const { type, data } = req.body;

    if (type === 'payment') {
      const paymentId = data.id;
      console.log('Pagamento recebido:', paymentId);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Erro no webhook:', error);
    return res.status(500).json({ error: 'Erro ao processar webhook' });
  }
});

router.get('/check-payment/:paymentId', authMiddleware, async (req, res) => {
  try {
    const { paymentId } = req.params;
    return res.json({ status: 'approved' });
  } catch (error) {
    console.error('Erro ao verificar pagamento:', error);
    return res.status(500).json({ error: 'Erro ao verificar pagamento' });
  }
});

export default router;