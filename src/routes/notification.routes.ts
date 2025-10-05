import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middlewares/auth.middleware';
import { sendEmail, appointmentReminderTemplate, appointmentConfirmationTemplate } from '../services/email.service';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const router = Router();
const prisma = new PrismaClient();

// Enviar lembrete manual
router.post('/send-reminder/:appointmentId', authMiddleware, async (req, res) => {
  try {
    const { appointmentId } = req.params;

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        customer: true,
        service: true,
        barber: true,
        barbershop: true
      }
    });

    if (!appointment) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }

    if (!appointment.customer.email) {
      return res.status(400).json({ error: 'Cliente não possui email cadastrado' });
    }

    const emailData = {
      customerName: appointment.customer.name,
      serviceName: appointment.service.name,
      date: format(new Date(appointment.date), "dd 'de' MMMM", { locale: ptBR }),
      time: format(new Date(appointment.date), 'HH:mm'),
      barberName: appointment.barber.name,
      barbershopName: appointment.barbershop.name
    };

    await sendEmail({
      to: appointment.customer.email,
      subject: '🔔 Lembrete: Seu agendamento é amanhã!',
      html: appointmentReminderTemplate(emailData)
    });

    return res.json({ message: 'Lembrete enviado com sucesso!' });
  } catch (error) {
    console.error('Erro ao enviar lembrete:', error);
    return res.status(500).json({ error: 'Erro ao enviar lembrete' });
  }
});

// Enviar confirmação de agendamento
router.post('/send-confirmation/:appointmentId', authMiddleware, async (req, res) => {
  try {
    const { appointmentId } = req.params;

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        customer: true,
        service: true,
        barber: true,
        barbershop: true
      }
    });

    if (!appointment) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }

    if (!appointment.customer.email) {
      return res.status(400).json({ error: 'Cliente não possui email cadastrado' });
    }

    const emailData = {
      customerName: appointment.customer.name,
      serviceName: appointment.service.name,
      date: format(new Date(appointment.date), "dd 'de' MMMM", { locale: ptBR }),
      time: format(new Date(appointment.date), 'HH:mm'),
      barberName: appointment.barber.name,
      barbershopName: appointment.barbershop.name,
      price: appointment.price.toString()
    };

    await sendEmail({
      to: appointment.customer.email,
      subject: '✅ Agendamento Confirmado!',
      html: appointmentConfirmationTemplate(emailData)
    });

    return res.json({ message: 'Confirmação enviada com sucesso!' });
  } catch (error) {
    console.error('Erro ao enviar confirmação:', error);
    return res.status(500).json({ error: 'Erro ao enviar confirmação' });
  }
});

export default router;