// barberflow-back-end/src/config/prisma.ts

import { PrismaClient } from '@prisma/client';

// ✅ SINGLETON: Garante UMA ÚNICA instância do Prisma
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  
  // ✅ CONFIGURAÇÕES DE CONNECTION POOL OTIMIZADAS
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

// ✅ MIDDLEWARE: Reconectar automaticamente se conexão cair
prisma.$use(async (params, next) => {
  try {
    return await next(params);
  } catch (error: any) {
    // Se for erro de prepared statement, tenta reconectar
    if (error.code === '26000' || error.message?.includes('prepared statement')) {
      console.log('⚠️ Prepared statement error detectado, reconectando...');
      await prisma.$disconnect();
      await prisma.$connect();
      return await next(params);
    }
    throw error;
  }
});

// ✅ Conectar na inicialização
prisma.$connect()
  .then(() => console.log('✅ Prisma conectado ao PostgreSQL'))
  .catch((err) => console.error('❌ Erro ao conectar Prisma:', err));

// ✅ Graceful shutdown
const shutdown = async () => {
  console.log('🔌 Desconectando Prisma...');
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('beforeExit', shutdown);