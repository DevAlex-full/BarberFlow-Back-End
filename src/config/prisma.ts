// barberflow-back-end/src/config/prisma.ts

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

// ✅ MIDDLEWARE AVANÇADO: Retry automático com detecção melhorada
prisma.$use(async (params, next) => {
  const maxRetries = 3;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const result = await next(params);
      return result;
    } catch (error: any) {
      const errorMessage = error.message || '';
      const errorCode = error.code || '';
      
      // ✅ Detectar TODOS os tipos de erro de prepared statement
      const isPreparedStatementError = 
        errorCode === '26000' ||
        errorCode === 'P2024' ||
        errorMessage.includes('prepared statement') ||
        errorMessage.includes('does not exist') ||
        errorMessage.includes('PrismaClientUnknownRequestError');

      if (isPreparedStatementError && retries < maxRetries - 1) {
        retries++;
        console.log(`⚠️ Prepared statement error (tentativa ${retries}/${maxRetries})`);
        
        // ✅ Aguardar antes de retry (backoff exponencial)
        await new Promise(resolve => setTimeout(resolve, 100 * retries));
        
        // ✅ Forçar reconexão
        try {
          await prisma.$disconnect();
          await prisma.$connect();
          console.log('🔄 Reconectado ao PostgreSQL');
        } catch (reconnectError) {
          console.error('❌ Erro ao reconectar:', reconnectError);
        }
        
        // ✅ Tentar novamente
        continue;
      }
      
      // ✅ Se não for erro de prepared statement ou excedeu retries, lança o erro
      throw error;
    }
  }
  
  throw new Error('Máximo de tentativas excedido');
});

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

// ✅ Health check periódico (a cada 30 segundos)
setInterval(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    if (!globalForPrisma.isConnected) {
      console.log('🔄 Conexão restaurada');
      globalForPrisma.isConnected = true;
    }
  } catch (error) {
    if (globalForPrisma.isConnected) {
      console.log('⚠️ Conexão perdida, tentando reconectar...');
      globalForPrisma.isConnected = false;
      try {
        await prisma.$disconnect();
        await prisma.$connect();
        globalForPrisma.isConnected = true;
        console.log('✅ Reconexão bem-sucedida');
      } catch (reconnectError) {
        console.error('❌ Falha na reconexão:', reconnectError);
      }
    }
  }
}, 30000);

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