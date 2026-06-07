import rateLimit from 'express-rate-limit';

// ─── Mensagem padrão de erro ──────────────────────────────────────────────────
const tooManyRequests = {
  error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
};

// ─── Auth de barbeiro: login, register, forgot/reset password ─────────────────
// 10 tentativas por IP a cada 15 minutos.
// skipSuccessfulRequests: requisições com status 2xx não contam no limite.
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooManyRequests,
  skipSuccessfulRequests: true,
});

// ─── Auth de cliente (sou-cliente): login, register, forgot/reset password ────
// Mesmo limite do authRateLimit, separado para não misturar contadores.
export const clientAuthRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooManyRequests,
  skipSuccessfulRequests: true,
});

// ─── OTP / Verificação de telefone ───────────────────────────────────────────
// 5 tentativas por IP a cada 10 minutos.
export const otpRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooManyRequests,
});

// ─── Rotas públicas de descoberta (barbearias, geolocalização) ────────────────
// 60 requisições por minuto por IP — suficiente para uso real,
// bloqueante para scrapers e bots.
export const publicRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooManyRequests,
});

// ─── Global: fallback para todas as rotas da API ─────────────────────────────
// 120 requisições por minuto por IP (2 req/s).
// Generoso o suficiente para não impactar usuários legítimos,
// restritivo o suficiente para bloquear uso abusivo automatizado.
export const globalRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooManyRequests,
});