import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware, isAdmin } from '../middlewares/auth.middleware';
import { checkBarberLimit } from '../middlewares/plan.middleware';
import bcrypt from 'bcryptjs';

const router = Router();

// ========================================
// 🆕 NOVAS ROTAS: CONFIGURAÇÕES DE CONTA
// ========================================

// ✅ GET /api/users/profile - Buscar dados do usuário logado
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        avatar: true,
        barbershop: {
          select: {
            id: true,
            name: true,
            plan: true,
          }
        },
        preferences: true,
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    return res.json(user);
  } catch (error) {
    console.error('Erro ao buscar perfil:', error);
    return res.status(500).json({ error: 'Erro ao buscar dados do usuário' });
  }
});

// ✅ PUT /api/users/profile - Atualizar dados pessoais
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { name, email, phone } = req.body;

    // Validações
    if (!name || !email) {
      return res.status(400).json({ error: 'Nome e email são obrigatórios' });
    }

    // Verificar se email já existe (se mudou)
    const existingUser = await prisma.user.findFirst({
      where: {
        email,
        id: { not: userId }
      }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Este email já está em uso' });
    }

    // Atualizar usuário
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name,
        email,
        phone,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
      }
    });

    return res.json(updatedUser);
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    return res.status(500).json({ error: 'Erro ao atualizar dados' });
  }
});

// ✅ PUT /api/users/change-password - Alterar senha
router.put('/change-password', authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { currentPassword, newPassword } = req.body;

    // Validações
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres' });
    }

    // Buscar usuário com senha
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Verificar senha atual
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Senha atual incorreta' });
    }

    // Hash da nova senha
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Atualizar senha
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });

    return res.json({ message: 'Senha alterada com sucesso' });
  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    return res.status(500).json({ error: 'Erro ao alterar senha' });
  }
});

// ✅ PUT /api/users/preferences - Salvar preferências
router.put('/preferences', authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { emailNotifications, smsNotifications, whatsappNotifications, theme } = req.body;

    // Atualizar preferências
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        preferences: {
          emailNotifications: emailNotifications ?? true,
          smsNotifications: smsNotifications ?? false,
          whatsappNotifications: whatsappNotifications ?? true,
          theme: theme || 'light',
        }
      },
      select: {
        id: true,
        preferences: true,
      }
    });

    return res.json(updatedUser);
  } catch (error) {
    console.error('Erro ao salvar preferências:', error);
    return res.status(500).json({ error: 'Erro ao salvar preferências' });
  }
});

// ========================================
// ⚙️ ROTAS EXISTENTES (GESTÃO DE BARBEIROS)
// ========================================

// Listar usuários (barbeiros e admins da barbearia)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { 
        barbershopId: req.user!.barbershopId!,
        role: { in: ['admin', 'barber'] } // Apenas admins e barbeiros
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        role: true,
        active: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.json(users);
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    return res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});

// Buscar usuário por ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findFirst({
      where: { 
        id,
        barbershopId: req.user!.barbershopId! // Garantir que é da mesma barbearia
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        role: true,
        active: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    return res.json(user);
  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    return res.status(500).json({ error: 'Erro ao buscar usuário' });
  }
});

// Criar novo barbeiro (COM validação de limite)
router.post('/', authMiddleware, isAdmin, checkBarberLimit, async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;

    // Validações
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
    }

    // Validar role
    if (role && !['admin', 'barber'].includes(role)) {
      return res.status(400).json({ error: 'Role inválida. Use "admin" ou "barber"' });
    }

    // Verificar email duplicado
    const emailExists = await prisma.user.findUnique({
      where: { email }
    });

    if (emailExists) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Criar usuário
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        phone: phone || null,
        role: role || 'barber', // Default: barber
        barbershopId: req.user!.barbershopId!,
        active: true
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        role: true,
        active: true,
        createdAt: true
      }
    });

    return res.status(201).json(user);
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    return res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

// Atualizar usuário
router.put('/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, role, password } = req.body;

    // Verificar se o usuário existe e pertence à mesma barbearia
    const existingUser = await prisma.user.findFirst({
      where: { 
        id,
        barbershopId: req.user!.barbershopId!
      }
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Validar role
    if (role && !['admin', 'barber'].includes(role)) {
      return res.status(400).json({ error: 'Role inválida. Use "admin" ou "barber"' });
    }

    // Verificar email duplicado (se estiver mudando)
    if (email && email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email }
      });

      if (emailExists) {
        return res.status(400).json({ error: 'Email já cadastrado' });
      }
    }

    // Preparar dados para atualização
    const updateData: any = {
      name,
      email,
      phone: phone || null,
      role
    };

    // Se houver senha nova, fazer hash
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
      }
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Atualizar usuário
    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        role: true,
        active: true,
        createdAt: true
      }
    });

    return res.json(user);
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    return res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
});

// Ativar/Desativar usuário (toggle)
router.patch('/:id/toggle', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar se o usuário existe e pertence à mesma barbearia
    const existingUser = await prisma.user.findFirst({
      where: { 
        id,
        barbershopId: req.user!.barbershopId!
      }
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Não permitir desativar a si mesmo
    if (existingUser.id === req.user!.id) {
      return res.status(400).json({ error: 'Você não pode desativar sua própria conta' });
    }

    // Toggle active
    const user = await prisma.user.update({
      where: { id },
      data: { active: !existingUser.active },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        role: true,
        active: true,
        createdAt: true
      }
    });

    return res.json(user);
  } catch (error) {
    console.error('Erro ao alternar status:', error);
    return res.status(500).json({ error: 'Erro ao alterar status do usuário' });
  }
});

// Excluir usuário (soft delete - desativa)
router.delete('/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar se o usuário existe e pertence à mesma barbearia
    const existingUser = await prisma.user.findFirst({
      where: { 
        id,
        barbershopId: req.user!.barbershopId!
      }
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Não permitir excluir a si mesmo
    if (existingUser.id === req.user!.id) {
      return res.status(400).json({ error: 'Você não pode excluir sua própria conta' });
    }

    // Soft delete - apenas desativa
    await prisma.user.update({
      where: { id },
      data: { active: false }
    });

    return res.json({ message: 'Usuário desativado com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir usuário:', error);
    return res.status(500).json({ error: 'Erro ao excluir usuário' });
  }
});

export default router;