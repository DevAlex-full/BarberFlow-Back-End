import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middlewares/auth.middleware';
import { sendEmail } from '../services/email.service'; // Verifique se '../utils/email.ts' existe e exporta 'sendEmail', ou ajuste o caminho conforme necessário

const router = Router();
const prisma = new PrismaClient();

// ========================================
// REGISTRO E LOGIN (MANTIDOS)
// ========================================

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
        role: 'admin',
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
    console.error(error);
    return res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { barbershop: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    if (!user.active) {
      return res.status(401).json({ error: 'Usuário inativo' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, barbershopId: user.barbershopId },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        barbershopId: user.barbershopId,
        avatar: user.avatar
      },
      barbershop: user.barbershop ? {
        id: user.barbershop.id,
        name: user.barbershop.name,
        plan: user.barbershop.plan,
        logo: user.barbershop.logo
      } : null,
      token
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { 
        barbershop: true 
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const { password, ...userWithoutPassword } = user;

    return res.json(userWithoutPassword);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao buscar usuário' });
  }
});

// ========================================
// RECUPERAÇÃO DE SENHA (NOVAS ROTAS) ✅
// ========================================

// Esqueci a senha - Envia email com token
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    console.log('📧 Solicitação de recuperação de senha para:', email);

    if (!email) {
      return res.status(400).json({ error: 'Email é obrigatório' });
    }

    // Buscar usuário
    const user = await prisma.user.findUnique({
      where: { email }
    });

    // IMPORTANTE: Sempre retornar sucesso mesmo se email não existir (segurança)
    if (!user) {
      console.log('⚠️ Email não encontrado, mas retornando sucesso por segurança');
      return res.json({ 
        message: 'Se o email existir, você receberá um link de recuperação' 
      });
    }

    // Gerar token único
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Expiração: 1 hora
    const resetTokenExpiry = new Date();
    resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1);

    // Salvar token no banco
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: resetTokenExpiry
      }
    });

    // URL de reset
    const resetUrl = `${process.env.FRONTEND_URL}/recuperar-senha/redefinir?token=${resetToken}`;

    // Enviar email
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
            <p>Se você não solicitou esta alteração, ignore este email. Sua senha permanecerá inalterada.</p>
          </div>
          <div class="footer">
            <p>© 2025 BarberFlow - Gestão Profissional de Barbearias</p>
            <p>Este é um email automático, por favor não responda.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await sendEmail({
      to: user.email,
      subject: '🔒 Recuperação de Senha - BarberFlow',
      html: emailHtml
    });

    console.log('✅ Email de recuperação enviado para:', email);

    return res.json({ 
      message: 'Link de recuperação enviado para seu email' 
    });

  } catch (error) {
    console.error('❌ Erro ao processar recuperação de senha:', error);
    return res.status(500).json({ error: 'Erro ao processar solicitação' });
  }
});

// Redefinir senha - Valida token e muda a senha
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

    // Hash do token recebido
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Buscar usuário pelo token
    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: {
          gte: new Date() // Token ainda válido
        }
      }
    });

    if (!user) {
      console.log('⚠️ Token inválido ou expirado');
      return res.status(400).json({ error: 'Token inválido ou expirado. Solicite um novo link.' });
    }

    // Hash da nova senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Atualizar senha e limpar token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null
      }
    });

    console.log('✅ Senha redefinida com sucesso para:', user.email);

    // Opcional: Enviar email de confirmação
    const confirmEmailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10b981; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Senha Alterada com Sucesso!</h1>
          </div>
          <div class="content">
            <p>Olá, <strong>${user.name}</strong>!</p>
            <p>Sua senha foi alterada com sucesso.</p>
            <p>Se você não fez esta alteração, entre em contato conosco imediatamente.</p>
            <p style="margin-top: 30px;">
              <strong>Equipe BarberFlow</strong>
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    await sendEmail({
      to: user.email,
      subject: '✅ Senha Alterada - BarberFlow',
      html: confirmEmailHtml
    }).catch(err => console.log('Erro ao enviar email de confirmação:', err));

    return res.json({ 
      message: 'Senha redefinida com sucesso! Faça login com sua nova senha.' 
    });

  } catch (error) {
    console.error('❌ Erro ao redefinir senha:', error);
    return res.status(500).json({ error: 'Erro ao redefinir senha' });
  }
});

export default router;