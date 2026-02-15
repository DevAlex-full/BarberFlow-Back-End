import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetCommissions() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🗑️  RESETAR Comissões de Fevereiro/2026');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  try {
    // Data de referência: Fevereiro/2026
    const referenceMonth = new Date(2026, 1, 1); // Mês 1 = Fevereiro

    // Buscar comissões de Fevereiro
    const commissions = await prisma.commission.findMany({
      where: {
        referenceMonth
      },
      include: {
        barber: {
          select: {
            name: true
          }
        }
      }
    });

    console.log(`📊 Comissões encontradas: ${commissions.length}`);
    console.log('');

    commissions.forEach((c, index) => {
      console.log(`${index + 1}. ${c.barber.name}`);
      console.log(`   Percentual: ${c.percentage}%`);
      console.log(`   Valor: R$ ${Number(c.amount).toFixed(2)}`);
      console.log(`   Status: ${c.status}`);
      console.log('');
    });

    // Deletar todas
    console.log('🗑️  Deletando comissões antigas...');
    
    const deleted = await prisma.commission.deleteMany({
      where: {
        referenceMonth
      }
    });

    console.log(`✅ ${deleted.count} comissões deletadas!`);
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎯 Próximos passos:');
    console.log('   1. Volte ao dashboard');
    console.log('   2. Vá em Financeiro → Comissões');
    console.log('   3. Clique "Calcular Comissões"');
    console.log('   4. Agora deve criar 3 comissões com 100%!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetCommissions()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });