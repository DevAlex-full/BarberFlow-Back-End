export const PLANS = {
  trial: {
    id: 'trial',
    name: 'Trial Gratuito',
    price: 0,
    duration: 30, // dias
    features: {
      maxBarbers: 1,
      maxCustomers: 50,
      maxAppointmentsPerMonth: 100,
      hasReports: false,
      hasWhatsappIntegration: false,
      hasEmailSupport: true,
      hasPrioritySupport: false,
    },
    description: '30 dias grátis para testar o sistema'
  },
  
  basic: {
    id: 'basic',
    name: 'Plano Básico',
    price: 34.90, // ✅ ATUALIZADO
    oldPrice: 48.90, // ✅ NOVO - para mostrar desconto
    yearlyPrice: 418.80, // ✅ NOVO - valor anual com 30% desconto
    features: {
      maxBarbers: 1,
      maxCustomers: 100,
      maxAppointmentsPerMonth: -1, // ilimitado
      hasReports: true,
      hasWhatsappIntegration: false,
      hasEmailSupport: true,
      hasPrioritySupport: false,
    },
    description: 'Perfeito para 1 profissional',
    benefits: [
      'Até 100 clientes cadastrados',
      '1 barbeiro',
      'Agendamentos ilimitados',
      'Relatórios básicos',
      'Suporte por email'
    ]
  },
  
  standard: {
    id: 'standard',
    name: 'Plano Standard',
    price: 48.90, // ✅ NOVO PLANO
    oldPrice: 69.90,
    yearlyPrice: 586.80,
    features: {
      maxBarbers: 5,
      maxCustomers: 200,
      maxAppointmentsPerMonth: -1,
      hasReports: true,
      hasWhatsappIntegration: false,
      hasEmailSupport: true,
      hasPrioritySupport: false,
    },
    description: 'Ideal para 2 a 5 profissionais',
    benefits: [
      'Até 200 clientes cadastrados',
      'Até 5 barbeiros',
      'Agendamentos ilimitados',
      'Relatórios avançados',
      'Suporte por email',
      'Lembretes automáticos'
    ]
  },
  
  premium: {
    id: 'premium',
    name: 'Plano Premium',
    price: 75.60, // ✅ ATUALIZADO
    oldPrice: 108.00, // ✅ ATUALIZADO
    yearlyPrice: 907.20, // ✅ NOVO
    features: {
      maxBarbers: 15, // ✅ ATUALIZADO (antes era 5)
      maxCustomers: -1, // ilimitado
      maxAppointmentsPerMonth: -1,
      hasReports: true,
      hasWhatsappIntegration: true,
      hasEmailSupport: true,
      hasPrioritySupport: true,
    },
    description: 'Para 6 a 15 profissionais',
    benefits: [
      'Clientes ilimitados',
      'Até 15 barbeiros',
      'Agendamentos ilimitados',
      'Relatórios avançados',
      'Integração WhatsApp',
      'Suporte prioritário',
      'Lembretes automáticos',
      'Multi-unidades'
    ]
  },
  
  enterprise: {
    id: 'enterprise',
    name: 'Plano Enterprise',
    price: 102.80, // ✅ ATUALIZADO
    oldPrice: 146.90, // ✅ ATUALIZADO
    yearlyPrice: 1233.60, // ✅ NOVO
    features: {
      maxBarbers: -1, // ilimitado
      maxCustomers: -1,
      maxAppointmentsPerMonth: -1,
      hasReports: true,
      hasWhatsappIntegration: true,
      hasEmailSupport: true,
      hasPrioritySupport: true,
      hasMultiLocation: true,
      hasCustomBranding: true,
    },
    description: 'Para +15 profissionais',
    benefits: [
      'Tudo ilimitado',
      'Multi-unidades',
      'Barbeiros ilimitados',
      'Marca personalizada',
      'Relatórios completos',
      'Integração WhatsApp',
      'Suporte 24/7',
      'Treinamento personalizado',
      'API dedicada'
    ]
  }
};

// ✅ NOVA FUNÇÃO: Calcular desconto
export function calculateDiscount(period: 'monthly' | 'semiannual' | 'annual'): number {
  const discounts = {
    monthly: 0,
    semiannual: 0.15, // 15%
    annual: 0.30 // 30%
  };
  return discounts[period];
}

// ✅ NOVA FUNÇÃO: Calcular preço com desconto
export function getPriceWithDiscount(planId: string, period: 'monthly' | 'semiannual' | 'annual' = 'monthly'): number {
  const plan = PLANS[planId as keyof typeof PLANS];
  if (!plan || planId === 'trial') return 0;
  
  const discount = calculateDiscount(period);
  const monthlyPrice = plan.price;
  
  if (period === 'monthly') return monthlyPrice;
  if (period === 'semiannual') return monthlyPrice * 6 * (1 - discount);
  if (period === 'annual') return monthlyPrice * 12 * (1 - discount);
  
  return monthlyPrice;
}

export function getPlanLimits(planId: string) {
  return PLANS[planId as keyof typeof PLANS]?.features || PLANS.trial.features;
}

export function canAddBarber(currentCount: number, planId: string): boolean {
  const limits = getPlanLimits(planId);
  if (limits.maxBarbers === -1) return true;
  return currentCount < limits.maxBarbers;
}

export function canAddCustomer(currentCount: number, planId: string): boolean {
  const limits = getPlanLimits(planId);
  if (limits.maxCustomers === -1) return true;
  return currentCount < limits.maxCustomers;
}

// ✅ NOVA FUNÇÃO: Validar upgrade/downgrade
export function canChangeToPlan(currentPlan: string, newPlan: string, currentBarbers: number, currentCustomers: number): { 
  canChange: boolean; 
  reason?: string;
} {
  const newPlanConfig = PLANS[newPlan as keyof typeof PLANS];
  
  if (!newPlanConfig) {
    return { canChange: false, reason: 'Plano inválido' };
  }

  // Verificar limites de barbeiros
  if (newPlanConfig.features.maxBarbers !== -1 && currentBarbers > newPlanConfig.features.maxBarbers) {
    return { 
      canChange: false, 
      reason: `Este plano suporta apenas ${newPlanConfig.features.maxBarbers} barbeiro(s). Você tem ${currentBarbers}.` 
    };
  }

  // Verificar limites de clientes
  if (newPlanConfig.features.maxCustomers !== -1 && currentCustomers > newPlanConfig.features.maxCustomers) {
    return { 
      canChange: false, 
      reason: `Este plano suporta apenas ${newPlanConfig.features.maxCustomers} cliente(s). Você tem ${currentCustomers}.` 
    };
  }

  return { canChange: true };
}