import { z } from 'zod';

/**
 * Schemas de validação para src/routes/appointment.routes.ts
 *
 * Ajuste 2: data validada via Date.parse() em vez de z.string().datetime()
 * para máxima compatibilidade com o formato ISO que o frontend envia:
 *   new Date(`${formData.date}T${formData.time}:00`).toISOString()
 *   ex: "2026-06-15T14:30:00.000Z"
 *
 * z.string().datetime() exige precisamente o sufixo 'Z' e rejeita
 * formatos válidos como sem milissegundos. Date.parse() aceita qualquer
 * string que o browser já aceita — mais seguro para compatibilidade.
 */

// Helper: valida qualquer string de data válida via Date.parse()
const validDateString = z
  .string({ required_error: 'Data é obrigatória' })
  .refine(
    (val) => !isNaN(Date.parse(val)),
    { message: 'Data inválida' }
  );

// ─── Criar agendamento ────────────────────────────────────────────────────────
export const createAppointmentSchema = z.object({
  date: validDateString,

  serviceId: z
    .string({ required_error: 'Serviço é obrigatório' })
    .uuid('ID do serviço inválido'),

  barberId: z
    .string({ required_error: 'Barbeiro é obrigatório' })
    .uuid('ID do barbeiro inválido'),

  // customerId é opcional: agendamento pode ser de cliente do app (clientId)
  // O frontend pode enviar string vazia '' quando nenhum cliente selecionado
  customerId: z
    .string()
    .uuid('ID do cliente inválido')
    .optional()
    .nullable()
    .or(z.literal('')),

  // clientId é enviado pelo app do cliente (fluxo diferente do dashboard)
  clientId: z
    .string()
    .uuid('ID do cliente inválido')
    .optional()
    .nullable(),

  notes: z
    .string()
    .max(500, 'Observação muito longa')
    .optional()
    .or(z.literal(''))
});

// ─── Atualizar agendamento (partial — todos os campos opcionais) ──────────────
export const updateAppointmentSchema = z.object({
  date: z
    .string()
    .refine(
      (val) => !isNaN(Date.parse(val)),
      { message: 'Data inválida' }
    )
    .optional(),

  status: z
    .enum(['scheduled', 'confirmed', 'completed', 'cancelled'], {
      errorMap: () => ({ message: 'Status inválido' })
    })
    .optional(),

  notes: z
    .string()
    .max(500, 'Observação muito longa')
    .optional()
    .nullable()
    .or(z.literal('')),

  customerId: z
    .string()
    .uuid('ID do cliente inválido')
    .optional()
    .nullable()
    .or(z.literal('')),

  barberId: z
    .string()
    .uuid('ID do barbeiro inválido')
    .optional()
    .nullable(),

  serviceId: z
    .string()
    .uuid('ID do serviço inválido')
    .optional()
    .nullable()
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;