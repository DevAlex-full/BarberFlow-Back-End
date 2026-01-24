import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware, isAdmin } from '../middlewares/auth.middleware';

const router = Router();

// Buscar dados da barbearia
router.get('/', authMiddleware, async (req, res) => {
  try {
    const barbershop = await prisma.barbershop.findUnique({
      where: { id: req.user!.barbershopId! },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            phone: true,
            active: true,
            avatar: true // ✅ ADICIONADO: Campo avatar
          }
        }
      }
    });

    if (!barbershop) {
      return res.status(404).json({ error: 'Barbearia não encontrada' });
    }

    return res.json(barbershop);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao buscar barbearia' });
  }
});

// Atualizar dados da barbearia
router.put('/', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { name, phone, address, city, state } = req.body;

    const barbershop = await prisma.barbershop.update({
      where: { id: req.user!.barbershopId! },
      data: { name, phone, address, city, state }
    });

    return res.json(barbershop);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao atualizar barbearia' });
  }
});

// ===== ROTAS DE CONFIGURAÇÃO DA LANDING PAGE =====

// Buscar configurações da landing page
router.get('/config', authMiddleware, async (req, res) => {
  try {
    const barbershop = await prisma.barbershop.findUnique({
      where: { id: req.user!.barbershopId! },
      select: {
        heroImage: true,
        heroTitle: true,
        heroSubtitle: true,
        description: true,
        galleryImages: true,
        businessHours: true,
        instagramUrl: true,
        facebookUrl: true,
        whatsappNumber: true,
        youtubeUrl: true,
        primaryColor: true,
        secondaryColor: true,
        showTeam: true,
        showGallery: true,
        showReviews: true,
        allowOnlineBooking: true,
      }
    });

    if (!barbershop) {
      return res.status(404).json({ error: 'Barbearia não encontrada' });
    }

    return res.json(barbershop);
  } catch (error) {
    console.error('Erro ao buscar configurações:', error);
    return res.status(500).json({ error: 'Erro ao buscar configurações' });
  }
});

// Atualizar configurações da landing page
router.put('/config', authMiddleware, async (req, res) => {
  try {
    const {
      heroImage,
      heroTitle,
      heroSubtitle,
      description,
      galleryImages,
      businessHours,
      instagramUrl,
      facebookUrl,
      whatsappNumber,
      youtubeUrl,
      primaryColor,
      secondaryColor,
      showTeam,
      showGallery,
      showReviews,
      allowOnlineBooking,
    } = req.body;

    // Validações básicas
    if (galleryImages && !Array.isArray(galleryImages)) {
      return res.status(400).json({ error: 'galleryImages deve ser um array' });
    }

    if (businessHours && typeof businessHours !== 'object') {
      return res.status(400).json({ error: 'businessHours deve ser um objeto' });
    }

    // Validar cores (hex)
    const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (primaryColor && !hexColorRegex.test(primaryColor)) {
      return res.status(400).json({ error: 'primaryColor deve ser uma cor hex válida (ex: #2563eb)' });
    }
    if (secondaryColor && !hexColorRegex.test(secondaryColor)) {
      return res.status(400).json({ error: 'secondaryColor deve ser uma cor hex válida (ex: #7c3aed)' });
    }

    const barbershop = await prisma.barbershop.update({
      where: { id: req.user!.barbershopId! },
      data: {
        heroImage,
        heroTitle,
        heroSubtitle,
        description,
        galleryImages: galleryImages || [],
        businessHours: businessHours || {
          monday: '09:00-20:00',
          tuesday: '09:00-20:00',
          wednesday: '09:00-20:00',
          thursday: '09:00-20:00',
          friday: '09:00-20:00',
          saturday: '09:00-18:00',
          sunday: 'Fechado'
        },
        instagramUrl,
        facebookUrl,
        whatsappNumber,
        youtubeUrl,
        primaryColor: primaryColor || '#2563eb',
        secondaryColor: secondaryColor || '#7c3aed',
        showTeam: showTeam !== undefined ? showTeam : true,
        showGallery: showGallery !== undefined ? showGallery : true,
        showReviews: showReviews !== undefined ? showReviews : true,
        allowOnlineBooking: allowOnlineBooking !== undefined ? allowOnlineBooking : true,
      },
      select: {
        id: true,
        heroImage: true,
        heroTitle: true,
        heroSubtitle: true,
        description: true,
        galleryImages: true,
        businessHours: true,
        instagramUrl: true,
        facebookUrl: true,
        whatsappNumber: true,
        youtubeUrl: true,
        primaryColor: true,
        secondaryColor: true,
        showTeam: true,
        showGallery: true,
        showReviews: true,
        allowOnlineBooking: true,
      }
    });

    return res.json(barbershop);
  } catch (error) {
    console.error('Erro ao atualizar configurações:', error);
    return res.status(500).json({ error: 'Erro ao atualizar configurações' });
  }
});

export default router;