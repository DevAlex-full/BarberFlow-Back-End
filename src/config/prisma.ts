// barberflow-back-end/src/config/prisma.ts

import dotenv from 'dotenv';
dotenv.config(); // ✅ DEVE SER A PRIMEIRA COISA — carrega .env antes do Prisma

import { PrismaClient } from '@prisma/client';

// ✅ SINGLETON: Garante UMA ÚNICA instância do Prisma
const globalForPrisma = global as unknown as { 
  prisma: PrismaClient;
  isConnected: boolean;
};

// ✅ Configuração otimizada do Prisma
export const prisma = globalForPrisma.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
});

// ✅ Adicionar ao global para reutilizar
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// ✅ Rastrear estado da conexão
globalForPrisma.isConnected = false;

// ✅ Conectar na inicialização com retry
const connectWithRetry = async (retries = 5): Promise<void> => {
  try {
    await prisma.$connect();
    globalForPrisma.isConnected = true;
    console.log('✅ Prisma conectado ao PostgreSQL');
  } catch (error) {
    if (retries > 0) {
      console.log(`⚠️ Erro ao conectar, tentando novamente... (${retries} tentativas restantes)`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return connectWithRetry(retries - 1);
    }
    console.error('❌ Falha ao conectar ao PostgreSQL após múltiplas tentativas:', error);
    throw error;
  }
};

// ✅ Iniciar conexão
connectWithRetry().catch(err => {
  console.error('❌ Erro fatal ao conectar Prisma:', err);
  process.exit(1);
});

// ✅ Graceful shutdown
const shutdown = async () => {
  console.log('🔌 Desconectando Prisma...');
  try {
    await prisma.$disconnect();
    globalForPrisma.isConnected = false;
    console.log('✅ Prisma desconectado com sucesso');
  } catch (error) {
    console.error('❌ Erro ao desconectar:', error);
  }
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('beforeExit', async () => {
  if (globalForPrisma.isConnected) {
    await shutdown();
  }
});