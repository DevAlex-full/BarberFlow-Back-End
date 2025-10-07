import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { clientAuthMiddleware } from '../middlewares/client-auth.middleware';
import { sendEmail, clientAppointmentConfirmationTemplate, clientCancellationTemplate } from '../services/email.service';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const router = Router();
const prisma = new PrismaClient();

// Criar agendamento (cliente autenticado)
router.post('/', clientAuthMiddleware, async (req, res) => {
  try {
    const { barbershopId, barberId, serviceId, date, notes } = req.body;
    const clientId = req.client!.id;

    if (!barbershopId || !barberId || !serviceId || !date) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    const barbershop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
    });

    if (!barbershop || !barbershop.active || barbershop.planStatus !== 'active') {
      return res.status(400).json({ error: 'Barbearia não disponível' });
    }

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
    });

    if (!service || !service.active) {
      return res.status(404).json({ error: 'Serviço não encontrado' });
    }

    const appointmentDate = new Date(date);
    const existingAppointment = await prisma.appointment.findFirst({
      where: {
        barberId,
        date: appointmentDate,
        status: { not: 'cancelled' },
      },
    });

    if (existingAppointment) {
      return res.status(400).json({ error: 'Horário não disponível' });
    }

    const appointment = await prisma.appointment.create({
      data: {
        date: appointmentDate,
        barbershopId,
        barberId,
        serviceId,
        clientId,
        price: service.price,
        notes,
        status: 'scheduled',
      },
      include: {
        barbershop: {
          select: {
            name: true,
            phone: true,
            address: true,
            city: true,
            state: true,
          },
        },
        barber: {
          select: {
            name: true,
            avatar: true,
          },
        },
        service: {
          select: {
            name: true,
            price: true,
            duration: true,
          },
        },
        client: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    // Enviar email de confirmação
    if (appointment.client?.email) {
      try {
        const emailHtml = clientAppointmentConfirmationTemplate({
          clientName: appointment.client.name,
          serviceName: appointment.service.name,
          date: format(new Date(appointment.date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }),
          time: format(new Date(appointment.date), 'HH:mm'),
          barberName: appointment.barber.name,
          barbershopName: appointment.barbershop.name,
          barbershopAddress: `${appointment.barbershop.address}, ${appointment.barbershop.city} - ${appointment.barbershop.state}`,
          barbershopPhone: appointment.barbershop.phone,
          price: appointment.price.toFixed(2),
        });

        await sendEmail({
          to: appointment.client.email,
          subject: `Agendamento Confirmado - ${appointment.barbershop.name}`,
          html: emailHtml,
        });
      } catch (emailError) {
        console.error('Erro ao enviar email de confirmação:', emailError);
        // Não falhar o agendamento se o email falhar
      }
    }

    return res.status(201).json(appointment);
  } catch (error) {
    console.error('Erro ao criar agendamento:', error);
    return res.status(500).json({ error: 'Erro ao criar agendamento' });
  }
});

// ... (outras rotas permanecem iguais até o cancelamento)

// Cancelar agendamento
router.patch('/:id/cancel', clientAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        barbershop: { select: { name: true } },
        service: { select: { name: true } },
        client: { select: { name: true, email: true } },
      },
    });

    if (!appointment || appointment.clientId !== req.client!.id) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }

    if (appointment.status === 'cancelled') {
      return res.status(400).json({ error: 'Agendamento já cancelado' });
    }

    if (appointment.status === 'completed') {
      return res.status(400).json({ error: 'Não é possível cancelar agendamento concluído' });
    }

    const now = new Date();
    const appointmentDate = new Date(appointment.date);
    const hoursDiff = (appointmentDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursDiff < 2) {
      return res.status(400).json({ 
        error: 'Não é possível cancelar com menos de 2 horas de antecedência' 
      });
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    // Enviar email de cancelamento
    if (appointment.client?.email) {
      try {
        const emailHtml = clientCancellationTemplate({
          clientName: appointment.client.name,
          serviceName: appointment.service.name,
          date: format(new Date(appointment.date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }),
          time: format(new Date(appointment.date), 'HH:mm'),
          barbershopName: appointment.barbershop.name,
        });

        await sendEmail({
          to: appointment.client.email,
          subject: `Agendamento Cancelado - ${appointment.barbershop.name}`,
          html: emailHtml,
        });
      } catch (emailError) {
        console.error('Erro ao enviar email de cancelamento:', emailError);
      }
    }

    return res.json(updated);
  } catch (error) {
    console.error('Erro ao cancelar agendamento:', error);
    return res.status(500).json({ error: 'Erro ao cancelar agendamento' });
  }
});

export default router;