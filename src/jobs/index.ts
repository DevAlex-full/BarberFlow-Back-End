import cron from 'node-cron';
import { sendAutomaticReminders } from './reminder.job';
import { updateExpiredPlanStatuses } from './update-plan-status.job';

export function startCronJobs() {
  console.log('⏰ Iniciando sistema de tarefas automáticas...\n');

  // ─────────────────────────────────────────────────────────────
  // JOB 1: Atualizar status de planos expirados
  // Executa a cada hora, todos os dias
  // ─────────────────────────────────────────────────────────────
  cron.schedule('0 * * * *', async () => {
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`\n⏰ [${now}] Executando job de atualização de planos...`);

    try {
      await updateExpiredPlanStatuses();
    } catch (error) {
      console.error('❌ Erro ao executar job de planos:', error);
    }
  }, {
    timezone: 'America/Sao_Paulo'
  });

  // ─────────────────────────────────────────────────────────────
  // JOB 2: Lembretes de agendamentos — 10h
  // ─────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────
  // JOB 3: Lembretes de agendamentos — 18h (backup)
  // ─────────────────────────────────────────────────────────────
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
  console.log('   - Atualização de planos: a cada hora');
  console.log('   - Lembretes diários: 10:00 e 18:00');
  console.log('   - Timezone: America/Sao_Paulo\n');

  // ─────────────────────────────────────────────────────────────
  // Executar imediatamente ao iniciar o servidor
  // ─────────────────────────────────────────────────────────────
  console.log('🔄 Executando atualização de planos na inicialização...');
  updateExpiredPlanStatuses().catch(err =>
    console.error('❌ Erro na atualização inicial de planos:', err)
  );
}

// Teste manual
export async function testReminders() {
  console.log('🧪 Executando teste de lembretes...\n');
  await sendAutomaticReminders();
}

// Teste manual do job de planos
export async function testPlanStatusUpdate() {
  console.log('🧪 Executando teste de atualização de planos...\n');
  await updateExpiredPlanStatuses();
}