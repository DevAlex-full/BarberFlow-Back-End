import { Router } from 'express';
import { prisma } from '../config/prisma';
import { clientAuthMiddleware } from '../middlewares/client-auth.middleware';

const router = Router();

// ── GET /api/client/favorites ─────────────────────────────────────────────────
// Lista as barbearias favoritas do cliente autenticado
router.get('/', clientAuthMiddleware, async (req, res) => {
  try {
    const favorites = await prisma.clientFavorite.findMany({
      where: { clientId: req.client!.id },
      include: {
        barbershop: {
          select: {
            id:      true,
            name:    true,
            phone:   true,
            address: true,
            city:    true,
            state:   true,
            logo:    true,
            plan:    true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Retorna o objeto da barbearia diretamente (id = barbershopId)
    const result = favorites.map(f => ({ ...f.barbershop }));
    return res.json(result);
  } catch (error) {
    console.error('❌ [FAVORITES] Erro ao listar:', error);
    return res.status(500).json({ error: 'Erro ao buscar favoritos' });
  }
});

// ── POST /api/client/favorites ────────────────────────────────────────────────
router.post('/', clientAuthMiddleware, async (req, res) => {
  try {
    const { barbershopId } = req.body;
    if (!barbershopId) {
      return res.status(400).json({ error: 'barbershopId é obrigatório' });
    }

    const barbershop = await prisma.barbershop.findUnique({ where: { id: barbershopId } });
    if (!barbershop) {
      return res.status(404).json({ error: 'Barbearia não encontrada' });
    }

    const favorite = await prisma.clientFavorite.upsert({
      where: { clientId_barbershopId: { clientId: req.client!.id, barbershopId } },
      create: { clientId: req.client!.id, barbershopId },
      update: {},
    });

    console.log(`✅ [FAVORITES] Adicionado: client=${req.client!.id} shop=${barbershopId}`);
    return res.status(201).json({ message: 'Adicionado aos favoritos', id: favorite.id });
  } catch (error) {
    console.error('❌ [FAVORITES] Erro ao adicionar:', error);
    return res.status(500).json({ error: 'Erro ao adicionar favorito' });
  }
});

// ── DELETE /api/client/favorites/:barbershopId ────────────────────────────────
router.delete('/:barbershopId', clientAuthMiddleware, async (req, res) => {
  try {
    const { barbershopId } = req.params;

    await prisma.clientFavorite.deleteMany({
      where: { clientId: req.client!.id, barbershopId },
    });

    console.log(`✅ [FAVORITES] Removido: client=${req.client!.id} shop=${barbershopId}`);
    return res.json({ message: 'Removido dos favoritos' });
  } catch (error) {
    console.error('❌ [FAVORITES] Erro ao remover:', error);
    return res.status(500).json({ error: 'Erro ao remover favorito' });
  }
});

export default router;