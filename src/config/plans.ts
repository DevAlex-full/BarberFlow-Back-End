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
    price: 49.90,
    features: {
      maxBarbers: 1,
      maxCustomers: 100,
      maxAppointmentsPerMonth: -1, // ilimitado
      hasReports: true,
      hasWhatsappIntegration: false,
      hasEmailSupport: true,
      hasPrioritySupport: false,
    },
    description: 'Perfeito para barbearias iniciantes',
    benefits: [
      'Até 100 clientes cadastrados',
      '1 barbeiro',
      'Agendamentos ilimitados',
      'Relatórios básicos',
      'Suporte por email'
    ]
  },
  
  premium: {
    id: 'premium',
    name: 'Plano Premium',
    price: 99.90,
    features: {
      maxBarbers: 5,
      maxCustomers: -1, // ilimitado
      maxAppointmentsPerMonth: -1,
      hasReports: true,
      hasWhatsappIntegration: true,
      hasEmailSupport: true,
      hasPrioritySupport: true,
    },
    description: 'Para barbearias em crescimento',
    benefits: [
      'Clientes ilimitados',
      'Até 5 barbeiros',
      'Agendamentos ilimitados',
      'Relatórios avançados',
      'Integração WhatsApp',
      'Suporte prioritário',
      'Lembretes automáticos'
    ]
  },
  
  enterprise: {
    id: 'enterprise',
    name: 'Plano Enterprise',
    price: 199.90,
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
    description: 'Para redes de barbearias',
    benefits: [
      'Tudo ilimitado',
      'Multi-unidades',
      'Barbeiros ilimitados',
      'Marca personalizada',
      'Relatórios completos',
      'Integração WhatsApp',
      'Suporte 24/7',
      'Treinamento personalizado'
    ]
  }
};

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