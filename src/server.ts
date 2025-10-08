import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
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
  'https://barberflowoficial.vercel.app', // ✅ CORRIGIDO: HTTPS
  process.env.FRONTEND_URL,
].filter(Boolean);

console.log('🌐 Origens permitidas (CORS):', allowedOrigins);

app.use(cors({
  origin: function (origin, callback) {
    // Permitir requisições sem origin (mobile apps, Postman, etc)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
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
  maxAge: 600
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/barbershops', barbershopRoutes);
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

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'BarberFlow API está rodando!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
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
  console.log(`📅 Data/Hora: ${new Date().toLocaleString('pt-BR')}\n`);
  
  startCronJobs();
});

export default app;