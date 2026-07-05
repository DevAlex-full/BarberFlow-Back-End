import { z } from 'zod';

/**
 * Schemas de validação para src/routes/custumer.routes.ts
 *
 * Campos opcionais no frontend (sem required nos inputs):
 *   email, birthDate, notes
 *
 * Campos obrigatórios no frontend:
 *   name, phone
 *
 * birthDate chega como string 'yyyy-mm-dd' (input type="date")
 * ou '' quando não preenchido.
 */

// ─── Criar cliente ────────────────────────────────────────────────────────────
export const createCustomerSchema = z.object({
  name: z
    .string({ required_error: 'Nome é obrigatório' })
    .min(2, 'Nome deve ter no mínimo 2 caracteres')
    .max(100, 'Nome muito longo'),

  // phone: string livre, sem máscara — frontend envia dígitos com possível formatação
  phone: z
    .string({ required_error: 'Telefone é obrigatório' })
    .min(8, 'Telefone inválido'),

  // email é opcional no formulário de clientes
  email: z
    .string()
    .email('Email inválido')
    .optional()
    .nullable()
    .or(z.literal('')),

  // birthDate: 'yyyy-mm-dd' ou '' (não preenchido)
  birthDate: z
    .string()
    .refine(
      (val) => val === '' || !isNaN(Date.parse(val)),
      { message: 'Data de nascimento inválida' }
    )
    .optional()
    .nullable()
    .or(z.literal('')),

  notes: z
    .string()
    .max(1000, 'Observações muito longas')
    .optional()
    .nullable()
    .or(z.literal(''))
});

// ─── Atualizar cliente (partial — todos os campos opcionais) ──────────────────
export const updateCustomerSchema = z.object({
  name: z
    .string()
    .min(2, 'Nome deve ter no mínimo 2 caracteres')
    .max(100, 'Nome muito longo')
    .optional(),

  phone: z
    .string()
    .min(8, 'Telefone inválido')
    .optional(),

  email: z
    .string()
    .email('Email inválido')
    .optional()
    .nullable()
    .or(z.literal('')),

  birthDate: z
    .string()
    .refine(
      (val) => val === '' || !isNaN(Date.parse(val)),
      { message: 'Data de nascimento inválida' }
    )
    .optional()
    .nullable()
    .or(z.literal('')),

  notes: z
    .string()
    .max(1000, 'Observações muito longas')
    .optional()
    .nullable()
    .or(z.literal('')),

  active: z
    .boolean()
    .optional()
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;