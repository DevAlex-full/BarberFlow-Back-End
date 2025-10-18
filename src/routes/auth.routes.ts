import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middlewares/auth.middleware';
import { sendEmail } from '../services/email.service';

const router = Router();
const prisma = new PrismaClient();

// ✅ EMAILS DE SUPER ADMIN (mesmos do admin.middleware.ts)
const SUPER_ADMIN_EMAILS = [
  'alex.zila@hotmail.com',
  'appbarberflow@gmail.com'
];

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, barbershopName, barbershopPhone } = req.body;

    const userExists = await prisma.user.findUnique({
      where: { email }
    });

    if (userExists) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 30);

    const barbershop = await prisma.barbershop.create({
      data: {
        name: barbershopName,
        email: email,
        phone: barbershopPhone,
        plan: 'trial',
        planStatus: 'active',
        trialEndsAt: trialEndsAt,
        maxBarbers: 1,
        maxCustomers: 50
      }
    });

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        phone,
        role: 'ADMIN',
        barbershopId: barbershop.id
      }
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, barbershopId: barbershop.id },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        barbershopId: user.barbershopId
      },
      barbershop: {
        id: barbershop.id,
        name: barbershop.name,
        plan: barbershop.plan
      },
      token
    });
  } catch (error) {
    console.error('❌ Erro no registro:', error);
    return res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

// Login (com suporte a super admin)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔐 Tentativa de login:', email);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { barbershop: true }
    });

    if (!user) {
      console.log('❌ Usuário não encontrado:', email);
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      console.log('❌ Senha inválida para:', email);
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    if (!user.active) {
      console.log('❌ Usuário inativo:', email);
      return res.status(401).json({ error: 'Usuário inativo' });
    }

    // ✅ VERIFICAR SE É SUPER ADMIN
    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(email);

    // ✅ Para super admin, barbershopId pode ser null
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role, 
        barbershopId: user.barbershopId || null // ✅ Permite null para super admin
      },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    console.log('✅ Login bem-sucedido:', email, isSuperAdmin ? '(SUPER ADMIN)' : '');

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        barbershopId: user.barbershopId,
        isSuperAdmin // ✅ Indica se é super admin
      },
      barbershop: user.barbershop ? {
        id: user.barbershop.id,
        name: user.barbershop.name,
        plan: user.barbershop.plan,
        logo: user.barbershop.logo || null
      } : null,
      token
    });
  } catch (error) {
    console.error('❌ Erro crítico no login:', error);
    return res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { barbershop: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const { password, ...userWithoutPassword } = user;

    return res.json({
      ...userWithoutPassword,
      isSuperAdmin: SUPER_ADMIN_EMAILS.includes(user.email)
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao buscar usuário' });
  }
});

// Esqueci a senha
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    console.log('📧 Solicitação de recuperação de senha para:', email);

    if (!email) {
      return res.status(400).json({ error: 'Email é obrigatório' });
    }

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      console.log('⚠️ Email não encontrado, mas retornando sucesso por segurança');
      return res.json({ 
        message: 'Se o email existir, você receberá um link de recuperação' 
      });
    }

    console.log('👤 Usuário encontrado:', user.id, user.email);

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    const resetTokenExpiry = new Date();
    resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: resetTokenExpiry
      }
    });

    console.log('✅ Token salvo no banco com sucesso');

    const resetUrl = `${process.env.FRONTEND_URL}/recuperar-senha/redefinir?token=${resetToken}`;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 15px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔒 Recuperação de Senha</h1>
          </div>
          <div class="content">
            <p>Olá, <strong>${user.name}</strong>!</p>
            <p>Recebemos uma solicitação para redefinir a senha da sua conta no <strong>BarberFlow</strong>.</p>
            <p>Clique no botão abaixo para criar uma nova senha:</p>
            <div style="text-align: center;">
              <a href="${resetUrl}" class="button">Redefinir Senha</a>
            </div>
            <p>Ou copie e cole este link no navegador:</p>
            <p style="background: #fff; padding: 10px; border: 1px solid #ddd; word-break: break-all; font-size: 12px;">
              ${resetUrl}
            </p>
            <p><strong>⏰ Este link expira em 1 hora.</strong></p>
            <p>Se você não solicitou esta alteração, ignore este email.</p>
          </div>
          <div class="footer">
            <p>© 2025 BarberFlow</p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      await sendEmail({
        to: user.email,
        subject: '🔒 Recuperação de Senha - BarberFlow',
        html: emailHtml
      });
      console.log('✅ Email enviado para:', email);
    } catch (emailError) {
      console.error('⚠️ Erro ao enviar email:', emailError);
    }

    return res.json({ 
      message: 'Link de recuperação enviado para seu email' 
    });

  } catch (error: any) {
    console.error('❌ Erro ao processar recuperação:', error);
    return res.status(500).json({ 
      error: 'Erro ao processar solicitação'
    });
  }
});

// Redefinir senha
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    console.log('🔐 Tentativa de redefinir senha');

    if (!token || !password) {
      return res.status(400).json({ error: 'Token e senha são obrigatórios' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: {
          gte: new Date()
        }
      }
    });

    if (!user) {
      console.log('⚠️ Token inválido ou expirado');
      return res.status(400).json({ error: 'Token inválido ou expirado' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null
      }
    });

    console.log('✅ Senha redefinida para:', user.email);

    return res.json({ 
      message: 'Senha redefinida com sucesso!' 
    });

  } catch (error) {
    console.error('❌ Erro ao redefinir senha:', error);
    return res.status(500).json({ error: 'Erro ao redefinir senha' });
  }
});

export default router;