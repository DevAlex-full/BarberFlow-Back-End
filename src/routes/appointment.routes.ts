import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';
import { createTransactionFromAppointment, cancelTransactionFromAppointment } from '../services/transaction.service';

const router = Router();

// Listar agendamentos
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { date, status } = req.query;

    const where: any = {
      barbershopId: req.user!.barbershopId!
    };

    if (date) {
      const startDate = new Date(date as string);
      const endDate = new Date(date as string);
      endDate.setDate(endDate.getDate() + 1);

      where.date = {
        gte: startDate,
        lt: endDate
      };
    }

    if (status) {
      where.status = status;
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        client: { select: { id: true, name: true, phone: true } },
        barber: { select: { id: true, name: true } },
        service: { select: { id: true, name: true, price: true, duration: true } }
      },
      orderBy: { date: 'asc' }
    });

    return res.json(appointments);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao buscar agendamentos' });
  }
});

// Criar agendamento
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { date, customerId, barberId, serviceId, notes } = req.body;

    // Buscar o serviço para pegar o preço
    const service = await prisma.service.findUnique({
      where: { id: serviceId }
    });

    if (!service) {
      return res.status(404).json({ error: 'Serviço não encontrado' });
    }

    const appointment = await prisma.appointment.create({
      data: {
        date: new Date(date),
        customerId,
        barberId,
        serviceId,
        barbershopId: req.user!.barbershopId!,
        price: service.price,
        notes,
        status: 'confirmed'
      },
      include: {
        customer: true,
        barber: { select: { name: true } },
        service: true
      }
    });

    return res.status(201).json(appointment);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao criar agendamento' });
  }
});

// ✅ ATUALIZAR AGENDAMENTO - COM WEBHOOK FINANCEIRO
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { date, status, notes, customerId, barberId, serviceId } = req.body;
    const barbershopId = req.user!.barbershopId!;

    // ✅ Buscar agendamento ANTES da atualização
    const previousAppointment = await prisma.appointment.findUnique({
      where: { id }
    });

    if (!previousAppointment) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }

    const updateData: any = {};

    if (date) updateData.date = new Date(date);
    if (status) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (customerId) updateData.customerId = customerId;
    if (barberId) updateData.barberId = barberId;
    if (serviceId) {
      updateData.serviceId = serviceId;
      const service = await prisma.service.findUnique({
        where: { id: serviceId }
      });
      if (service) updateData.price = service.price;
    }

    // ✅ ATUALIZAR AGENDAMENTO
    const appointment = await prisma.appointment.update({
      where: { id },
      data: updateData,
      include: {
        customer: true,
        barber: { select: { name: true } },
        service: true
      }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🎯 WEBHOOK FINANCEIRO AUTOMÁTICO
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // ✅ CASO 1: Agendamento marcado como CONCLUÍDO
    if (status === 'completed' && previousAppointment.status !== 'completed') {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎯 WEBHOOK: Agendamento concluído!');
      console.log('   Status: ' + previousAppointment.status + ' → completed');

      try {
        await createTransactionFromAppointment({
          appointmentId: id,
          barbershopId
        });
      } catch (error) {
        console.error('❌ Erro ao criar transação automática:', error);
        // ⚠️ NÃO FALHAR a requisição por erro financeiro
      }
    }

    // ✅ CASO 2: Agendamento CANCELADO (que estava concluído)
    if (status === 'cancelled' && previousAppointment.status === 'completed') {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔄 WEBHOOK: Agendamento cancelado!');
      console.log('   Status: completed → cancelled');

      try {
        await cancelTransactionFromAppointment({
          appointmentId: id,
          barbershopId
        });
      } catch (error) {
        console.error('❌ Erro ao cancelar transação:', error);
      }
    }

    return res.json(appointment);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao atualizar agendamento' });
  }
});

// Deletar agendamento
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.appointment.delete({
      where: { id }
    });

    return res.json({ message: 'Agendamento deletado com sucesso' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao deletar agendamento' });
  }
});

export default router;