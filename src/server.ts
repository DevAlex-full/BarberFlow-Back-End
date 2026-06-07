import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import passport from './config/passport';
import adminRoutes from './routes/admin.routes';
import authRoutes from './routes/auth.routes';
import barbershopRoutes from './routes/barbershop.routes';
import barbershopLocationRoutes from './routes/barbershop-location.routes';
import serviceRoutes from './routes/service.routes';
import customerRoutes from './routes/custumer.routes';
import notificationRoutes from './routes/notification.routes';
import appointmentRoutes from './routes/appointment.routes';
import dashboardRoutes from './routes/dashboard.routes';
import subscriptionRoutes from './routes/subscription.routes';
import uploadRoutes from './routes/upload.routes';
import paymentRoutes from './routes/payment.routes';
import publicBarbershopRoutes from './routes/public-barbershop.routes';
import clientAuthRoutes from './routes/client-auth.routes';
import clientAppointmentRoutes from './routes/client-appointment.routes';
import clientFavoritesRoutes from './routes/client-favorites.routes';
import { startCronJobs } from './jobs';
import userRoutes from './routes/user.routes';
import reportsRoutes from './routes/reports.routes';
import analyticsRoutes from './routes/analytics.routes';
import transactionsRoutes from './routes/Transactions.routes';
import commissionsRoutes from './routes/Commissions.routes';
import goalsRoutes from './routes/Goals.routes';
import financeRoutes from './routes/Finance.routes';
import stockRoutes from './routes/stock.routes';
import packagesRoutes from './routes/packages.routes';
import { globalRateLimit, publicRateLimit } from './middlewares/rate-limit.middleware';

console.log('🔵 Iniciando servidor...');

dotenv.config();
console.log('🔵 Porta configurada:', process.env.PORT);

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Helmet — headers de segurança HTTP ──────────────────────────────────────
// contentSecurityPolicy desabilitado: servidor é API pura (sem HTML/CSS próprio).
// crossOriginEmbedderPolicy desabilitado: frontend em Vercel carrega recursos da API.
// Todos os demais headers do Helmet ficam ativos (X-Frame-Options, HSTS, etc.).
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// ─── CORS — origens permitidas ────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://barberflowoficial.vercel.app',
  'https://barberflow-back-end-19nv.onrender.com',
  process.env.FRONTEND_URL,
  process.env.BACKEND_URL,
].filter(Boolean).map(url => url?.replace(/\/$/, '')); // Remove barra final de todas

console.log('🌐 Origens permitidas (CORS):', allowedOrigins);

app.use(cors({
  origin: function (origin, callback) {
    // Permite requisições sem origin (apps mobile nativos, Expo Go, etc.)
    // Necessário para o app cliente funcionar corretamente.
    if (!origin) return callback(null, true);

    // Remove barra final do origin para comparação
    const cleanOrigin = origin.replace(/\/$/, '');

    const isAllowed = allowedOrigins.some(allowed =>
      allowed === cleanOrigin
    );

    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('❌ Origem bloqueada por CORS:', origin);
      callback(new Error('Origem não permitida pela política de CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 600,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// ─── Rate Limiting Global ─────────────────────────────────────────────────────
// 120 req/min por IP — fallback geral.
// Rotas específicas (auth, OTP) têm limites próprios mais restritivos.
app.use(globalRateLimit);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ INICIALIZAR PASSPORT (ADICIONADO)
app.use(passport.initialize());
console.log('🔐 Passport inicializado com sucesso!');

// Servir arquivos estáticos
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/barbershop', barbershopRoutes);
app.use('/api/barbershop-location', barbershopLocationRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/users', userRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/payment', paymentRoutes);

// ✅ SEGURANÇA: publicRateLimit aplicado nas rotas públicas de descoberta
app.use('/api/public', publicRateLimit, publicBarbershopRoutes);

app.use('/api/client/auth', clientAuthRoutes);
app.use('/api/client/appointments', clientAppointmentRoutes);
app.use('/api/client/favorites', clientFavoritesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/commissions', commissionsRoutes);
app.use('/api/goals', goalsRoutes);
app.use('/api/finance',   financeRoutes);
app.use('/api/stock',     stockRoutes);
app.use('/api/packages',  packagesRoutes);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'BarberFlow API está rodando!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Keep-alive endpoint para UptimeRobot
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Erro:', err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Erro interno do servidor'
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📅 Data/Hora: ${new Date().toLocaleString('pt-BR')}`);
  console.log(`🔐 OAuth Google: ${process.env.GOOGLE_CLIENT_ID ? '✅' : '❌'}`);
  console.log(`🔐 OAuth Facebook: ${process.env.FACEBOOK_APP_ID ? '✅' : '❌'}\n`);

  startCronJobs();
});

export default app;