import { Router } from 'express';
import { prisma } from '../config/prisma';

const router = Router();

// Buscar todas barbearias ativas (apenas as que pagam)
router.get('/barbershops', async (req, res) => {
  try {
    const { search, city, state } = req.query;

    const now = new Date();

    const where: any = {
      active: true,
      // ✅ Apenas barbearias com plano ativo e não expirado
      planStatus: 'active',
      OR: [
        // Trial ainda dentro do prazo
        {
          plan: 'trial',
          trialEndsAt: { gte: now }
        },
        // Plano pago dentro do prazo
        {
          plan: { not: 'trial' },
          planExpiresAt: { gte: now }
        }
      ]
    };

    if (search) {
      where.AND = [
        {
          OR: [
            { name: { contains: search as string, mode: 'insensitive' } },
            { city: { contains: search as string, mode: 'insensitive' } },
          ]
        }
      ];
    }

    if (city)  where.city  = { contains: city  as string, mode: 'insensitive' };
    if (state) where.state = state;

    const barbershops = await prisma.barbershop.findMany({
      where,
      select: {
        id:        true,
        name:      true,
        slug:      true,
        phone:     true,
        address:   true,
        city:      true,
        state:     true,
        logo:      true,
        // ✅ D2: campo 'plan' removido — dado comercialmente sensível
        // não deve ser exposto em rota pública (qualquer pessoa conseguia saber
        // se a barbearia concorrente pagava Basic ou Enterprise)
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });

    return res.json(barbershops);
  } catch (error) {
    console.error('❌ [PUBLIC] Erro ao buscar barbearias:', error);
    return res.status(500).json({ error: 'Erro ao buscar barbearias' });
  }
});

// ✅ Buscar detalhes de uma barbearia específica COM CONFIG E LOCALIZAÇÃO
router.get('/barbershops/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    const barbershop = await prisma.barbershop.findFirst({
      where: {
        active: true,
        ...(isUUID ? { id } : { slug: id })
      },
      select: {
        // ✅ Dados básicos
        id:     true,
        name:   true,
        logo:   true,
        address: true,
        city:   true,
        state:  true,
        phone:  true,
        // ✅ D2: campo 'plan' removido — dado sensível não exposto publicamente
        active: true,

        // ✅ LOCALIZAÇÃO COMPLETA
        zipCode:      true,
        neighborhood: true,
        number:       true,
        complement:   true,
        latitude:     true,
        longitude:    true,

        // ✅ CONFIGURAÇÕES DA LANDING PAGE
        heroImage:         true,
        heroTitle:         true,
        heroSubtitle:      true,
        description:       true,
        galleryImages:     true,
        businessHours:     true,
        instagramUrl:      true,
        facebookUrl:       true,
        whatsappNumber:    true,
        youtubeUrl:        true,
        primaryColor:      true,
        secondaryColor:    true,
        showTeam:          true,
        showGallery:       true,
        showReviews:       true,
        allowOnlineBooking: true,

        // ✅ Serviços e equipe
        services: {
          where: { active: true },
          select: {
            id:          true,
            name:        true,
            description: true,
            price:       true,
            duration:    true,
          },
        },
        users: {
          where: { active: true },
          select: {
            id:     true,
            name:   true,
            avatar: true,
            role:   true,
          },
        },
      },
    });

    if (!barbershop) {
      return res.status(404).json({ error: 'Barbearia não encontrada' });
    }

    // ✅ Estruturar a resposta com todos os dados
    // ✅ D2: campo 'plan' removido do objeto de resposta
    const response = {
      id:      barbershop.id,
      name:    barbershop.name,
      logo:    barbershop.logo,
      address: barbershop.address,
      city:    barbershop.city,
      state:   barbershop.state,
      phone:   barbershop.phone,
      active:  barbershop.active,

      // ✅ LOCALIZAÇÃO COMPLETA
      zipCode:      barbershop.zipCode,
      neighborhood: barbershop.neighborhood,
      number:       barbershop.number,
      complement:   barbershop.complement,
      latitude:     barbershop.latitude,
      longitude:    barbershop.longitude,

      services: barbershop.services,
      users:    barbershop.users,

      // ✅ Configurações da landing page agrupadas em 'config'
      config: {
        heroImage:         barbershop.heroImage,
        heroTitle:         barbershop.heroTitle,
        heroSubtitle:      barbershop.heroSubtitle,
        description:       barbershop.description,
        galleryImages:     barbershop.galleryImages,
        businessHours:     barbershop.businessHours,
        instagramUrl:      barbershop.instagramUrl,
        facebookUrl:       barbershop.facebookUrl,
        whatsappNumber:    barbershop.whatsappNumber,
        youtubeUrl:        barbershop.youtubeUrl,
        primaryColor:      barbershop.primaryColor,
        secondaryColor:    barbershop.secondaryColor,
        showTeam:          barbershop.showTeam,
        showGallery:       barbershop.showGallery,
        showReviews:       barbershop.showReviews,
        allowOnlineBooking: barbershop.allowOnlineBooking,
      }
    };

    return res.json(response);
  } catch (error) {
    console.error('❌ [PUBLIC] Erro ao buscar barbearia:', error);
    return res.status(500).json({ error: 'Erro ao buscar barbearia' });
  }
});

// ✅ Buscar horários disponíveis COM TIMEZONE EXPLÍCITO DE BRASÍLIA
router.get('/barbershops/:id/available-times', async (req, res) => {
  try {
    const { id } = req.params;
    const { date, barberId, serviceId } = req.query;

    if (!date || !serviceId) {
      return res.status(400).json({ error: 'Data e serviço são obrigatórios' });
    }

    // Buscar duração do serviço
    const service = await prisma.service.findUnique({
      where: { id: serviceId as string },
    });

    if (!service) {
      return res.status(404).json({ error: 'Serviço não encontrado' });
    }

    // ✅ Criar datas EXPLICITAMENTE em horário de Brasília
    const dateStr = date as string;

    const startDate = new Date(`${dateStr}T03:00:00.000Z`);
    const endDate   = new Date(`${dateStr}T03:00:00.000Z`);

    startDate.setUTCHours(3,  0,  0,   0);
    endDate.setUTCHours(26, 59, 59, 999);

    const appointments = await prisma.appointment.findMany({
      where: {
        barbershopId: id,
        barberId:     barberId as string,
        date:         { gte: startDate, lte: endDate },
        status:       { not: 'cancelled' },
      },
      select: {
        date:    true,
        service: { select: { duration: true } },
      },
    });

    // ✅ Buscar businessHours
    const barbershop = await prisma.barbershop.findUnique({
      where:  { id },
      select: { businessHours: true }
    });

    // ✅ Determinar dia da semana baseado na data BRASILEIRA
    const [year, month, day] = dateStr.split('-').map(Number);
    const localDate  = new Date(year, month - 1, day);
    const dayOfWeek  = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][localDate.getDay()];

    const businessHours = barbershop?.businessHours as any || {};
    const dayHours      = businessHours[dayOfWeek] || '09:00-18:00';

    if (dayHours.toLowerCase() === 'fechado' || !dayHours) {
      return res.json([]);
    }

    const [startTime, endTime]             = dayHours.split('-');
    const [workStartHour, workStartMin]    = startTime.split(':').map(Number);
    const [workEndHour,   workEndMin]      = endTime.split(':').map(Number);

    const availableTimes: string[] = [];

    // ✅ Obter hora atual no horário de Brasília
    const nowBrasilia = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));

    let currentHour   = workStartHour;
    let currentMinute = workStartMin;

    while (
      currentHour < workEndHour ||
      (currentHour === workEndHour && currentMinute < workEndMin)
    ) {
      const timeSlotUTC = new Date(Date.UTC(year, month - 1, day, currentHour + 3, currentMinute, 0, 0));
      const timeSlotBrasilia = new Date(timeSlotUTC.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));

      if (timeSlotBrasilia > nowBrasilia) {
        const hasConflict = appointments.some((apt) => {
          const aptStart = new Date(apt.date);
          const aptEnd   = new Date(aptStart.getTime() + apt.service.duration * 60000);
          const slotEnd  = new Date(timeSlotUTC.getTime() + service.duration * 60000);

          return (
            (timeSlotUTC >= aptStart && timeSlotUTC < aptEnd) ||
            (slotEnd > aptStart && slotEnd <= aptEnd)         ||
            (timeSlotUTC <= aptStart && slotEnd >= aptEnd)
          );
        });

        if (!hasConflict) {
          availableTimes.push(timeSlotUTC.toISOString());
        }
      }

      currentMinute += 30;
      if (currentMinute >= 60) {
        currentMinute  = 0;
        currentHour   += 1;
      }
    }

    return res.json(availableTimes);
  } catch (error) {
    console.error('❌ [PUBLIC] Erro ao buscar horários disponíveis:', error);
    return res.status(500).json({ error: 'Erro ao buscar horários disponíveis' });
  }
});

export default router;