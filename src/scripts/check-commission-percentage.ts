import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCommissionPercentage() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 Verificando percentuais de comissão...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  try {
    // Buscar todos os usuários
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        barbershopId: true,
        commissionPercentage: true,
        active: true
      },
      orderBy: { name: 'asc' }
    });

    console.log(`📊 Total de usuários: ${users.length}`);
    console.log('');

    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   BarbershopId: ${user.barbershopId || 'NULL'}`);
      console.log(`   Comissão: ${user.commissionPercentage}%`);
      console.log(`   Ativo: ${user.active ? 'Sim' : 'Não'}`);
      console.log('');
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Buscar agendamentos concluídos
    const appointments = await prisma.appointment.findMany({
      where: {
        status: 'completed'
      },
      select: {
        id: true,
        date: true,
        price: true,
        barberId: true,
        barber: {
          select: {
            name: true,
            commissionPercentage: true
          }
        }
      },
      orderBy: { date: 'desc' }
    });

    console.log('📅 Agendamentos Concluídos:');
    console.log(`   Total: ${appointments.length}`);
    console.log('');

    appointments.forEach((apt, index) => {
      const date = new Date(apt.date);
      const commission = Number(apt.price) * (apt.barber.commissionPercentage / 100);
      
      console.log(`${index + 1}. ${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
      console.log(`   Barbeiro: ${apt.barber.name} (${apt.barber.commissionPercentage}%)`);
      console.log(`   Valor: R$ ${Number(apt.price).toFixed(2)}`);
      console.log(`   Comissão: R$ ${commission.toFixed(2)}`);
      console.log('');
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkCommissionPercentage()
  .then(() => {
    console.log('✅ Verificação concluída');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });