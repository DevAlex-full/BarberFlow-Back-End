import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function forceUpdateCommission() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 FORÇAR atualização de comissão');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  try {
    // Email do Alex Santiago
    const targetEmail = 'alex.bueno22@hotmail.com';

    // Buscar usuário
    const user = await prisma.user.findUnique({
      where: { email: targetEmail },
      select: {
        id: true,
        name: true,
        email: true,
        commissionPercentage: true
      }
    });

    if (!user) {
      console.log('❌ Usuário não encontrado!');
      return;
    }

    console.log('📊 Usuário encontrado:');
    console.log(`   Nome: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Comissão ATUAL: ${user.commissionPercentage}%`);
    console.log('');

    // Atualizar para 100%
    console.log('🔄 Atualizando para 100%...');
    
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { commissionPercentage: 100 },
      select: {
        id: true,
        name: true,
        commissionPercentage: true
      }
    });

    console.log('✅ Atualização concluída!');
    console.log(`   Nome: ${updated.name}`);
    console.log(`   Comissão NOVA: ${updated.commissionPercentage}%`);
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎯 Próximos passos:');
    console.log('   1. Volte ao dashboard');
    console.log('   2. Vá em Financeiro → Comissões');
    console.log('   3. DELETE as comissões antigas (ou marque como canceladas)');
    console.log('   4. Clique "Calcular Comissões" novamente');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

forceUpdateCommission()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });