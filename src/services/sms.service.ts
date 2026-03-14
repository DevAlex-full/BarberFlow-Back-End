// src/services/sms.service.ts
// ✅ Twilio — trial gratuito com ~$15 de crédito (≈700 SMS)
// Para usar: cadastre em https://twilio.com/try-twilio
// Variáveis: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER

let twilioClient: any = null;

// Inicializa o cliente Twilio apenas se as variáveis estiverem configuradas
function getClient() {
  if (twilioClient) return twilioClient;

  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;

  if (!sid || !token) {
    return null;
  }

  try {
    const twilio = require('twilio');
    twilioClient = twilio(sid, token);
    console.log('✅ Twilio SMS configurado');
    return twilioClient;
  } catch (e) {
    console.warn('⚠️ Twilio não instalado. Execute: npm install twilio');
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Enviar SMS
// ─────────────────────────────────────────────────────────────────────────────
export async function sendSMS(to: string, message: string): Promise<boolean> {
  const client = getClient();

  // ✅ Fallback: se Twilio não configurado, só loga (não quebra o app)
  if (!client) {
    console.warn('⚠️ [SMS] Twilio não configurado — SMS não enviado para:', to);
    console.warn('   Mensagem que seria enviada:', message);
    console.warn('💡 Configure: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER');
    return false;
  }

  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!from) {
    console.warn('⚠️ [SMS] TWILIO_PHONE_NUMBER não configurado');
    return false;
  }

  try {
    await client.messages.create({ body: message, from, to });
    console.log('✅ [SMS] Enviado para:', to);
    return true;
  } catch (error: any) {
    // ✅ Não lança erro para não quebrar o fluxo de agendamento
    console.error('❌ [SMS] Erro ao enviar para:', to, '|', error.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Templates de SMS (curtos — máx. 160 caracteres)
// ─────────────────────────────────────────────────────────────────────────────

export function smsConfirmacaoAgendamento(data: {
  clientName: string; barbershopName: string; date: string; time: string;
}): string {
  return `BarberFlow: Olá ${data.clientName}! Seu agendamento na ${data.barbershopName} está confirmado para ${data.date} às ${data.time}. Qualquer dúvida, entre em contato.`;
}

export function smsLembreteAgendamento(data: {
  clientName: string; barbershopName: string; time: string;
}): string {
  return `BarberFlow: Lembrete! ${data.clientName}, você tem agendamento AMANHÃ às ${data.time} na ${data.barbershopName}. Chegue 5min antes!`;
}

export function smsCancelamentoAgendamento(data: {
  clientName: string; barbershopName: string; date: string; time: string;
}): string {
  return `BarberFlow: ${data.clientName}, seu agendamento de ${data.date} às ${data.time} na ${data.barbershopName} foi cancelado. Agende novamente pelo app.`;
}

export function smsOtpVerificacao(otp: string): string {
  return `BarberFlow: Seu codigo de verificacao e ${otp}. Valido por 15 minutos. Nao compartilhe com ninguem.`;
}