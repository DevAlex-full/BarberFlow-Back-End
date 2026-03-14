// src/services/email.service.ts
// ✅ GRÁTIS: Brevo (ex-Sendinblue) — 300 emails/dia free forever
// Para usar: cadastre em https://app.brevo.com → Settings → SMTP & API → SMTP Keys

import nodemailer from 'nodemailer';

// ─────────────────────────────────────────────────────────────────────────────
// Transporter — detecta qual SMTP usar
// ─────────────────────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST   || 'smtp-relay.brevo.com',
  port:   parseInt(process.env.EMAIL_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verifica conexão ao iniciar (apenas em development)
if (process.env.NODE_ENV !== 'production') {
  transporter.verify((error) => {
    if (error) {
      console.error('❌ Email SMTP não configurado:', error.message);
      console.log('💡 Configure as variáveis: EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_FROM');
    } else {
      console.log('✅ Email SMTP pronto para envio');
    }
  });
}

interface EmailData {
  to: string;
  subject: string;
  html: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Função principal de envio
// ─────────────────────────────────────────────────────────────────────────────
export async function sendEmail({ to, subject, html }: EmailData) {
  // ✅ Se email não estiver configurado, só loga (não quebra o app)
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('⚠️ [EMAIL] SMTP não configurado — email não enviado para:', to);
    console.warn('💡 Configure EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_FROM no .env');
    return;
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || `BarberFlow <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log('✅ [EMAIL] Enviado para:', to, '|', subject);
  } catch (error: any) {
    console.error('❌ [EMAIL] Erro ao enviar para:', to, '|', error.message);
    // Não lança o erro para não quebrar o fluxo principal
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Template base (reutilizável)
// ─────────────────────────────────────────────────────────────────────────────
function baseTemplate(content: string, accentColor = '#2563eb'): string {
  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background: #f4f4f7; color: #333; }
        .wrap { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
        .header { background: ${accentColor}; padding: 32px 24px; text-align: center; }
        .header h1 { color: #fff; font-size: 22px; font-weight: 700; }
        .body { padding: 32px 24px; }
        .info-box { background: #f8fafc; border-left: 4px solid ${accentColor}; border-radius: 0 8px 8px 0; padding: 16px 20px; margin: 20px 0; }
        .info-box p { margin-bottom: 6px; font-size: 14px; color: #555; }
        .info-box p:last-child { margin-bottom: 0; }
        .info-box strong { color: #111; }
        .price-box { background: #eff6ff; border-radius: 8px; padding: 14px; text-align: center; margin: 20px 0; font-size: 18px; font-weight: 700; color: ${accentColor}; }
        .btn { display: inline-block; background: ${accentColor}; color: #fff !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 16px 0; }
        .alert { background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 0 8px 8px 0; padding: 12px 16px; font-size: 13px; color: #92400e; margin: 16px 0; }
        .footer { background: #f8fafc; padding: 20px 24px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
        p { line-height: 1.6; margin-bottom: 12px; }
      </style>
    </head>
    <body>
      <div class="wrap">
        ${content}
        <div class="footer">
          <p>© ${new Date().getFullYear()} BarberFlow — Sistema de Agendamento para Barbearias</p>
          <p>Este é um email automático, por favor não responda.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Templates existentes (mantidos para compatibilidade)
// ─────────────────────────────────────────────────────────────────────────────

export function appointmentReminderTemplate(data: {
  customerName: string; serviceName: string; date: string;
  time: string; barberName: string; barbershopName: string;
}) {
  return baseTemplate(`
    <div class="header"><h1>⏰ Lembrete de Agendamento</h1></div>
    <div class="body">
      <p>Olá <strong>${data.customerName}</strong>,</p>
      <p>Este é um lembrete do seu agendamento na <strong>${data.barbershopName}</strong>!</p>
      <div class="info-box">
        <p><strong>📅 Data:</strong> ${data.date}</p>
        <p><strong>🕐 Horário:</strong> ${data.time}</p>
        <p><strong>✂️ Serviço:</strong> ${data.serviceName}</p>
        <p><strong>👤 Profissional:</strong> ${data.barberName}</p>
      </div>
      <div class="alert">⏰ Por favor, chegue com 5 minutos de antecedência.</div>
    </div>
  `);
}

export function appointmentConfirmationTemplate(data: {
  customerName: string; serviceName: string; date: string;
  time: string; barberName: string; barbershopName: string; price: string;
}) {
  return baseTemplate(`
    <div class="header"><h1>✅ Agendamento Confirmado!</h1></div>
    <div class="body">
      <p>Olá <strong>${data.customerName}</strong>,</p>
      <p>Seu agendamento foi confirmado com sucesso na <strong>${data.barbershopName}</strong>!</p>
      <div class="info-box">
        <p><strong>📅 Data:</strong> ${data.date}</p>
        <p><strong>🕐 Horário:</strong> ${data.time}</p>
        <p><strong>✂️ Serviço:</strong> ${data.serviceName}</p>
        <p><strong>👤 Profissional:</strong> ${data.barberName}</p>
      </div>
      <div class="price-box">💰 Valor: R$ ${data.price}</div>
      <p>Você receberá um lembrete 24 horas antes do seu horário.</p>
    </div>
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
// ✅ NOVO: Confirmação de agendamento para CLIENTE (sistema público)
// ─────────────────────────────────────────────────────────────────────────────
export function clientAppointmentConfirmationTemplate(data: {
  clientName: string; serviceName: string; date: string; time: string;
  barberName: string; barbershopName: string; barbershopAddress: string;
  barbershopPhone: string; price: string;
}) {
  return baseTemplate(`
    <div class="header"><h1>✅ Agendamento Confirmado!</h1></div>
    <div class="body">
      <p>Olá <strong>${data.clientName}</strong>,</p>
      <p>Seu agendamento foi confirmado com sucesso!</p>
      <div class="info-box">
        <p><strong>📍 ${data.barbershopName}</strong></p>
        <p><strong>📅 Data:</strong> ${data.date}</p>
        <p><strong>🕐 Horário:</strong> ${data.time}</p>
        <p><strong>✂️ Serviço:</strong> ${data.serviceName}</p>
        <p><strong>👤 Barbeiro:</strong> ${data.barberName}</p>
        <p><strong>📍 Endereço:</strong> ${data.barbershopAddress}</p>
        <p><strong>📞 Telefone:</strong> ${data.barbershopPhone}</p>
      </div>
      <div class="price-box">💰 Valor: R$ ${data.price}</div>
      <div class="alert">⏰ Chegue com 5 minutos de antecedência para não perder seu horário!</div>
      <p>Você receberá um lembrete 24h antes do seu agendamento.</p>
    </div>
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
// ✅ NOVO: Lembrete para CLIENTE (24h antes)
// ─────────────────────────────────────────────────────────────────────────────
export function clientReminderTemplate(data: {
  clientName: string; serviceName: string; date: string; time: string;
  barberName: string; barbershopName: string; barbershopAddress: string;
  barbershopPhone: string;
}) {
  return baseTemplate(`
    <div class="header" style="background:#f59e0b"><h1>🔔 Lembrete: Amanhã é seu dia!</h1></div>
    <div class="body">
      <p>Olá <strong>${data.clientName}</strong>,</p>
      <p>Não esqueça! Seu agendamento é <strong>amanhã</strong>:</p>
      <div class="info-box">
        <p><strong>📍 ${data.barbershopName}</strong></p>
        <p><strong>📅 Data:</strong> ${data.date}</p>
        <p><strong>🕐 Horário:</strong> ${data.time}</p>
        <p><strong>✂️ Serviço:</strong> ${data.serviceName}</p>
        <p><strong>👤 Barbeiro:</strong> ${data.barberName}</p>
        <p><strong>📍 Endereço:</strong> ${data.barbershopAddress}</p>
        <p><strong>📞 Telefone:</strong> ${data.barbershopPhone}</p>
      </div>
      <div class="alert">⏰ Chegue com 5 minutos de antecedência! Caso precise cancelar, entre em contato com a barbearia com pelo menos 2 horas de antecedência.</div>
    </div>
  `, '#f59e0b');
}

// ─────────────────────────────────────────────────────────────────────────────
// ✅ NOVO: Cancelamento para CLIENTE
// ─────────────────────────────────────────────────────────────────────────────
export function clientCancellationTemplate(data: {
  clientName: string; serviceName: string; date: string;
  time: string; barbershopName: string;
}) {
  return baseTemplate(`
    <div class="header" style="background:#dc2626"><h1>❌ Agendamento Cancelado</h1></div>
    <div class="body">
      <p>Olá <strong>${data.clientName}</strong>,</p>
      <p>Seu agendamento foi cancelado conforme solicitado.</p>
      <div class="info-box">
        <p><strong>📍 Barbearia:</strong> ${data.barbershopName}</p>
        <p><strong>📅 Data:</strong> ${data.date}</p>
        <p><strong>🕐 Horário:</strong> ${data.time}</p>
        <p><strong>✂️ Serviço:</strong> ${data.serviceName}</p>
      </div>
      <p>Sentiremos sua falta! 😢 Você pode fazer um novo agendamento a qualquer momento.</p>
    </div>
  `, '#dc2626');
}

// ─────────────────────────────────────────────────────────────────────────────
// ✅ NOVO: Verificação de telefone por email (OTP de perfil)
// ─────────────────────────────────────────────────────────────────────────────
export function phoneVerificationEmailTemplate(data: {
  clientName: string; otp: string;
}) {
  return baseTemplate(`
    <div class="header"><h1>🔐 Verificação de Telefone</h1></div>
    <div class="body">
      <p>Olá <strong>${data.clientName}</strong>,</p>
      <p>Seu código de verificação de telefone é:</p>
      <div class="price-box" style="font-size:32px;letter-spacing:0.3em">${data.otp}</div>
      <p style="text-align:center;color:#666;font-size:13px">Válido por <strong>15 minutos</strong></p>
      <div class="alert">🔒 Nunca compartilhe este código com ninguém. O BarberFlow jamais solicita seu código por telefone.</div>
    </div>
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
// Recuperação de senha
// ─────────────────────────────────────────────────────────────────────────────
export const sendPasswordResetEmail = async (
  email: string,
  name: string,
  resetUrl: string
) => {
  const html = baseTemplate(`
    <div class="header"><h1>🔐 Recuperação de Senha</h1></div>
    <div class="body">
      <p>Olá, <strong>${name}</strong>!</p>
      <p>Recebemos uma solicitação para redefinir sua senha no BarberFlow.</p>
      <div style="text-align:center">
        <a href="${resetUrl}" class="btn">Redefinir Minha Senha</a>
      </div>
      <p style="margin-top:16px;font-size:13px;color:#666">Ou copie e cole este link no navegador:</p>
      <div style="background:#f8fafc;border-radius:8px;padding:12px;font-size:12px;color:#6b7280;word-break:break-all">${resetUrl}</div>
      <div class="alert" style="margin-top:16px">⚠️ Este link expira em <strong>1 hora</strong>. Se você não solicitou, ignore este email.</div>
    </div>
  `);

  await sendEmail({
    to: email,
    subject: '🔐 Recuperação de Senha — BarberFlow',
    html,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Confirmação de pagamento
// ─────────────────────────────────────────────────────────────────────────────
interface PaymentConfirmationData {
  to: string; barbershopName: string; planName: string;
  amount: number; period: string; expiresAt: Date;
}

export async function sendPaymentConfirmationEmail(data: PaymentConfirmationData) {
  const periodNames: Record<string, string> = {
    monthly: 'Mensal', semiannual: 'Semestral', annual: 'Anual'
  };
  const formattedAmount = data.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formattedDate   = data.expiresAt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  const html = baseTemplate(`
    <div class="header" style="background:#7c3aed"><h1>🎉 Pagamento Confirmado!</h1></div>
    <div class="body">
      <p>Olá, <strong>${data.barbershopName}</strong>!</p>
      <p>Seu pagamento foi processado com sucesso e sua assinatura está ativa! 🚀</p>
      <div class="info-box">
        <p><strong>📋 Plano:</strong> ${data.planName}</p>
        <p><strong>📅 Período:</strong> ${periodNames[data.period] || 'Mensal'}</p>
        <p><strong>💰 Valor:</strong> ${formattedAmount}</p>
        <p><strong>🔄 Renovação em:</strong> ${formattedDate}</p>
      </div>
      <div style="text-align:center">
        <a href="${process.env.FRONTEND_URL}/dashboard" class="btn" style="background:#7c3aed">Acessar Painel</a>
      </div>
    </div>
  `, '#7c3aed');

  await sendEmail({ to: data.to, subject: `✅ Pagamento Confirmado — ${data.planName} — BarberFlow`, html });
}

// ─────────────────────────────────────────────────────────────────────────────
// Lembrete de renovação
// ─────────────────────────────────────────────────────────────────────────────
export async function sendRenewalReminderEmail(data: {
  to: string; barbershopName: string; planName: string;
  expiresAt: Date; daysLeft: number;
}) {
  const formattedDate = data.expiresAt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  const html = baseTemplate(`
    <div class="header" style="background:#f59e0b"><h1>⏰ Lembrete de Renovação</h1></div>
    <div class="body">
      <p>Olá, <strong>${data.barbershopName}</strong>!</p>
      <div class="alert">
        ⚠️ Sua assinatura do <strong>${data.planName}</strong> expira em <strong>${data.daysLeft} dia(s)</strong> — <strong>${formattedDate}</strong>
      </div>
      <p>Renove agora para continuar sem interrupções!</p>
      <div style="text-align:center">
        <a href="${process.env.FRONTEND_URL}/planos" class="btn" style="background:#f59e0b;color:#fff">Renovar Assinatura</a>
      </div>
    </div>
  `, '#f59e0b');

  await sendEmail({ to: data.to, subject: `⏰ Sua assinatura expira em ${data.daysLeft} dia(s) — BarberFlow`, html });
}

export default transporter;