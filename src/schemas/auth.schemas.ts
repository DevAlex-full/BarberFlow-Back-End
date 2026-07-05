import { z } from 'zod';

/**
 * Schemas de validação para src/routes/auth.routes.ts
 *
 * Ajuste 3: as mensagens de erro aqui são para campos sem validação atual.
 * Onde já existe validação manual (ex: password min 6), os schemas apenas
 * replicam a mesma regra — não alteram o comportamento visível.
 */

// ─── Registro de barbeiro / admin ─────────────────────────────────────────────
export const registerSchema = z.object({
  name: z
    .string({ required_error: 'Nome é obrigatório' })
    .min(2, 'Nome deve ter no mínimo 2 caracteres')
    .max(100, 'Nome muito longo'),

  email: z
    .string({ required_error: 'Email é obrigatório' })
    .email('Email inválido'),

  password: z
    .string({ required_error: 'Senha é obrigatória' })
    .min(6, 'A senha deve ter no mínimo 6 caracteres'),

  // phone: string livre — o frontend não aplica máscara antes do envio
  phone: z
    .string({ required_error: 'Telefone é obrigatório' })
    .min(8, 'Telefone inválido'),

  barbershopName: z
    .string({ required_error: 'Nome da barbearia é obrigatório' })
    .min(2, 'Nome da barbearia deve ter no mínimo 2 caracteres')
    .max(100, 'Nome da barbearia muito longo'),

  // barbershopPhone é mostrado no cadastro mas pode variar
  barbershopPhone: z
    .string()
    .min(8, 'Telefone da barbearia inválido')
    .optional()
    .or(z.literal(''))
});

// ─── Login ────────────────────────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email é obrigatório' })
    .email('Email inválido'),

  password: z
    .string({ required_error: 'Senha é obrigatória' })
    .min(1, 'Senha é obrigatória')
});

// ─── Recuperação de senha ─────────────────────────────────────────────────────
export const forgotPasswordSchema = z.object({
  email: z
    .string({ required_error: 'Email é obrigatório' })
    .email('Email inválido')
});

// ─── Redefinição de senha ─────────────────────────────────────────────────────
export const resetPasswordSchema = z.object({
  token: z
    .string({ required_error: 'Token é obrigatório' })
    .min(1, 'Token é obrigatório'),

  password: z
    .string({ required_error: 'Senha é obrigatória' })
    .min(6, 'A senha deve ter no mínimo 6 caracteres')
});

export type RegisterInput       = z.infer<typeof registerSchema>;
export type LoginInput           = z.infer<typeof loginSchema>;
export type ForgotPasswordInput  = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput   = z.infer<typeof resetPasswordSchema>;