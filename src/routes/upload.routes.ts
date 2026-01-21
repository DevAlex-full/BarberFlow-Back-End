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

// Upload de avatar do usuário
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

export default router;