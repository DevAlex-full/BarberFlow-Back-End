import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Job: Atualiza planStatus no banco para barbearias com plano expirado.
 * 
 * Casos cobertos:
 * 1. Trial expirado: plan = 'trial' AND trialEndsAt < now AND planStatus != 'expired'
 * 2. Plano pago expirado: planExpiresAt < now AND planStatus = 'active'
 */
export async function updateExpiredPlanStatuses() {
  const now = new Date();

  console.log('\n🔄 [update-plan-status] Verificando planos expirados...');

  try {
    // ─────────────────────────────────────────────
    // 1. Trials expirados
    // ─────────────────────────────────────────────
    const expiredTrials = await prisma.barbershop.updateMany({
      where: {
        plan: 'trial',
        planStatus: { not: 'expired' },
        trialEndsAt: { lt: now }
      },
      data: {
        planStatus: 'expired'
      }
    });

    if (expiredTrials.count > 0) {
      console.log(`   ⚠️  ${expiredTrials.count} trial(s) expirado(s) → planStatus atualizado para 'expired'`);
    }

    // ─────────────────────────────────────────────
    // 2. Planos pagos expirados (planExpiresAt preenchido)
    // ─────────────────────────────────────────────
    const expiredPaid = await prisma.barbershop.updateMany({
      where: {
        plan: { not: 'trial' },
        planStatus: 'active',
        planExpiresAt: {
          not: null,
          lt: now
        }
      },
      data: {
        planStatus: 'expired'
      }
    });

    if (expiredPaid.count > 0) {
      console.log(`   ⚠️  ${expiredPaid.count} plano(s) pago(s) expirado(s) → planStatus atualizado para 'expired'`);
    }

    // ─────────────────────────────────────────────
    // 3. Reativar trials que ainda não expiraram
    //    (edge case: admin pode ter estendido manualmente)
    // ─────────────────────────────────────────────
    const reactivatedTrials = await prisma.barbershop.updateMany({
      where: {
        plan: 'trial',
        planStatus: 'expired',
        trialEndsAt: { gte: now }
      },
      data: {
        planStatus: 'active'
      }
    });

    if (reactivatedTrials.count > 0) {
      console.log(`   ✅ ${reactivatedTrials.count} trial(s) reativado(s) (data de expiração foi estendida)`);
    }

    const totalUpdated = expiredTrials.count + expiredPaid.count + reactivatedTrials.count;

    if (totalUpdated === 0) {
      console.log('   ✅ Nenhuma atualização necessária.');
    }

    console.log(`🏁 [update-plan-status] Concluído. Total atualizado: ${totalUpdated}\n`);

    return {
      expiredTrials: expiredTrials.count,
      expiredPaid: expiredPaid.count,
      reactivated: reactivatedTrials.count
    };
  } catch (error) {
    console.error('❌ [update-plan-status] Erro ao atualizar status dos planos:', error);
    throw error;
  }
}