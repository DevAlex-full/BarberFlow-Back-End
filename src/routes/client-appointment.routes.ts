import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { clientAuthMiddleware } from '../middlewares/client-auth.middleware';

const router = Router();
const prisma = new PrismaClient();

// Criar agendamento (cliente autenticado)
router.post('/', clientAuthMiddleware, async (req, res) => {
  try {
    const { barbershopId, barberId, serviceId, date, notes } = req.body;
    const clientId = req.client!.id;

    // Validações
    if (!barbershopId || !barberId || !serviceId || !date) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    // Verificar se a barbearia está ativa
    const barbershop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
    });

    if (!barbershop || !barbershop.active || barbershop.planStatus !== 'active') {
      return res.status(400).json({ error: 'Barbearia não disponível' });
    }

    // Buscar serviço e preço
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
    });

    if (!service || !service.active) {
      return res.status(404).json({ error: 'Serviço não encontrado' });
    }

    // Verificar se o horário está disponível
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

    // Criar agendamento
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
      },
    });

    return res.status(201).json(appointment);
  } catch (error) {
    console.error('Erro ao criar agendamento:', error);
    return res.status(500).json({ error: 'Erro ao criar agendamento' });
  }
});

// Listar agendamentos do cliente
router.get('/my-appointments', clientAuthMiddleware, async (req, res) => {
  try {
    const { status } = req.query;

    const where: any = {
      clientId: req.client!.id,
    };

    if (status) {
      where.status = status;
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        barbershop: {
          select: {
            name: true,
            phone: true,
            address: true,
            city: true,
            state: true,
            logo: true,
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
      },
      orderBy: { date: 'desc' },
    });

    return res.json(appointments);
  } catch (error) {
    console.error('Erro ao buscar agendamentos:', error);
    return res.status(500).json({ error: 'Erro ao buscar agendamentos' });
  }
});

// Buscar detalhes de um agendamento
router.get('/:id', clientAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        barbershop: {
          select: {
            name: true,
            phone: true,
            address: true,
            city: true,
            state: true,
            logo: true,
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
            description: true,
            price: true,
            duration: true,
          },
        },
      },
    });

    if (!appointment || appointment.clientId !== req.client!.id) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }

    return res.json(appointment);
  } catch (error) {
    console.error('Erro ao buscar agendamento:', error);
    return res.status(500).json({ error: 'Erro ao buscar agendamento' });
  }
});

// Cancelar agendamento
router.patch('/:id/cancel', clientAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const appointment = await prisma.appointment.findUnique({
      where: { id },
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

    // Verificar se falta menos de 2 horas para o agendamento
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
      include: {
        barbershop: { select: { name: true } },
        service: { select: { name: true } },
      },
    });

    return res.json(updated);
  } catch (error) {
    console.error('Erro ao cancelar agendamento:', error);
    return res.status(500).json({ error: 'Erro ao cancelar agendamento' });
  }
});

export default router;