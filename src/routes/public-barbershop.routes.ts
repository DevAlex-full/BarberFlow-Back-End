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
      hasLocation: !!barbershop.latitude && !!barbershop.longitude,
    });

    return res.json(response);
  } catch (error) {
    console.error('❌ [PUBLIC] Erro ao buscar barbearia:', error);
    return res.status(500).json({ error: 'Erro ao buscar barbearia' });
  }
});

// ✅ FIX DEFINITIVO: Buscar horários disponíveis com TIMEZONE CORRETO
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

    // ✅ CORREÇÃO CRÍTICA: Criar data no horário de Brasília (UTC-3)
    // Formato recebido: "2026-01-31" (YYYY-MM-DD)
    const [year, month, day] = (date as string).split('-').map(Number);
    
    // ✅ Criar data às 00:00:00 no horário LOCAL de Brasília
    const startDate = new Date(year, month - 1, day, 0, 0, 0, 0);
    const endDate = new Date(year, month - 1, day, 23, 59, 59, 999);

    console.log(`📅 [PUBLIC] Data processada:`, {
      recebida: date,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      startLocal: startDate.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      endLocal: endDate.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    });

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
    
    // ✅ CORREÇÃO: Obter hora atual no horário de Brasília
    const now = new Date();
    const nowBrasil = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));

    // ✅ CORREÇÃO CRÍTICA: Loop apenas dentro do horário de funcionamento
    // Começar do horário de abertura e ir até o horário de fechamento
    let currentHour = workStartHour;
    let currentMinute = workStartMin;

    while (
      currentHour < workEndHour || 
      (currentHour === workEndHour && currentMinute < workEndMin)
    ) {
      // ✅ Criar objeto Date no horário LOCAL de Brasília
      const timeSlot = new Date(year, month - 1, day, currentHour, currentMinute, 0, 0);

      // ✅ Não permitir horários no passado
      if (timeSlot > nowBrasil) {
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

      // ✅ Incrementar 30 minutos
      currentMinute += 30;
      if (currentMinute >= 60) {
        currentMinute = 0;
        currentHour += 1;
      }
    }

    console.log(`✅ [PUBLIC] ${availableTimes.length} horários disponíveis`);
    
    // ✅ LOG: Mostrar os primeiros e últimos horários para debug
    if (availableTimes.length > 0) {
      const firstTime = new Date(availableTimes[0]).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const lastTime = new Date(availableTimes[availableTimes.length - 1]).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      console.log(`⏰ [PUBLIC] Primeiro horário: ${firstTime}`);
      console.log(`⏰ [PUBLIC] Último horário: ${lastTime}`);
    }

    return res.json(availableTimes);
  } catch (error) {
    console.error('❌ [PUBLIC] Erro ao buscar horários disponíveis:', error);
    return res.status(500).json({ error: 'Erro ao buscar horários disponíveis' });
  }
});

export default router;