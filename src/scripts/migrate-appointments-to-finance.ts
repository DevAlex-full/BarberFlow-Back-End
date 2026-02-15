// src/scripts/migrate-appointments-to-finance.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateAppointmentsToFinance() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 MIGRAÇÃO: Agendamentos → Transações Financeiras');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  try {
    // 1️⃣ Buscar TODOS os agendamentos concluídos
    const completedAppointments = await prisma.appointment.findMany({
      where: {
        status: 'completed'
      },
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
        },
        barbershop: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        date: 'asc'
      }
    });

    console.log(`📊 Encontrados ${completedAppointments.length} agendamentos concluídos`);
    console.log('');

    if (completedAppointments.length === 0) {
      console.log('⚠️ Nenhum agendamento concluído encontrado.');
      console.log('✅ Migração não necessária.');
      return;
    }

    let transactionsCreated = 0;
    let commissionsCreated = 0;
    let errors = 0;

    // 2️⃣ Processar cada agendamento
    for (const appointment of completedAppointments) {
      try {
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📅 Agendamento: ${appointment.id.substring(0, 8)}...`);
        console.log(`   Data: ${appointment.date.toLocaleDateString('pt-BR')}`);
        console.log(`   Serviço: ${appointment.service.name}`);
        console.log(`   Valor: R$ ${Number(appointment.price).toFixed(2)}`);
        console.log(`   Barbearia: ${appointment.barbershop.name}`);

        // Verificar se já existe transação para este agendamento
        const customerName = appointment.customer?.name || appointment.client?.name || 'Cliente';
        const description = `${appointment.service.name} - ${customerName}`;

        const existingTransaction = await prisma.transaction.findFirst({
          where: {
            barbershopId: appointment.barbershopId,
            type: 'income',
            category: 'service',
            description,
            amount: appointment.price,
            date: appointment.date
          }
        });

        if (existingTransaction) {
          console.log(`   ⏭️ Transação já existe - pulando...`);
          continue;
        }

        // 3️⃣ Criar transação de RECEITA
        const transaction = await prisma.transaction.create({
          data: {
            barbershopId: appointment.barbershopId,
            type: 'income',
            category: 'service',
            description,
            amount: appointment.price,
            date: appointment.date,
            paymentMethod: 'cash',
            status: 'completed'
          }
        });

        transactionsCreated++;
        console.log(`   ✅ Transação criada: ${transaction.id.substring(0, 8)}...`);

        // 4️⃣ Criar COMISSÃO do barbeiro (se configurado)
        const barberPercentage = appointment.barber.commissionPercentage || 0;

        if (barberPercentage > 0) {
          const commissionAmount = Number(appointment.price) * (barberPercentage / 100);
          
          console.log(`   💸 Criando comissão...`);
          console.log(`      Barbeiro: ${appointment.barber.name}`);
          console.log(`      Percentual: ${barberPercentage}%`);
          console.log(`      Valor: R$ ${commissionAmount.toFixed(2)}`);

          // Criar comissão
          const referenceMonth = new Date(
            appointment.date.getFullYear(),
            appointment.date.getMonth(),
            1
          );

          // Verificar se já existe
          const existingCommission = await prisma.commission.findFirst({
            where: {
              barberId: appointment.barber.id,
              barbershopId: appointment.barbershopId,
              referenceMonth,
              amount: commissionAmount
            }
          });

          if (!existingCommission) {
            await prisma.commission.create({
              data: {
                barberId: appointment.barber.id,
                barbershopId: appointment.barbershopId,
                percentage: barberPercentage,
                amount: commissionAmount,
                referenceMonth,
                status: 'pending'
              }
            });

            commissionsCreated++;
            console.log(`   ✅ Comissão criada`);
          } else {
            console.log(`   ⏭️ Comissão já existe - pulando...`);
          }
        } else {
          console.log(`   ⚠️ Barbeiro sem comissão configurada`);
        }

      } catch (error) {
        console.error(`   ❌ Erro ao processar agendamento:`, error);
        errors++;
      }
    }

    // 5️⃣ Resumo Final
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 RESUMO DA MIGRAÇÃO');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Agendamentos processados: ${completedAppointments.length}`);
    console.log(`✅ Transações criadas: ${transactionsCreated}`);
    console.log(`✅ Comissões criadas: ${commissionsCreated}`);
    console.log(`❌ Erros: ${errors}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    if (transactionsCreated > 0) {
      console.log('🎉 Migração concluída com sucesso!');
      console.log('');
      console.log('📌 Próximos passos:');
      console.log('   1. Acesse o Financeiro no dashboard');
      console.log('   2. Verifique se as transações aparecem');
      console.log('   3. Verifique se os valores batem com o Dashboard');
      console.log('');
    } else {
      console.log('⚠️ Nenhuma transação nova foi criada.');
      console.log('   Possíveis motivos:');
      console.log('   - Transações já existem');
      console.log('   - Nenhum agendamento concluído encontrado');
      console.log('');
    }

  } catch (error) {
    console.error('❌ Erro fatal na migração:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// ✅ Executar migração
migrateAppointmentsToFinance()
  .then(() => {
    console.log('✅ Script finalizado.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script falhou:', error);
    process.exit(1);
  });