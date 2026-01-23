import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';
import { upload } from '../config/multer';

const router = Router();

// Upload de logo da barbearia
router.post('/barbershop-logo', authMiddleware, upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const logoUrl = `/uploads/${req.file.filename}`;

    const barbershop = await prisma.barbershop.update({
      where: { id: req.user!.barbershopId! },
      data: { logo: logoUrl }
    });

    return res.json({ 
      message: 'Logo atualizado com sucesso',
      logoUrl: logoUrl 
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao fazer upload do logo' });
  }
});

// ✅ Upload de avatar do usuário (próprio avatar)
router.post('/user-avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const avatarUrl = `/uploads/${req.file.filename}`;

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { avatar: avatarUrl }
    });

    return res.json({ 
      message: 'Avatar atualizado com sucesso',
      avatarUrl: avatarUrl 
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao fazer upload do avatar' });
  }
});

// ✅ NOVA ROTA: Upload de avatar de qualquer usuário (admin pode alterar avatar dos barbeiros)
router.post('/user-avatar/:userId', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const { userId } = req.params;
    const avatarUrl = `/uploads/${req.file.filename}`;

    // Verificar se o usuário pertence à mesma barbearia
    const targetUser = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (targetUser.barbershopId !== req.user!.barbershopId) {
      return res.status(403).json({ error: 'Sem permissão para alterar este usuário' });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarUrl }
    });

    return res.json({ 
      message: 'Avatar atualizado com sucesso',
      avatarUrl: avatarUrl 
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao fazer upload do avatar' });
  }
});

export default router;