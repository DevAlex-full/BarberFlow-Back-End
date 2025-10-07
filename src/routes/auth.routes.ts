import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

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

export default router;