import cron from 'node-cron';
import { sendAutomaticReminders } from './reminder.job';

export function startCronJobs() {
  console.log('⏰ Iniciando sistema de tarefas automáticas...\n');

  // Executar todos os dias às 10:00 da manhã
  cron.schedule('0 10 * * *', async () => {
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`\n⏰ [${now}] Executando job de lembretes diários...`);
    
    try {
      await sendAutomaticReminders();
    } catch (error) {
      console.error('❌ Erro ao executar job de lembretes:', error);
    }
  }, {
    timezone: 'America/Sao_Paulo'
  });

  // Também executar às 18:00 (backup)
  cron.schedule('0 18 * * *', async () => {
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`\n⏰ [${now}] Executando job de lembretes (backup)...`);
    
    try {
      await sendAutomaticReminders();
    } catch (error) {
      console.error('❌ Erro ao executar job de lembretes:', error);
    }
  }, {
    timezone: 'America/Sao_Paulo'
  });

  console.log('✅ Jobs agendados:');
  console.log('   - Lembretes diários: 10:00 e 18:00');
  console.log('   - Timezone: America/Sao_Paulo\n');
}

// Teste manual
export async function testReminders() {
  console.log('🧪 Executando teste de lembretes...\n');
  await sendAutomaticReminders();
}