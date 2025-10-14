import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import passport from '../config/passport';
import { forgotPassword, resetPassword } from '../middlewares/client-auth.middleware';

const router = Router();
const prisma = new PrismaClient();

// Interface para requisições autenticadas
interface AuthRequest extends Request {
  user?: any;
}

// ========== ROTAS OAUTH (NOVAS) ==========

// Google OAuth - Inicia o fluxo
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  })
);

// Google OAuth - Callback
router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL}?error=google_auth_failed`,
  }),
  (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.redirect(`${process.env.FRONTEND_URL}?error=auth_failed`);
      }

      const token = jwt.sign(
        { id: req.user.id, type: 'client' },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

      const userData = encodeURIComponent(JSON.stringify({
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        phone: req.user.phone,
      }));

      res.redirect(`${process.env.FRONTEND_URL}?token=${token}&user=${userData}`);
    } catch (error) {
      console.error('Erro no callback do Google:', error);
      res.redirect(`${process.env.FRONTEND_URL}?error=callback_failed`);
    }
  }
);

// Facebook OAuth - Inicia o fluxo
router.get(
  '/facebook',
  passport.authenticate('facebook', {
    scope: ['email'],
    session: false,
  })
);

// Facebook OAuth - Callback
router.get(
  '/facebook/callback',
  passport.authenticate('facebook', {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL}?error=facebook_auth_failed`,
  }),
  (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.redirect(`${process.env.FRONTEND_URL}?error=auth_failed`);
      }

      const token = jwt.sign(
        { id: req.user.id, type: 'client' },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

      const userData = encodeURIComponent(JSON.stringify({
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        phone: req.user.phone,
      }));

      res.redirect(`${process.env.FRONTEND_URL}?token=${token}&user=${userData}`);
    } catch (error) {
      console.error('Erro no callback do Facebook:', error);
      res.redirect(`${process.env.FRONTEND_URL}?error=callback_failed`);
    }
  }
);

// ========== ROTAS TRADICIONAIS (MANTIDAS) ==========

// Cadastro de cliente
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Validações básicas
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres' });
    }

    // Verificar se email já existe
    const existingClient = await prisma.client.findUnique({
      where: { email },
    });

    if (existingClient) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Criar cliente
    const client = await prisma.client.create({
      data: {
        name,
        email,
        phone,
        password: hashedPassword,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        createdAt: true,
      },
    });

    // Gerar token JWT
    const token = jwt.sign(
      { id: client.id, type: 'client' },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    return res.status(201).json({ client, token });
  } catch (error) {
    console.error('Erro ao criar conta:', error);
    return res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

// Login de cliente
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔐 Tentativa de login:', { email }); // LOG

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    // Buscar cliente
    const client = await prisma.client.findUnique({
      where: { email },
    });

    console.log('👤 Cliente encontrado:', client ? 'SIM' : 'NÃO'); // LOG

    if (!client) {
      return res.status(401).json({ error: 'Email ou senha inválidos' });
    }

    if (!client.active) {
      return res.status(401).json({ error: 'Conta desativada' });
    }

    // Verificar senha
    const validPassword = await bcrypt.compare(password, client.password);

    console.log('🔑 Senha válida:', validPassword ? 'SIM' : 'NÃO'); // LOG

    if (!validPassword) {
      return res.status(401).json({ error: 'Email ou senha inválidos' });
    }

    // Gerar token
    const token = jwt.sign(
      { id: client.id, type: 'client' },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    // Remover senha do retorno
    const { password: _, ...clientData } = client;

    console.log('✅ Login bem-sucedido:', client.email); // LOG

    return res.json({ client: clientData, token });
  } catch (error) {
    console.error('❌ Erro ao fazer login:', error);
    return res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// Buscar dados do cliente autenticado
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    const [, token] = authHeader.split(' ');

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-secret-key'
    ) as { id: string; type: string };

    if (decoded.type !== 'client') {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const client = await prisma.client.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        birthDate: true,
        createdAt: true,
      },
    });

    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    return res.json(client);
  } catch (error) {
    console.error('Erro ao buscar dados:', error);
    return res.status(401).json({ error: 'Token inválido' });
  }
});

router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

export default router;