import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Middleware genérico de validação com Zod.
 *
 * Uso:
 *   router.post('/', validate(createServiceSchema), async (req, res) => { ... })
 *
 * Comportamento:
 * - Se o body não passar no schema → retorna 400 com a primeira mensagem de erro
 * - Se passar → req.body é substituído pelos dados já coercidos e limpos pelo Zod
 *   (ex: price: '29.90' → price: 29.90 quando z.coerce.number() é usado)
 * - next() é chamado apenas quando a validação passa
 */
export const validate =
  (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      // Retorna a primeira mensagem de erro — em português conforme definido nos schemas
      const message = result.error.errors[0]?.message ?? 'Dados inválidos';
      res.status(400).json({ error: message });
      return;
    }

    // Substitui o body pelos dados coercidos e tipados pelo Zod
    // Isso garante que os handlers recebam os tipos corretos após a validação
    req.body = result.data;
    next();
  };