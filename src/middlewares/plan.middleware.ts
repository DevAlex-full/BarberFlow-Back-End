import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { getPlanLimits } from '../config/plans';

const prisma = new PrismaClient();

// Middleware para verificar se o plano está ativo
export const checkPlanActive = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const barbershopId = req.user?.barbershopId;
    
    if (!barbershopId) {
      return res.status(403).json({ error: 'Barbearia não encontrada' });
    }

    const barbershop = await prisma.barbershop.findUnique({
      where: { id: barbershopId }
    });

    if (!barbershop) {
      return res.status(404).json({ error: 'Barbearia não encontrada' });
    }

    // Verificar se está em trial e se expirou
    if (barbershop.plan === 'trial' && barbershop.trialEndsAt) {
      if (new Date() > barbershop.trialEndsAt) {
        return res.status(403).json({ 
          error: 'Seu período de teste expirou. Por favor, assine um plano.',
          code: 'TRIAL_EXPIRED'
        });
      }
    }

    // Verificar se o plano expirou
    if (barbershop.planExpiresAt && new Date() > barbershop.planExpiresAt) {
      if (barbershop.planStatus !== 'active') {
        return res.status(403).json({ 
          error: 'Sua assinatura expirou. Por favor, renove seu plano.',
          code: 'SUBSCRIPTION_EXPIRED'
        });
      }
    }

    // Verificar se está suspenso
    if (barbershop.planStatus === 'suspended') {
      return res.status(403).json({ 
        error: 'Sua conta está suspensa. Entre em contato com o suporte.',
        code: 'ACCOUNT_SUSPENDED'
      });
    }

    next();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao verificar plano' });
  }
};

// Middleware para verificar limite de barbeiros
export const checkBarberLimit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const barbershopId = req.user?.barbershopId;
    
    if (!barbershopId) {
      return res.status(403).json({ error: 'Barbearia não encontrada' });
    }

    const barbershop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      include: {
        _count: {
          select: { users: true }
        }
      }
    });

    if (!barbershop) {
      return res.status(404).json({ error: 'Barbearia não encontrada' });
    }

    const limits = getPlanLimits(barbershop.plan);
    
    if (limits.maxBarbers !== -1 && barbershop._count.users >= limits.maxBarbers) {
      return res.status(403).json({ 
        error: `Limite de barbeiros atingido. Seu plano permite ${limits.maxBarbers} barbeiro(s). Faça upgrade!`,
        code: 'BARBER_LIMIT_REACHED',
        currentPlan: barbershop.plan,
        limit: limits.maxBarbers
      });
    }

    next();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao verificar limite' });
  }
};

// Middleware para verificar limite de clientes
export const checkCustomerLimit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const barbershopId = req.user?.barbershopId;
    
    if (!barbershopId) {
      return res.status(403).json({ error: 'Barbearia não encontrada' });
    }

    const barbershop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      include: {
        _count: {
          select: { customers: true }
        }
      }
    });

    if (!barbershop) {
      return res.status(404).json({ error: 'Barbearia não encontrada' });
    }

    const limits = getPlanLimits(barbershop.plan);
    
    if (limits.maxCustomers !== -1 && barbershop._count.customers >= limits.maxCustomers) {
      return res.status(403).json({ 
        error: `Limite de clientes atingido. Seu plano permite ${limits.maxCustomers} clientes. Faça upgrade!`,
        code: 'CUSTOMER_LIMIT_REACHED',
        currentPlan: barbershop.plan,
        limit: limits.maxCustomers
      });
    }

    next();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao verificar limite' });
  }
};