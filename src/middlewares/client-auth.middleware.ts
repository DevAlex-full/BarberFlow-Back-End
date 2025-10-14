import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { sendPasswordResetEmail } from '../services/email.service';

const prisma = new PrismaClient();

interface ClientTokenPayload {
  id: string;
  type: 'client';
}

// ========== MIDDLEWARE DE AUTENTICAÇÃO ==========
export async function clientAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    const [, token] = authHeader.split(' ');

    if (!token) {
      return res.status(401).json({ error: 'Token mal formatado' });
    }

    // Verificar token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-secret-key'
    ) as ClientTokenPayload;

    if (decoded.type !== 'client') {
      return res.status(401).json({ error: 'Tipo de token inválido' });
    }

    // Buscar cliente no banco
    const client = await prisma.client.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
      },
    });

    if (!client) {
      return res.status(401).json({ error: 'Cliente não encontrado' });
    }

    if (!client.active) {
      return res.status(401).json({ error: 'Conta desativada' });
    }

    // Adicionar cliente ao request
    req.client = {
      id: client.id,
      name: client.name,
      email: client.email,
      active: client.active,
    };

    next();
  } catch (error) {
    console.error('Erro na autenticação:', error);
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

// ========== RECUPERAÇÃO DE SENHA ==========

// Solicitar recuperação de senha
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email é obrigatório' });
    }

    // Buscar cliente
    const client = await prisma.client.findUnique({
      where: { email },
    });

    // Por segurança, sempre retornar sucesso mesmo se o email não existir
    if (!client) {
      return res.status(200).json({
        message: 'Se o email existir, você receberá um link de recuperação',
      });
    }

    // Gerar token único
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Definir expiração (1 hora)
    const resetTokenExpiry = new Date(Date.now() + 3600000);

    // Salvar token no banco
    await prisma.client.update({
      where: { id: client.id },
      data: {
        resetPasswordToken: resetTokenHash,
        resetPasswordExpires: resetTokenExpiry,
      },
    });

    // URL do frontend
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    // Enviar email
    await sendPasswordResetEmail(client.email, client.name, resetUrl);

    return res.status(200).json({
      message: 'Email de recuperação enviado com sucesso',
    });
  } catch (error) {
    console.error('Erro ao processar recuperação de senha:', error);
    return res.status(500).json({ error: 'Erro ao processar solicitação' });
  }
};

// Redefinir senha
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;

    // Validação
    if (!token || !password) {
      return res.status(400).json({ error: 'Token e senha são obrigatórios' });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: 'A senha deve ter no mínimo 6 caracteres' });
    }

    // Hash do token para comparar com o banco
    const resetTokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Buscar cliente com token válido e não expirado
    const client = await prisma.client.findFirst({
      where: {
        resetPasswordToken: resetTokenHash,
        resetPasswordExpires: {
          gt: new Date(), // Token ainda não expirou
        },
      },
    });

    if (!client) {
      return res.status(400).json({
        error: 'Token inválido ou expirado. Solicite um novo link de recuperação.',
      });
    }

    // Hash da nova senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Atualizar senha e limpar tokens
    await prisma.client.update({
      where: { id: client.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });

    return res.status(200).json({
      message: 'Senha redefinida com sucesso! Você já pode fazer login.',
    });
  } catch (error) {
    console.error('Erro ao redefinir senha:', error);
    return res.status(500).json({ error: 'Erro ao redefinir senha' });
  }
};