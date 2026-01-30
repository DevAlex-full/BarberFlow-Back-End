import { Router } from 'express';
import { prisma } from '../config/prisma';

const router = Router();

// Buscar todas barbearias ativas (apenas as que pagam)
router.get('/barbershops', async (req, res) => {
  try {
    const { search, city, state } = req.query;

    const where: any = {
      active: true,
    };

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { city: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    if (city) {
      where.city = { contains: city as string, mode: 'insensitive' };
    }

    if (state) {
      where.state = state;
    }

    const barbershops = await prisma.barbershop.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        logo: true,
        plan: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });

    console.log(`✅ [PUBLIC] ${barbershops.length} barbearias encontradas`);

    return res.json(barbershops);
  } catch (error) {
    console.error('❌ [PUBLIC] Erro ao buscar barbearias:', error);
    return res.status(500).json({ error: 'Erro ao buscar barbearias' });
  }
});

// ✅ CORRIGIDO: Buscar detalhes de uma barbearia específica COM CONFIG E LOCALIZAÇÃO
router.get('/barbershops/:id', async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`🔍 [PUBLIC] Buscando barbearia: ${id}`);

    const barbershop = await prisma.barbershop.findUnique({
      where: {
        id,
        active: true
      },
      select: {
        // ✅ Dados básicos
        id: true,
        name: true,
        logo: true,
        address: true,
        city: true,
        state: true,
        phone: true,
        plan: true,
        active: true,

        // ✅ LOCALIZAÇÃO COMPLETA (ADICIONADO - FIX DO BUG!)
        zipCode: true,
        neighborhood: true,
        number: true,
        complement: true,
        latitude: true,
        longitude: true,

        // ✅ CONFIGURAÇÕES DA LANDING PAGE
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

        // ✅ Serviços e equipe
        services: {
          where: { active: true },
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            duration: true,
          },
        },
        users: {
          where: { active: true },
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
          },
        },
      },
    });

    if (!barbershop) {
      console.log(`❌ [PUBLIC] Barbearia não encontrada: ${id}`);
      return res.status(404).json({ error: 'Barbearia não encontrada' });
    }

    // ✅ Estruturar a resposta com todos os dados
    const response = {
      id: barbershop.id,
      name: barbershop.name,
      logo: barbershop.logo,
      address: barbershop.address,
      city: barbershop.city,
      state: barbershop.state,
      phone: barbershop.phone,
      plan: barbershop.plan,
      active: barbershop.active,

      // ✅ LOCALIZAÇÃO COMPLETA (ADICIONADO - FIX DO BUG!)
      zipCode: barbershop.zipCode,
      neighborhood: barbershop.neighborhood,
      number: barbershop.number,
      complement: barbershop.complement,
      latitude: barbershop.latitude,
      longitude: barbershop.longitude,

      services: barbershop.services,
      users: barbershop.users,

      // ✅ Agrupar configurações da landing page em um objeto "config"
      config: {
        heroImage: barbershop.heroImage,
        heroTitle: barbershop.heroTitle,
        heroSubtitle: barbershop.heroSubtitle,
        description: barbershop.description,
        galleryImages: barbershop.galleryImages,
        businessHours: barbershop.businessHours,
        instagramUrl: barbershop.instagramUrl,
        facebookUrl: barbershop.facebookUrl,
        whatsappNumber: barbershop.whatsappNumber,
        youtubeUrl: barbershop.youtubeUrl,
        primaryColor: barbershop.primaryColor,
        secondaryColor: barbershop.secondaryColor,
        showTeam: barbershop.showTeam,
        showGallery: barbershop.showGallery,
        showReviews: barbershop.showReviews,
        allowOnlineBooking: barbershop.allowOnlineBooking,
      }
    };

    console.log(`✅ [PUBLIC] Barbearia encontrada:`, {
      name: barbershop.name,
      services: barbershop.services.length,
      users: barbershop.users.length,
      hasConfig: !!barbershop.heroTitle || !!barbershop.description,
      hasLocation: !!barbershop.latitude && !!barbershop.longitude, // LOG ADICIONADO
    });

    return res.json(response);
  } catch (error) {
    console.error('❌ [PUBLIC] Erro ao buscar barbearia:', error);
    return res.status(500).json({ error: 'Erro ao buscar barbearia' });
  }
});

// Buscar horários disponíveis
router.get('/barbershops/:id/available-times', async (req, res) => {
  try {
    const { id } = req.params;
    const { date, barberId, serviceId } = req.query;

    console.log(`🕐 [PUBLIC] Buscando horários:`, { id, date, barberId, serviceId });

    if (!date || !serviceId) {
      return res.status(400).json({ error: 'Data e serviço são obrigatórios' });
    }

    // Buscar duração do serviço
    const service = await prisma.service.findUnique({
      where: { id: serviceId as string },
    });

    if (!service) {
      console.log(`❌ [PUBLIC] Serviço não encontrado: ${serviceId}`);
      return res.status(404).json({ error: 'Serviço não encontrado' });
    }

    // Buscar agendamentos do dia
    const startDate = new Date(date as string);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(date as string);
    endDate.setHours(23, 59, 59, 999);

    const appointments = await prisma.appointment.findMany({
      where: {
        barbershopId: id,
        barberId: barberId as string,
        date: {
          gte: startDate,
          lte: endDate,
        },
        status: { not: 'cancelled' },
      },
      select: {
        date: true,
        service: { select: { duration: true } },
      },
    });

    console.log(`📅 [PUBLIC] ${appointments.length} agendamentos existentes nesta data`);

    // ✅ Buscar businessHours
    const barbershop = await prisma.barbershop.findUnique({
      where: { id },
      select: { businessHours: true }
    });

    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][startDate.getDay()];
    const businessHours = barbershop?.businessHours as any || {};
    const dayHours = businessHours[dayOfWeek] || '09:00-18:00';

    if (dayHours.toLowerCase() === 'fechado' || !dayHours) {
      console.log(`🚫 [PUBLIC] Barbearia fechada em ${dayOfWeek}`);
      return res.json([]);
    }

    const [startTime, endTime] = dayHours.split('-');
    const [workStartHour, workStartMin] = startTime.split(':').map(Number);
    const [workEndHour, workEndMin] = endTime.split(':').map(Number);

    console.log(`⏰ [PUBLIC] Horários de ${dayOfWeek}: ${startTime} até ${endTime}`);

    const availableTimes: string[] = [];
    const now = new Date();
    const nowBrasil = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));

    // ✅ Calcular início e fim em minutos (desde meia-noite)
    const startMinutes = workStartHour * 60 + workStartMin;
    const endMinutes = workEndHour * 60 + workEndMin;

    // ✅ Loop de 0 a 23 horas
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const slotMinutes = hour * 60 + minute;

        // ✅ Verificar se está dentro do horário de funcionamento
        if (slotMinutes < startMinutes || slotMinutes >= endMinutes) continue;

        const timeSlot = new Date(startDate);
        timeSlot.setHours(hour, minute, 0, 0);

        // ✅ Não permitir horários no passado
        if (timeSlot <= nowBrasil) continue;

        // ✅ Verificar conflitos com agendamentos existentes
        const hasConflict = appointments.some((apt) => {
          const aptStart = new Date(apt.date);
          const aptEnd = new Date(aptStart.getTime() + apt.service.duration * 60000);
          const slotEnd = new Date(timeSlot.getTime() + service.duration * 60000);

          return (
            (timeSlot >= aptStart && timeSlot < aptEnd) ||
            (slotEnd > aptStart && slotEnd <= aptEnd) ||
            (timeSlot <= aptStart && slotEnd >= aptEnd)
          );
        });

        if (!hasConflict) {
          availableTimes.push(timeSlot.toISOString());
        }
      }
    }

    console.log(`✅ [PUBLIC] ${availableTimes.length} horários disponíveis`);

    return res.json(availableTimes);
  } catch (error) {
    console.error('❌ [PUBLIC] Erro ao buscar horários disponíveis:', error);
    return res.status(500).json({ error: 'Erro ao buscar horários disponíveis' });
  }
});

export default router;