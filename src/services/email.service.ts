import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verificar conexão ao iniciar
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Erro na configuração do email:', error);
  } else {
    console.log('✅ Servidor de email pronto para enviar mensagens');
  }
});

interface EmailData {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: EmailData) {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html,
    });
    console.log('Email enviado para:', to);
  } catch (error) {
    console.error('Erro ao enviar email:', error);
    throw error;
  }
}

// Template de lembrete de agendamento
export function appointmentReminderTemplate(data: {
  customerName: string;
  serviceName: string;
  date: string;
  time: string;
  barberName: string;
  barbershopName: string;
}) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .info-box { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #667eea; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✂️ Lembrete de Agendamento</h1>
        </div>
        <div class="content">
          <p>Olá <strong>${data.customerName}</strong>,</p>
          <p>Este é um lembrete do seu agendamento na <strong>${data.barbershopName}</strong>!</p>
          
          <div class="info-box">
            <p><strong>📅 Data:</strong> ${data.date}</p>
            <p><strong>🕐 Horário:</strong> ${data.time}</p>
            <p><strong>✂️ Serviço:</strong> ${data.serviceName}</p>
            <p><strong>👤 Profissional:</strong> ${data.barberName}</p>
          </div>
          
          <p>Por favor, chegue com 5 minutos de antecedência.</p>
          <p>Se precisar cancelar ou reagendar, entre em contato conosco.</p>
          
          <p style="margin-top: 30px;">Até logo! 👋</p>
        </div>
        <div class="footer">
          <p>© 2025 BarberFlow - Sistema de Gestão para Barbearias</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Template de confirmação de agendamento
export function appointmentConfirmationTemplate(data: {
  customerName: string;
  serviceName: string;
  date: string;
  time: string;
  barberName: string;
  barbershopName: string;
  price: string;
}) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .success-icon { font-size: 48px; text-align: center; margin: 20px 0; }
        .info-box { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; }
        .price { background: #e8f5e9; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Agendamento Confirmado!</h1>
        </div>
        <div class="content">
          <div class="success-icon">✂️</div>
          <p>Olá <strong>${data.customerName}</strong>,</p>
          <p>Seu agendamento foi confirmado com sucesso na <strong>${data.barbershopName}</strong>!</p>
          
          <div class="info-box">
            <p><strong>📅 Data:</strong> ${data.date}</p>
            <p><strong>🕐 Horário:</strong> ${data.time}</p>
            <p><strong>✂️ Serviço:</strong> ${data.serviceName}</p>
            <p><strong>👤 Profissional:</strong> ${data.barberName}</p>
          </div>
          
          <div class="price">
            <p style="margin: 0; font-size: 18px;"><strong>💰 Valor: R$ ${data.price}</strong></p>
          </div>
          
          <p>Você receberá um lembrete 24 horas antes do seu horário.</p>
          <p>Estamos ansiosos para atendê-lo!</p>
        </div>
        <div class="footer">
          <p>© 2025 BarberFlow - Sistema de Gestão para Barbearias</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Template de confirmação para cliente (sistema público)
export function clientAppointmentConfirmationTemplate(data: {
  clientName: string;
  serviceName: string;
  date: string;
  time: string;
  barberName: string;
  barbershopName: string;
  barbershopAddress: string;
  barbershopPhone: string;
  price: string;
}) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .success-icon { font-size: 48px; text-align: center; margin: 20px 0; }
        .info-box { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #2563eb; }
        .price { background: #dbeafe; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Agendamento Confirmado!</h1>
        </div>
        <div class="content">
          <div class="success-icon">✂️</div>
          <p>Olá <strong>${data.clientName}</strong>,</p>
          <p>Seu agendamento foi confirmado com sucesso!</p>
          
          <div class="info-box">
            <h3 style="margin-top: 0; color: #2563eb;">📍 ${data.barbershopName}</h3>
            <p><strong>📅 Data:</strong> ${data.date}</p>
            <p><strong>🕐 Horário:</strong> ${data.time}</p>
            <p><strong>✂️ Serviço:</strong> ${data.serviceName}</p>
            <p><strong>👤 Barbeiro:</strong> ${data.barberName}</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 15px 0;">
            <p><strong>📍 Endereço:</strong><br>${data.barbershopAddress}</p>
            <p><strong>📞 Telefone:</strong> ${data.barbershopPhone}</p>
          </div>
          
          <div class="price">
            <p style="margin: 0; font-size: 20px;"><strong>💰 Valor: R$ ${data.price}</strong></p>
          </div>
          
          <p style="background: #fef3c7; padding: 15px; border-radius: 5px; border-left: 4px solid #f59e0b;">
            ⏰ <strong>Importante:</strong> Chegue com 5 minutos de antecedência!
          </p>
          
          <p>Você receberá um lembrete 24 horas antes do seu horário.</p>
          <p>Qualquer dúvida, entre em contato com a barbearia.</p>
        </div>
        <div class="footer">
          <p>© 2025 BarberFlow - Sistema de Agendamento para Barbearias</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Template de cancelamento para cliente
export function clientCancellationTemplate(data: {
  clientName: string;
  serviceName: string;
  date: string;
  time: string;
  barbershopName: string;
}) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .info-box { background: #fee2e2; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #dc2626; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>❌ Agendamento Cancelado</h1>
        </div>
        <div class="content">
          <p>Olá <strong>${data.clientName}</strong>,</p>
          <p>Seu agendamento foi cancelado conforme solicitado.</p>
          
          <div class="info-box">
            <h3 style="margin-top: 0; color: #dc2626;">Detalhes do Agendamento Cancelado</h3>
            <p><strong>📍 Barbearia:</strong> ${data.barbershopName}</p>
            <p><strong>📅 Data:</strong> ${data.date}</p>
            <p><strong>🕐 Horário:</strong> ${data.time}</p>
            <p><strong>✂️ Serviço:</strong> ${data.serviceName}</p>
          </div>
          
          <p>Sentiremos sua falta! 😢</p>
          <p>Você pode fazer um novo agendamento a qualquer momento através do BarberFlow.</p>
          
          <p style="margin-top: 30px;">Até breve! 👋</p>
        </div>
        <div class="footer">
          <p>© 2025 BarberFlow - Sistema de Agendamento para Barbearias</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Template de lembrete para cliente
export function clientReminderTemplate(data: {
  clientName: string;
  serviceName: string;
  date: string;
  time: string;
  barberName: string;
  barbershopName: string;
  barbershopAddress: string;
  barbershopPhone: string;
}) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .reminder-icon { font-size: 48px; text-align: center; margin: 20px 0; }
        .info-box { background: #fef3c7; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #f59e0b; }
        .alert-box { background: #fee2e2; padding: 15px; border-radius: 5px; border-left: 4px solid #dc2626; margin: 20px 0; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⏰ Lembrete de Agendamento</h1>
        </div>
        <div class="content">
          <div class="reminder-icon">🔔</div>
          <p>Olá <strong>${data.clientName}</strong>,</p>
          <p>Seu agendamento é <strong>amanhã</strong>! Não esqueça:</p>
          
          <div class="info-box">
            <h3 style="margin-top: 0; color: #d97706;">📍 ${data.barbershopName}</h3>
            <p><strong>📅 Data:</strong> ${data.date}</p>
            <p><strong>🕐 Horário:</strong> ${data.time}</p>
            <p><strong>✂️ Serviço:</strong> ${data.serviceName}</p>
            <p><strong>👤 Barbeiro:</strong> ${data.barberName}</p>
            <hr style="border: none; border-top: 1px solid #fcd34d; margin: 15px 0;">
            <p><strong>📍 Endereço:</strong><br>${data.barbershopAddress}</p>
            <p><strong>📞 Telefone:</strong> ${data.barbershopPhone}</p>
          </div>
          
          <div class="alert-box">
            <p style="margin: 0; font-size: 16px;"><strong>⚠️ Atenção:</strong> Chegue com 5 minutos de antecedência para não perder seu horário!</p>
          </div>
          
          <p>Caso precise cancelar ou reagendar, entre em contato com a barbearia o quanto antes.</p>
          <p>Nos vemos em breve! 😊</p>
        </div>
        <div class="footer">
          <p>© 2025 BarberFlow - Sistema de Agendamento para Barbearias</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// ✅ NOVO: Interface para confirmação de pagamento
interface PaymentConfirmationData {
  to: string;
  barbershopName: string;
  planName: string;
  amount: number;
  period: string;
  expiresAt: Date;
}

// ✅ NOVO: Email de confirmação de pagamento
export async function sendPaymentConfirmationEmail(data: PaymentConfirmationData) {
  const { to, barbershopName, planName, amount, period, expiresAt } = data;

  const periodNames: Record<string, string> = {
    monthly: 'Mensal',
    semiannual: 'Semestral',
    annual: 'Anual'
  };

  const periodName = periodNames[period] || 'Mensal';
  const formattedAmount = amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formattedDate = expiresAt.toLocaleDateString('pt-BR', { 
    day: '2-digit', 
    month: 'long', 
    year: 'numeric' 
  });

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <style>
        body { margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f7; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 40px 20px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; }
        .content { padding: 40px 30px; }
        .success-icon { text-align: center; margin-bottom: 30px; font-size: 64px; }
        .message { font-size: 16px; color: #374151; line-height: 1.6; margin-bottom: 30px; }
        .plan-details { background-color: #f9fafb; border-radius: 8px; padding: 20px; margin: 30px 0; }
        .plan-details h2 { color: #8B5CF6; font-size: 20px; margin: 0 0 15px 0; }
        .detail-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
        .detail-row:last-child { border-bottom: none; }
        .detail-label { color: #6b7280; font-size: 14px; }
        .detail-value { color: #111827; font-weight: 600; font-size: 14px; }
        .highlight { background-color: #fef3c7; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 20px 0; }
        .cta-button { display: inline-block; background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 20px 0; }
        .footer { background-color: #f9fafb; padding: 30px; text-align: center; font-size: 14px; color: #6b7280; }
        .support { margin-top: 30px; padding-top: 30px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Pagamento Confirmado!</h1>
        </div>
        <div class="content">
          <div class="success-icon">✅</div>
          <div class="message">
            <p>Olá, <strong>${barbershopName}</strong>!</p>
            <p>Seu pagamento foi processado com sucesso e sua assinatura está ativa! 🚀</p>
            <p>Agora você tem acesso completo a todos os recursos do <strong>BarberFlow</strong>.</p>
          </div>
          <div class="plan-details">
            <h2>📋 Detalhes da Assinatura</h2>
            <div class="detail-row">
              <span class="detail-label">Plano</span>
              <span class="detail-value">${planName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Período</span>
              <span class="detail-value">${periodName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Valor Pago</span>
              <span class="detail-value">${formattedAmount}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Renovação em</span>
              <span class="detail-value">${formattedDate}</span>
            </div>
          </div>
          <div class="highlight">
            <p style="margin:0;"><strong>💡 Dica:</strong> Aproveite todos os recursos disponíveis no seu plano para maximizar os resultados da sua barbearia!</p>
          </div>
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL}/dashboard" class="cta-button">
              Acessar Painel de Controle
            </a>
          </div>
          <div class="support">
            <p><strong>Precisa de ajuda?</strong></p>
            <p>Nossa equipe está pronta para te ajudar!</p>
            <p>Email: ${process.env.EMAIL_USER}</p>
            <p>WhatsApp: (11) 98394-3905</p>
          </div>
        </div>
        <div class="footer">
          <p>Este é um email automático, por favor não responda.</p>
          <p>© 2025 <strong>BarberFlow</strong>. Todos os direitos reservados.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await sendEmail({
      to: to,
      subject: `✅ Pagamento Confirmado - ${planName} - BarberFlow`,
      html: html
    });
    console.log('✅ Email de confirmação de pagamento enviado');
    return { success: true };
  } catch (error) {
    console.error('❌ Erro ao enviar email de confirmação:', error);
    throw error;
  }
}

// ✅ NOVO: Email de lembrete de renovação
export async function sendRenewalReminderEmail(data: {
  to: string;
  barbershopName: string;
  planName: string;
  expiresAt: Date;
  daysLeft: number;
}) {
  const { to, barbershopName, planName, expiresAt, daysLeft } = data;

  const formattedDate = expiresAt.toLocaleDateString('pt-BR', { 
    day: '2-digit', 
    month: 'long', 
    year: 'numeric' 
  });

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <style>
        body { margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f7; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; }
        .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 40px 20px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 28px; }
        .content { padding: 40px 30px; }
        .warning-box { background-color: #fef3c7; padding: 20px; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 20px 0; }
        .cta-button { display: inline-block; background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; margin: 20px 0; }
        .footer { background-color: #f9fafb; padding: 30px; text-align: center; font-size: 14px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⏰ Lembrete de Renovação</h1>
        </div>
        <div class="content">
          <p>Olá, <strong>${barbershopName}</strong>!</p>
          <div class="warning-box">
            <p style="margin:0; color:#92400e; font-size:16px;">
              <strong>⚠️ Atenção:</strong> Sua assinatura do <strong>${planName}</strong> expira em <strong>${daysLeft} dia(s)</strong>!
            </p>
            <p style="margin:10px 0 0 0; color:#92400e;">
              Data de expiração: <strong>${formattedDate}</strong>
            </p>
          </div>
          <p>Para continuar aproveitando todos os recursos do BarberFlow sem interrupções, renove sua assinatura agora!</p>
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL}/planos" class="cta-button">Renovar Assinatura</a>
          </div>
        </div>
        <div class="footer">
          <p>© 2025 <strong>BarberFlow</strong>. Todos os direitos reservados.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await sendEmail({
      to: to,
      subject: `⏰ Sua assinatura expira em ${daysLeft} dia(s) - BarberFlow`,
      html: html
    });
    console.log('✅ Email de lembrete de renovação enviado');
    return { success: true };
  } catch (error) {
    console.error('❌ Erro ao enviar lembrete de renovação:', error);
    throw error;
  }
}

export const sendPasswordResetEmail = async (
  email: string,
  name: string,
  resetUrl: string
) => {
  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #2463eb 0%, #1d4fd8 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 28px; }
        .content { background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; }
        .content h2 { color: #1f2937; margin-top: 0; }
        .button { display: inline-block; background: #2463eb; color: white !important; padding: 14px 40px; text-decoration: none; border-radius: 8px; margin: 25px 0; font-weight: bold; font-size: 16px; }
        .button:hover { background: #1d4fd8; }
        .link-box { background: #f9fafb; padding: 15px; border: 1px solid #e5e7eb; border-radius: 6px; word-break: break-all; font-size: 14px; color: #6b7280; margin: 20px 0; }
        .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; border-radius: 4px; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔐 BarberFlow</h1>
        </div>
        <div class="content">
          <h2>Recuperação de Senha</h2>
          <p>Olá, <strong>${name}</strong>!</p>
          <p>Recebemos uma solicitação para redefinir sua senha no BarberFlow. Clique no botão abaixo para criar uma nova senha:</p>
          
          <div style="text-align: center;">
            <a href="${resetUrl}" class="button">Redefinir Minha Senha</a>
          </div>
          
          <p>Ou copie e cole este link no seu navegador:</p>
          <div class="link-box">${resetUrl}</div>
          
          <div class="warning">
            <strong>⚠️ Atenção:</strong> Este link expira em <strong>1 hora</strong> por motivos de segurança.
          </div>
          
          <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
            Se você não solicitou a recuperação de senha, ignore este email. Sua senha permanecerá inalterada e segura.
          </p>
        </div>
        <div class="footer">
          <p>© 2025 BarberFlow. Todos os direitos reservados.</p>
          <p>Este é um email automático, por favor não responda.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: '🔐 Recuperação de Senha - BarberFlow',
    html: emailHtml,
  });
};

export default transporter;