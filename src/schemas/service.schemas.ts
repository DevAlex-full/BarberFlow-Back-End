import { z } from 'zod';

/**
 * Schemas de validação para src/routes/service.routes.ts
 *
 * Atenção: price e duration chegam como STRING do frontend
 * (formData.price = '' → '29.90', input type="text").
 * z.coerce.number() converte string → number antes de validar.
 */

// ─── Criar serviço ────────────────────────────────────────────────────────────
export const createServiceSchema = z.object({
  name: z
    .string({ required_error: 'Nome do serviço é obrigatório' })
    .min(2, 'Nome deve ter no mínimo 2 caracteres')
    .max(100, 'Nome muito longo'),

  description: z
    .string()
    .max(500, 'Descrição muito longa')
    .optional()
    .or(z.literal('')),

  // z.coerce converte '29.90' → 29.90 antes de validar
  price: z
    .coerce
    .number({ required_error: 'Preço é obrigatório', invalid_type_error: 'Preço inválido' })
    .positive('O preço deve ser maior que zero')
    .max(10000, 'Preço muito alto'),

  // z.coerce converte '30' → 30 antes de validar
  duration: z
    .coerce
    .number({ required_error: 'Duração é obrigatória', invalid_type_error: 'Duração inválida' })
    .int('Duração deve ser um número inteiro')
    .min(5,   'Duração mínima é 5 minutos')
    .max(480, 'Duração máxima é 480 minutos (8 horas)'),

  // barberId é UUID ou null/undefined/'' (campo de seleção opcional)
  barberId: z
    .string()
    .uuid('ID do barbeiro inválido')
    .optional()
    .nullable()
    .or(z.literal(''))
});

// ─── Atualizar serviço (partial — todos os campos são opcionais) ──────────────
// O frontend faz:
//   PUT /services/:id com todos os campos (edição completa)
//   PUT /services/:id com { active: boolean } (toggle de ativação)
// O schema precisa aceitar ambos os casos.
export const updateServiceSchema = z.object({
  name: z
    .string()
    .min(2, 'Nome deve ter no mínimo 2 caracteres')
    .max(100, 'Nome muito longo')
    .optional(),

  description: z
    .string()
    .max(500, 'Descrição muito longa')
    .optional()
    .nullable()
    .or(z.literal('')),

  price: z
    .coerce
    .number({ invalid_type_error: 'Preço inválido' })
    .positive('O preço deve ser maior que zero')
    .max(10000, 'Preço muito alto')
    .optional(),

  duration: z
    .coerce
    .number({ invalid_type_error: 'Duração inválida' })
    .int('Duração deve ser um número inteiro')
    .min(5,   'Duração mínima é 5 minutos')
    .max(480, 'Duração máxima é 480 minutos')
    .optional(),

  barberId: z
    .string()
    .uuid('ID do barbeiro inválido')
    .optional()
    .nullable()
    .or(z.literal('')),

  active: z
    .boolean()
    .optional()
});

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;