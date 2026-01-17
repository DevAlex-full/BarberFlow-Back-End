import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import passport from './config/passport';
import adminRoutes from './routes/admin.routes';
import authRoutes from './routes/auth.routes';
import barbershopRoutes from './routes/barbershop.routes';
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
import { startCronJobs } from './jobs';

console.log('🔵 Iniciando servidor...');

dotenv.config();
console.log('🔵 Porta configurada:', process.env.PORT);

const app = express();
const PORT = process.env.PORT || 4000;

// ✅ CORS - Origens corrigidas com HTTPS
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://barberflowoficial.vercel.app',
  'https://barberflow-api-v2.onrender.com',
  process.env.FRONTEND_URL,
  process.env.BACKEND_URL,
].filter(Boolean).map(url => url?.replace(/\/$/, '')); // Remove barra final de todas

console.log('🌐 Origens permitidas (CORS):', allowedOrigins);

app.use(cors({
  origin: function (origin, callback) {
    // Permitir requisições sem origin (mobile apps, Postman, etc)
    if (!origin) return callback(null, true);
    
    // Remover barra final do origin para comparação
    const cleanOrigin = origin.replace(/\/$/, '');
    
    // Verificar se o origin (sem barra) está na lista
    const isAllowed = allowedOrigins.some(allowed => 
      allowed === cleanOrigin
    );
    
    if (isAllowed) {
      console.log('✅ Origem permitida:', origin);
      callback(null, true);
    } else {
      console.log('❌ Origem bloqueada por CORS:', origin);
      console.log('📋 Origens permitidas:', allowedOrigins);
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ INICIALIZAR PASSPORT (ADICIONADO)
app.use(passport.initialize());
console.log('🔐 Passport inicializado com sucesso!');

// Servir arquivos estáticos
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/barbershop', barbershopRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/public', publicBarbershopRoutes);
app.use('/api/client/auth', clientAuthRoutes);
app.use('/api/client/appointments', clientAppointmentRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'BarberFlow API está rodando!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    oauth: {
      google: !!process.env.GOOGLE_CLIENT_ID,
      facebook: !!process.env.FACEBOOK_APP_ID
    }
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