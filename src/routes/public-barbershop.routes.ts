import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Buscar todas barbearias ativas (apenas as que pagam)
router.get('/barbershops', async (req, res) => {
  try {
    const { search, city, state } = req.query;

    const where: any = {
      active: true,
      planStatus: 'active', // Apenas barbearias com plano ativo
    };

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { city: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    if (city) {
      where.city = { contains: city as string, mode: 'insensitive' };
    }
    
    if (state) {
      where.state = state;
    }

    const barbershops = await prisma.barbershop.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        logo: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });

    return res.json(barbershops);
  } catch (error) {
    console.error('Erro ao buscar barbearias:', error);
    return res.status(500).json({ error: 'Erro ao buscar barbearias' });
  }
});

// Buscar detalhes de uma barbearia específica
router.get('/barbershops/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const barbershop = await prisma.barbershop.findUnique({
      where: { id, active: true, planStatus: 'active' },
      include: {
        services: {
          where: { active: true },
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            duration: true,
          },
        },
        users: {
          where: { active: true, role: 'barber' },
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    });

    if (!barbershop) {
      return res.status(404).json({ error: 'Barbearia não encontrada' });
    }

    return res.json(barbershop);
  } catch (error) {
    console.error('Erro ao buscar barbearia:', error);
    return res.status(500).json({ error: 'Erro ao buscar barbearia' });
  }
});

// Buscar horários disponíveis
router.get('/barbershops/:id/available-times', async (req, res) => {
  try {
    const { id } = req.params;
    const { date, barberId, serviceId } = req.query;

    if (!date || !serviceId) {
      return res.status(400).json({ error: 'Data e serviço são obrigatórios' });
    }

    // Buscar duração do serviço
    const service = await prisma.service.findUnique({
      where: { id: serviceId as string },
    });

    if (!service) {
      return res.status(404).json({ error: 'Serviço não encontrado' });
    }

    // Buscar agendamentos do dia
    const startDate = new Date(date as string);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(date as string);
    endDate.setHours(23, 59, 59, 999);

    const appointments = await prisma.appointment.findMany({
      where: {
        barbershopId: id,
        barberId: barberId as string,
        date: {
          gte: startDate,
          lte: endDate,
        },
        status: { not: 'cancelled' },
      },
      select: {
        date: true,
        service: { select: { duration: true } },
      },
    });

    // Gerar horários disponíveis (9h às 18h, intervalos de 30min)
    const availableTimes: string[] = [];
    const workStart = 9;
    const workEnd = 18;
    const now = new Date();

    for (let hour = workStart; hour < workEnd; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeSlot = new Date(startDate);
        timeSlot.setHours(hour, minute, 0, 0);

        // Não permitir horários no passado
        if (timeSlot <= now) continue;

        // Verificar se há conflito com agendamentos existentes
        const hasConflict = appointments.some((apt) => {
          const aptStart = new Date(apt.date);
          const aptEnd = new Date(aptStart.getTime() + apt.service.duration * 60000);
          const slotEnd = new Date(timeSlot.getTime() + service.duration * 60000);

          return (
            (timeSlot >= aptStart && timeSlot < aptEnd) ||
            (slotEnd > aptStart && slotEnd <= aptEnd) ||
            (timeSlot <= aptStart && slotEnd >= aptEnd)
          );
        });

        if (!hasConflict) {
          availableTimes.push(timeSlot.toISOString());
        }
      }
    }

    return res.json(availableTimes);
  } catch (error) {
    console.error('Erro ao buscar horários:', error);
    return res.status(500).json({ error: 'Erro ao buscar horários disponíveis' });
  }
});

export default router;