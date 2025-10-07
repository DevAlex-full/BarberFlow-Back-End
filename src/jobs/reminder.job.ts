import { PrismaClient } from '@prisma/client';
import { sendEmail, appointmentReminderTemplate, clientReminderTemplate } from '../services/email.service';
import { format, addDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const prisma = new PrismaClient();

export async function sendAutomaticReminders() {
  try {
    console.log('🔔 Verificando agendamentos para enviar lembretes...');

    const tomorrow = addDays(new Date(), 1);
    const startOfTomorrow = startOfDay(tomorrow);
    const endOfTomorrow = endOfDay(tomorrow);

    // Buscar agendamentos de clientes do dashboard (Customer)
    const customerAppointments = await prisma.appointment.findMany({
      where: {
        date: {
          gte: startOfTomorrow,
          lte: endOfTomorrow
        },
        status: {
          in: ['scheduled', 'confirmed']
        },
        customerId: {
          not: null
        },
        customer: {
          email: {
            not: null
          }
        }
      },
      include: {
        customer: true,
        service: true,
        barber: true,
        barbershop: true
      }
    });

    // Buscar agendamentos de clientes públicos (Client)
    const clientAppointments = await prisma.appointment.findMany({
      where: {
        date: {
          gte: startOfTomorrow,
          lte: endOfTomorrow
        },
        status: {
          in: ['scheduled', 'confirmed']
        },
        clientId: {
          not: null
        },
        client: {
          email: {
            not: null
          }
        }
      },
      include: {
        client: true,
        service: true,
        barber: true,
        barbershop: true
      }
    });

    const totalAppointments = customerAppointments.length + clientAppointments.length;
    console.log(`📧 Encontrados ${totalAppointments} agendamentos para enviar lembretes`);
    console.log(`   - Clientes do dashboard: ${customerAppointments.length}`);
    console.log(`   - Clientes públicos: ${clientAppointments.length}`);

    let successCount = 0;
    let errorCount = 0;

    // Enviar para clientes do dashboard
    for (const appointment of customerAppointments) {
      if (!appointment.customer?.email) continue;

      try {
        const emailData = {
          customerName: appointment.customer.name,
          serviceName: appointment.service.name,
          date: format(new Date(appointment.date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }),
          time: format(new Date(appointment.date), 'HH:mm'),
          barberName: appointment.barber.name,
          barbershopName: appointment.barbershop.name
        };

        await sendEmail({
          to: appointment.customer.email,
          subject: '🔔 Lembrete: Seu agendamento é amanhã!',
          html: appointmentReminderTemplate(emailData)
        });

        console.log(`✅ Lembrete enviado para ${appointment.customer.name} (dashboard)`);
        successCount++;

        // Delay para não sobrecarregar o servidor de email
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`❌ Erro ao enviar lembrete para ${appointment.customer.name}:`, error);
        errorCount++;
      }
    }

    // Enviar para clientes públicos
    for (const appointment of clientAppointments) {
      if (!appointment.client?.email) continue;

      try {
        const emailData = {
          clientName: appointment.client.name,
          serviceName: appointment.service.name,
          date: format(new Date(appointment.date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }),
          time: format(new Date(appointment.date), 'HH:mm'),
          barberName: appointment.barber.name,
          barbershopName: appointment.barbershop.name,
          barbershopAddress: `${appointment.barbershop.address}, ${appointment.barbershop.city} - ${appointment.barbershop.state}`,
          barbershopPhone: appointment.barbershop.phone
        };

        await sendEmail({
          to: appointment.client.email,
          subject: '🔔 Lembrete: Seu agendamento é amanhã!',
          html: clientReminderTemplate(emailData)
        });

        console.log(`✅ Lembrete enviado para ${appointment.client.name} (público)`);
        successCount++;

        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`❌ Erro ao enviar lembrete para ${appointment.client.name}:`, error);
        errorCount++;
      }
    }

    console.log(`\n📈 Resumo do envio de lembretes:`);
    console.log(`   ✅ Enviados com sucesso: ${successCount}`);
    console.log(`   ❌ Erros: ${errorCount}`);
    console.log(`   📊 Total processado: ${totalAppointments}\n`);

    return {
      total: totalAppointments,
      success: successCount,
      errors: errorCount
    };
  } catch (error) {
    console.error('❌ Erro ao processar lembretes:', error);
    throw error;
  }
}