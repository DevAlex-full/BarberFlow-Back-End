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