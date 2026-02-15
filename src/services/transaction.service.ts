// src/services/transaction.service.ts

import { prisma } from '../config/prisma';

interface CreateTransactionFromAppointmentParams {
  appointmentId: string;
  barbershopId: string;
}

/**
 * 🎯 Cria transação de receita automaticamente quando agendamento é concluído
 */
export async function createTransactionFromAppointment({
  appointmentId,
  barbershopId
}: CreateTransactionFromAppointmentParams) {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💰 Criando transação automática...');
    console.log('   Agendamento:', appointmentId);
    
    // Buscar agendamento com relacionamentos
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        service: true,
        customer: true,
        client: true,
        barber: {
          select: {
            id: true,
            name: true,
            commissionPercentage: true
          }
        }
      }
    });

    if (!appointment) {
      throw new Error('Agendamento não encontrado');
    }

    // 1️⃣ CRIAR TRANSAÇÃO DE RECEITA
    const customerName = appointment.customer?.name || appointment.client?.name || 'Cliente';
    
    const transaction = await prisma.transaction.create({
      data: {
        barbershopId,
        type: 'income',
        category: 'service',
        description: `${appointment.service.name} - ${customerName}`,
        amount: appointment.price,
        date: appointment.date,
        paymentMethod: 'cash', // Padrão: dinheiro
        status: 'completed'
      }
    });

    console.log('✅ Transação de receita criada:', transaction.id);
    console.log('   Valor: R$', Number(transaction.amount).toFixed(2));

    // 2️⃣ CRIAR COMISSÃO DO BARBEIRO (se configurado)
    const barberPercentage = appointment.barber.commissionPercentage;
    
    if (barberPercentage > 0) {
      const commissionAmount = Number(appointment.price) * (barberPercentage / 100);
      
      console.log('💸 Criando comissão do barbeiro...');
      console.log('   Barbeiro:', appointment.barber.name);
      console.log('   Percentual:', barberPercentage + '%');
      console.log('   Valor:', 'R$' + commissionAmount.toFixed(2));

      // Criar comissão
      const referenceMonth = new Date(
        appointment.date.getFullYear(),
        appointment.date.getMonth(),
        1
      );

      await prisma.commission.create({
        data: {
          barberId: appointment.barber.id,
          barbershopId,
          percentage: barberPercentage,
          amount: commissionAmount,
          referenceMonth,
          status: 'pending'
        }
      });

      console.log('✅ Comissão criada (pendente de pagamento)');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    return {
      transaction,
      commissionCreated: barberPercentage > 0
    };
  } catch (error) {
    console.error('❌ Erro ao criar transação automática:', error);
    throw error;
  }
}

/**
 * 🔄 Estorna transação quando agendamento é cancelado
 */
export async function cancelTransactionFromAppointment({
  appointmentId,
  barbershopId
}: CreateTransactionFromAppointmentParams) {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔄 Estornando transação automática...');
    console.log('   Agendamento:', appointmentId);

    // Buscar agendamento
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        service: true,
        customer: true,
        client: true
      }
    });

    if (!appointment) {
      throw new Error('Agendamento não encontrado');
    }

    // Buscar transação relacionada (pela data + valor + descrição)
    const customerName = appointment.customer?.name || appointment.client?.name || 'Cliente';
    const description = `${appointment.service.name} - ${customerName}`;

    const transaction = await prisma.transaction.findFirst({
      where: {
        barbershopId,
        type: 'income',
        category: 'service',
        description,
        amount: appointment.price,
        date: appointment.date
      }
    });

    if (transaction) {
      // Marcar como cancelada
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'cancelled' }
      });

      console.log('✅ Transação cancelada:', transaction.id);
    } else {
      console.log('⚠️ Transação não encontrada (pode não ter sido criada)');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return { cancelled: !!transaction };
  } catch (error) {
    console.error('❌ Erro ao cancelar transação:', error);
    throw error;
  }
}