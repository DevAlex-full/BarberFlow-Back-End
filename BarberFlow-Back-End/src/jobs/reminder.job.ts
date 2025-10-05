import { PrismaClient } from '@prisma/client';
import { sendEmail, appointmentReminderTemplate } from '../services/email.service';
import { format, addDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const prisma = new PrismaClient();

export async function sendAutomaticReminders() {
  try {
    console.log('🔔 Verificando agendamentos para enviar lembretes...');

    // Buscar agendamentos para amanhã
    const tomorrow = addDays(new Date(), 1);
    const startOfTomorrow = startOfDay(tomorrow);
    const endOfTomorrow = endOfDay(tomorrow);

    const appointments = await prisma.appointment.findMany({
      where: {
        date: {
          gte: startOfTomorrow,
          lte: endOfTomorrow
        },
        status: {
          in: ['scheduled', 'confirmed']
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

    console.log(`📧 Encontrados ${appointments.length} agendamentos para enviar lembretes`);

    for (const appointment of appointments) {
      if (!appointment.customer.email) continue;

      try {
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

        console.log(`✅ Lembrete enviado para ${appointment.customer.name}`);
      } catch (error) {
        console.error(`❌ Erro ao enviar lembrete para ${appointment.customer.name}:`, error);
      }
    }

    console.log('✅ Envio de lembretes concluído!');
  } catch (error) {
    console.error('❌ Erro ao processar lembretes:', error);
  }
}

// Executar a cada hora (você pode ajustar)
export function startReminderJob() {
  // Executar imediatamente ao iniciar
  sendAutomaticReminders();

  // Executar a cada 1 hora
  setInterval(() => {
    sendAutomaticReminders();
  }, 60 * 60 * 1000); // 1 hora em milissegundos

  console.log('⏰ Job de lembretes iniciado!');
}