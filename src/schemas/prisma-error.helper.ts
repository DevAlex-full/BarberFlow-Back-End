import { Prisma } from '@prisma/client';
import { Response } from 'express';

/**
 * Handler centralizado de erros conhecidos do Prisma.
 *
 * Uso — apenas onde hoje existe catch genérico retornando 500 por erro Prisma:
 *   } catch (error) {
 *     return handlePrismaError(error, res, 'criar barbeiro');
 *   }
 *
 * Ajuste 3: NÃO substituir mensagens manuais já existentes nas rotas
 * (ex: 'Email já cadastrado' em auth.routes.ts /register).
 * Aplicar apenas onde hoje o erro Prisma chegaria como 500 genérico.
 *
 * Códigos tratados:
 *   P2002 — Unique constraint violation (ex: email duplicado)
 *   P2025 — Record not found em update/delete (ex: ID inválido em update direto)
 *   P2003 — Foreign key constraint (ex: barberId inexistente)
 */
export function handlePrismaError(
  error: unknown,
  res: Response,
  context?: string
): Response {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      // Violação de unique constraint
      case 'P2002': {
        const targets = error.meta?.target as string[] | undefined;
        const field   = targets?.join(', ') ?? 'campo';
        return res.status(409).json({
          error: `Já existe um registro com este ${field}.`
        });
      }

      // Registro não encontrado em operação de escrita (update/delete sem where match)
      // Nota: P2025 em findFirst/findUnique é tratado pelos IDOR checks existentes.
      // Este caso cobre update/delete com { where: { id } } sem verificação prévia.
      case 'P2025': {
        return res.status(404).json({ error: 'Registro não encontrado.' });
      }

      // Violação de foreign key (ID referenciado não existe)
      case 'P2003': {
        return res.status(400).json({
          error: 'Referência inválida. Verifique os IDs informados.'
        });
      }

      // Outros erros Prisma conhecidos → log com código para facilitar debug
      default: {
        const ctx = context ? ` [${context}]` : '';
        console.error(`Prisma P${error.code}${ctx}:`, error.message);
        return res.status(500).json({ error: 'Erro interno do servidor.' });
      }
    }
  }

  // Erro não-Prisma (ex: TypeError, ReferenceError)
  const ctx = context ? ` [${context}]` : '';
  console.error(`Erro inesperado${ctx}:`, error);
  return res.status(500).json({ error: 'Erro interno do servidor.' });
}