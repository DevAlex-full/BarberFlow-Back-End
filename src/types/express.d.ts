// src/types/express.d.ts

import { User as PrismaUser, Client as PrismaClient } from '@prisma/client';

// Tipo resumido do Client (para req.client em middlewares)
export interface ClientPayload {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

// Estende a tipagem do Express Request
declare global {
  namespace Express {
    // Define o tipo User para req.user (usado em rotas de barbearia)
    interface User {
      id: string;
      email: string;
      barbershopId: string;
      role: 'ADMIN' | 'BARBER';
      name?: string;
      createdAt?: Date;
      updatedAt?: Date;
    }

    // Estende a interface Request para suportar múltiplos tipos
    interface Request {
      // user: Usado por autenticação JWT de barbearias
      user?: User;
      
      // client: Usado por autenticação JWT/OAuth de clientes públicos (versão resumida)
      client?: ClientPayload;
      
      // fullClient: Cliente completo do Prisma (se precisar de todos os campos)
      fullClient?: PrismaClient;
      
      // tokenPayload: Para casos onde precisa do payload JWT bruto
      tokenPayload?: TokenPayload;
    }
  }
}

// Tipagem do payload do JWT
export interface TokenPayload {
  id: string;
  email: string;
  barbershopId: string;
  role: 'ADMIN' | 'BARBER';
}

export {};