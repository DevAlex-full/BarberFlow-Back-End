import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// 📦 GET /api/packages
router.get('/', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { status, customerId, search } = req.query;

    const where: any = { barbershopId };
    if (status)     where.status     = status as string;
    if (customerId) where.customerId = customerId as string;
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { customer: { name: { contains: search as string, mode: 'insensitive' } } },
        { client:   { name: { contains: search as string, mode: 'insensitive' } } }
      ];
    }

    const packages = await prisma.customerPackage.findMany({
      where,
      include: {
        customer: { select: { name: true, phone: true } },
        client:   { select: { name: true, phone: true } },
        usages:   { orderBy: { usedAt: 'desc' } }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Auto-expirar pacotes vencidos
    const now      = new Date();
    const toExpire = packages.filter(p => p.status === 'active' && new Date(p.expirationDate) < now);
    if (toExpire.length > 0) {
      await prisma.customerPackage.updateMany({
        where: { id: { in: toExpire.map(p => p.id) } },
        data:  { status: 'expired' }
      });
      toExpire.forEach(p => { p.status = 'expired'; });
    }

    return res.json(packages);
  } catch (error) {
    console.error('Erro ao listar pacotes:', error);
    return res.status(500).json({ error: 'Erro ao listar pacotes' });
  }
});

// 📊 GET /api/packages/summary
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const packages = await prisma.customerPackage.findMany({ where: { barbershopId } });

    const active        = packages.filter(p => p.status === 'active').length;
    const expired       = packages.filter(p => p.status === 'expired').length;
    const completed     = packages.filter(p => p.status === 'completed').length;
    const cancelled     = packages.filter(p => p.status === 'cancelled').length;
    const totalRevenue  = packages.reduce((s, p) => s + Number(p.price), 0);
    const totalCuts     = packages.reduce((s, p) => s + p.totalCuts, 0);
    const usedCuts      = packages.reduce((s, p) => s + p.usedCuts, 0);
    const remainingCuts = totalCuts - usedCuts;

    return res.json({ active, expired, completed, cancelled, totalRevenue, totalCuts, usedCuts, remainingCuts });
  } catch (error) {
    console.error('Erro ao buscar resumo:', error);
    return res.status(500).json({ error: 'Erro ao buscar resumo de pacotes' });
  }
});

// 🔍 GET /api/packages/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id }       = req.params;
    const barbershopId = req.user!.barbershopId!;

    const pkg = await prisma.customerPackage.findFirst({
      where: { id, barbershopId },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        client:   { select: { id: true, name: true, phone: true, email: true } },
        usages:   { orderBy: { usedAt: 'desc' } }
      }
    });

    if (!pkg) return res.status(404).json({ error: 'Pacote não encontrado' });
    return res.json(pkg);
  } catch (error) {
    console.error('Erro ao buscar pacote:', error);
    return res.status(500).json({ error: 'Erro ao buscar pacote' });
  }
});

// ➕ POST /api/packages
router.post('/', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;
    const { customerId, clientId, name, description, totalCuts, price, startDate, expirationDate, includedServices, notes } = req.body;

    if (!name || !totalCuts || !price || !startDate || !expirationDate) {
      return res.status(400).json({ error: 'Campos obrigatórios: name, totalCuts, price, startDate, expirationDate' });
    }

    const pkg = await prisma.customerPackage.create({
      data: {
        barbershopId,
        customerId:       customerId       || null,
        clientId:         clientId         || null,
        name,
        description:      description      || null,
        totalCuts:        Number(totalCuts),
        price:            Number(price),
        startDate:        new Date(startDate),
        expirationDate:   new Date(expirationDate),
        includedServices: includedServices || null,
        notes:            notes            || null,
        status: 'active'
      },
      include: {
        customer: { select: { name: true, phone: true } },
        client:   { select: { name: true, phone: true } }
      }
    });

    return res.status(201).json(pkg);
  } catch (error) {
    console.error('Erro ao criar pacote:', error);
    return res.status(500).json({ error: 'Erro ao criar pacote' });
  }
});

// ✂️ POST /api/packages/:id/use — Registrar corte
// ✅ A cada corte: receita proporcional + comissão vai imediatamente pro barbeiro que cortou
router.post('/:id/use', authMiddleware, async (req, res) => {
  try {
    const { id }       = req.params;
    const barbershopId = req.user!.barbershopId!;
    const { appointmentId, barberId, notes } = req.body;

    // ✅ barberId obrigatório
    if (!barberId) {
      return res.status(400).json({ error: 'Informe qual barbeiro realizou este corte' });
    }

    // Buscar barbeiro para saber o percentual de comissão
    const barber = await prisma.user.findUnique({
      where:  { id: barberId },
      select: { id: true, name: true, commissionPercentage: true }
    });
    if (!barber) return res.status(404).json({ error: 'Barbeiro não encontrado' });

    const pkg = await prisma.customerPackage.findFirst({ where: { id, barbershopId } });
    if (!pkg)                    return res.status(404).json({ error: 'Pacote não encontrado' });
    if (pkg.status !== 'active') return res.status(400).json({ error: `Pacote ${pkg.status === 'expired' ? 'expirado' : 'não está ativo'}` });
    if (pkg.usedCuts >= pkg.totalCuts) return res.status(400).json({ error: 'Todos os cortes já foram utilizados' });

    const newUsedCuts  = pkg.usedCuts + 1;
    const isCompleted  = newUsedCuts >= pkg.totalCuts;

    // ✅ Valor proporcional por corte: ex. R$100 / 4 cortes = R$25 por corte
    const valuePerCut      = Number(pkg.price) / pkg.totalCuts;
    const commissionAmount = valuePerCut * ((barber.commissionPercentage || 40) / 100);

    // Nome do cliente para descrição
    const pkgWithClient = await prisma.customerPackage.findFirst({
      where:   { id },
      include: { customer: { select: { name: true } }, client: { select: { name: true } } }
    });
    const clientLabel = pkgWithClient?.customer?.name || pkgWithClient?.client?.name || 'Cliente';
    const cutLabel    = `${newUsedCuts}/${pkg.totalCuts}`;

    // Tudo em uma transaction do banco
    const [updatedPkg, usage] = await prisma.$transaction([
      // 1. Atualizar pacote
      prisma.customerPackage.update({
        where: { id },
        data: {
          usedCuts:  newUsedCuts,
          lastCutAt: new Date(),
          status:    isCompleted ? 'completed' : 'active'
        }
      }),

      // 2. Criar registro de uso com barbeiro
      prisma.packageUsage.create({
        data: {
          packageId:     id,
          appointmentId: appointmentId || null,
          barberId:      barberId,
          notes:         notes         || null
        }
      })
    ]);

    // 3. Criar transação de receita proporcional no financeiro
    await prisma.transaction.create({
      data: {
        barbershopId,
        type:          'income',
        category:      'service',
        description:   `Pacote ${pkg.name} — corte ${cutLabel} — ${clientLabel} (${barber.name})`,
        amount:        valuePerCut,
        date:          new Date(),
        paymentMethod: 'cash',
        status:        'completed',
        barberId:      barberId,
        serviceName:   pkg.name
      }
    });

    // 4. Criar/atualizar comissão do barbeiro no mês atual
    const now            = new Date();
    const referenceMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const existingComm = await prisma.commission.findFirst({
      where: { barberId, barbershopId, referenceMonth }
    });

    if (existingComm) {
      await prisma.commission.update({
        where: { id: existingComm.id },
        data:  { amount: Number(existingComm.amount) + commissionAmount }
      });
    } else {
      await prisma.commission.create({
        data: {
          barberId,
          barbershopId,
          percentage:     barber.commissionPercentage || 40,
          amount:         commissionAmount,
          referenceMonth,
          status:         'pending'
        }
      });
    }

    return res.json({
      package:       updatedPkg,
      usage,
      remaining:     pkg.totalCuts - newUsedCuts,
      completed:     isCompleted,
      valueThisCut:  valuePerCut,
      commission:    commissionAmount,
      message:       isCompleted
        ? `✅ Pacote concluído! R$ ${valuePerCut.toFixed(2)} registrado para ${barber.name}.`
        : `✂️ Corte ${cutLabel} registrado! R$ ${valuePerCut.toFixed(2)} para ${barber.name}. Restam ${pkg.totalCuts - newUsedCuts}.`
    });
  } catch (error) {
    console.error('Erro ao registrar uso:', error);
    return res.status(500).json({ error: 'Erro ao registrar uso do pacote' });
  }
});

// ✏️ PUT /api/packages/:id
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id }       = req.params;
    const barbershopId = req.user!.barbershopId!;
    const { name, description, expirationDate, includedServices, notes, status } = req.body;

    const existing = await prisma.customerPackage.findFirst({ where: { id, barbershopId } });
    if (!existing) return res.status(404).json({ error: 'Pacote não encontrado' });

    const pkg = await prisma.customerPackage.update({
      where: { id },
      data: {
        name,
        description,
        expirationDate: expirationDate ? new Date(expirationDate) : undefined,
        includedServices,
        notes,
        status
      }
    });

    return res.json(pkg);
  } catch (error) {
    console.error('Erro ao atualizar pacote:', error);
    return res.status(500).json({ error: 'Erro ao atualizar pacote' });
  }
});

// 🗑️ DELETE /api/packages/:id — Cancelar
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id }       = req.params;
    const barbershopId = req.user!.barbershopId!;

    const existing = await prisma.customerPackage.findFirst({ where: { id, barbershopId } });
    if (!existing) return res.status(404).json({ error: 'Pacote não encontrado' });

    await prisma.customerPackage.update({ where: { id }, data: { status: 'cancelled' } });
    return res.json({ message: 'Pacote cancelado' });
  } catch (error) {
    console.error('Erro ao cancelar pacote:', error);
    return res.status(500).json({ error: 'Erro ao cancelar pacote' });
  }
});

export default router;