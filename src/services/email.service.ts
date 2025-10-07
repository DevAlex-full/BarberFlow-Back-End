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
          <p>© 2024 BarberPro - Sistema de Gestão para Barbearias</p>
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
          <p>© 2024 BarberPro - Sistema de Gestão para Barbearias</p>
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