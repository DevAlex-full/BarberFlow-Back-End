import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import passport from '../config/passport';
import { forgotPassword, resetPassword } from '../middlewares/client-auth.middleware';

const router = Router();

interface AuthRequest extends Request {
  user?: any;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Gera o redirect final com token + user.
 * Se `redirectUri` começa com o scheme do app (barberflow://)
 * redireciona para o app, caso contrário vai para o web.
 */
function buildSuccessRedirect(
  redirectUri: string | null,
  token: string,
  userData: string
): string {
  const webFallback = `${process.env.FRONTEND_URL}/sou-cliente`;
  const base        = redirectUri && redirectUri.startsWith('barberflow://')
    ? redirectUri
    : webFallback;

  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}token=${token}&user=${userData}`;
}

function buildErrorRedirect(redirectUri: string | null, errorCode: string): string {
  const webFallback = `${process.env.FRONTEND_URL}/sou-cliente`;
  const base        = redirectUri && redirectUri.startsWith('barberflow://')
    ? redirectUri
    : webFallback;

  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}error=${errorCode}`;
}

/** Lê o redirect_uri salvo no state (base64 JSON) */
function parseState(stateRaw?: string): { redirectUri: string | null } {
  if (!stateRaw) return { redirectUri: null };
  try {
    const decoded = JSON.parse(Buffer.from(stateRaw, 'base64').toString('utf8'));
    return { redirectUri: decoded.redirectUri || null };
  } catch {
    return { redirectUri: null };
  }
}

// ─── Google OAuth ──────────────────────────────────────────────────────────────

// Inicia o fluxo — salva redirect_uri no state
router.get('/google', (req: Request, res: Response, next) => {
  const redirectUri  = (req.query.redirect_uri as string) || null;
  const statePayload = Buffer.from(JSON.stringify({ redirectUri })).toString('base64');

  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
    state: statePayload,
  })(req, res, next);
});

// Callback
router.get(
  '/google/callback',
  (req: Request, res: Response, next) => {
    const { redirectUri } = parseState(req.query.state as string);

    passport.authenticate('google', {
      session: false,
      failureRedirect: buildErrorRedirect(redirectUri, 'google_auth_failed'),
    })(req, res, next);
  },
  (req: AuthRequest, res: Response) => {
    const { redirectUri } = parseState(req.query.state as string);

    try {
      if (!req.user) {
        return res.redirect(buildErrorRedirect(redirectUri, 'auth_failed'));
      }

      const token = jwt.sign(
        { id: req.user.id, type: 'client' },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

      const userData = encodeURIComponent(JSON.stringify({
        id:    req.user.id,
        email: req.user.email,
        name:  req.user.name,
        phone: req.user.phone,
      }));

      return res.redirect(buildSuccessRedirect(redirectUri, token, userData));
    } catch (error) {
      console.error('Erro no callback do Google:', error);
      return res.redirect(buildErrorRedirect(redirectUri, 'callback_failed'));
    }
  }
);

// ─── Facebook OAuth ────────────────────────────────────────────────────────────

// Inicia o fluxo — salva redirect_uri no state
router.get('/facebook', (req: Request, res: Response, next) => {
  const redirectUri  = (req.query.redirect_uri as string) || null;
  const statePayload = Buffer.from(JSON.stringify({ redirectUri })).toString('base64');

  passport.authenticate('facebook', {
    scope: ['email'],
    session: false,
    state: statePayload,
  })(req, res, next);
});

// Callback
router.get(
  '/facebook/callback',
  (req: Request, res: Response, next) => {
    const { redirectUri } = parseState(req.query.state as string);

    passport.authenticate('facebook', {
      session: false,
      failureRedirect: buildErrorRedirect(redirectUri, 'facebook_auth_failed'),
    })(req, res, next);
  },
  (req: AuthRequest, res: Response) => {
    const { redirectUri } = parseState(req.query.state as string);

    try {
      if (!req.user) {
        return res.redirect(buildErrorRedirect(redirectUri, 'auth_failed'));
      }

      const token = jwt.sign(
        { id: req.user.id, type: 'client' },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

      const userData = encodeURIComponent(JSON.stringify({
        id:    req.user.id,
        email: req.user.email,
        name:  req.user.name,
        phone: req.user.phone,
      }));

      return res.redirect(buildSuccessRedirect(redirectUri, token, userData));
    } catch (error) {
      console.error('Erro no callback do Facebook:', error);
      return res.redirect(buildErrorRedirect(redirectUri, 'callback_failed'));
    }
  }
);

// ─── Rotas tradicionais ────────────────────────────────────────────────────────

router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password, termsAccepted, privacyAccepted } = req.body;

    if (!termsAccepted || !privacyAccepted) {
      return res.status(400).json({
        error: 'Você deve aceitar os Termos de Uso e Política de Privacidade',
      });
    }

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres' });
    }

    const existingClient = await prisma.client.findUnique({ where: { email } });
    if (existingClient) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const client = await prisma.client.create({
      data: {
        name,
        email,
        phone,
        password: hashedPassword,
        termsAccepted: true,
        termsAcceptedAt: new Date(),
        privacyAccepted: true,
        privacyAcceptedAt: new Date(),
        termsVersion: 'v1.0',
        privacyVersion: 'v1.0',
      },
      select: {
        id: true, name: true, email: true, phone: true, avatar: true, createdAt: true,
      },
    });

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

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔐 Tentativa de login:', { email });

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const client = await prisma.client.findUnique({ where: { email } });

    console.log('👤 Cliente encontrado:', client ? 'SIM' : 'NÃO');

    if (!client) {
      return res.status(401).json({ error: 'Email ou senha inválidos' });
    }

    if (!client.active) {
      return res.status(401).json({ error: 'Conta desativada' });
    }

    if (client.password) {
      const validPassword = await bcrypt.compare(password, client.password);
      console.log('🔑 Senha válida:', validPassword ? 'SIM' : 'NÃO');
      if (!validPassword) {
        return res.status(401).json({ error: 'Email ou senha inválidos' });
      }
    } else {
      return res.status(401).json({
        error: 'Esta conta foi criada com Google/Facebook. Use o botão correspondente para entrar.',
      });
    }

    const token = jwt.sign(
      { id: client.id, type: 'client' },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    const { password: _, ...clientData } = client;

    console.log('✅ Login bem-sucedido:', client.email);

    return res.json({ client: clientData, token });
  } catch (error) {
    console.error('❌ Erro ao fazer login:', error);
    return res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });

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
        id: true, name: true, email: true, phone: true,
        avatar: true, birthDate: true, createdAt: true,
      },
    });

    if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });

    return res.json(client);
  } catch (error) {
    console.error('Erro ao buscar dados:', error);
    return res.status(401).json({ error: 'Token inválido' });
  }
});

router.get('/validate-reset-token', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token não fornecido' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const client = await prisma.client.findFirst({
      where: {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { gt: new Date() },
      },
    });

    if (!client) {
      return res.status(400).json({ valid: false, error: 'Token inválido ou expirado' });
    }

    return res.status(200).json({ valid: true, message: 'Token válido' });
  } catch (error) {
    console.error('Erro ao validar token:', error);
    return res.status(500).json({ error: 'Erro ao validar token' });
  }
});

router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

export default router;