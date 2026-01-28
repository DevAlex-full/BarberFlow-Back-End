import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware, isAdmin } from '../middlewares/auth.middleware';
import { geolocationService } from '../services/geolocation.service';
import axios from 'axios';

const router = Router();

// ===== BUSCAR BARBEARIAS PRÓXIMAS (PÚBLICO) =====
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = '10' } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude e longitude são obrigatórios' });
    }

    const latitude = parseFloat(lat as string);
    const longitude = parseFloat(lng as string);
    const radiusKm = parseFloat(radius as string);

    // Validar coordenadas
    if (!geolocationService.isValidCoordinates(latitude, longitude)) {
      return res.status(400).json({ error: 'Coordenadas inválidas' });
    }

    // Buscar todas as barbearias ativas com coordenadas
    const barbershops = await prisma.barbershop.findMany({
      where: {
        active: true,
        planStatus: 'active',
        latitude: { not: null },
        longitude: { not: null }
      },
      select: {
        id: true,
        name: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        neighborhood: true,
        number: true,
        logo: true,
        plan: true,
        latitude: true,
        longitude: true
      }
    });

    // Calcular distância e filtrar por raio
    const barbershopsWithDistance = barbershops
      .map(barbershop => {
        if (!barbershop.latitude || !barbershop.longitude) return null;

        const distance = geolocationService.calculateDistance(
          latitude,
          longitude,
          barbershop.latitude,
          barbershop.longitude
        );

        return {
          ...barbershop,
          distance
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null && b.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance);

    return res.json({
      total: barbershopsWithDistance.length,
      radius: radiusKm,
      barbershops: barbershopsWithDistance
    });
  } catch (error) {
    console.error('Erro ao buscar barbearias próximas:', error);
    return res.status(500).json({ error: 'Erro ao buscar barbearias' });
  }
});

// ===== BUSCAR COORDENADAS POR CEP (PÚBLICO) =====
router.get('/geocode/cep/:cep', async (req, res) => {
  try {
    const { cep } = req.params;
    const cleanCep = cep.replace(/\D/g, '');

    if (cleanCep.length !== 8) {
      return res.status(400).json({ error: 'CEP inválido' });
    }

    // Buscar endereço via ViaCEP
    const viaCepResponse = await axios.get(`https://viacep.com.br/ws/${cleanCep}/json/`);
    
    if (viaCepResponse.data.erro) {
      return res.status(404).json({ error: 'CEP não encontrado' });
    }

    const addressData = viaCepResponse.data;

    // Montar endereço completo para geocoding
    const fullAddress = `${addressData.logradouro}, ${addressData.bairro}, ${addressData.localidade}, ${addressData.uf}, Brasil`;

    // Fazer geocoding
    const geocodeResult = await geolocationService.geocodeAddress(fullAddress);

    if (!geocodeResult) {
      return res.status(404).json({ error: 'Não foi possível encontrar as coordenadas' });
    }

    return res.json({
      cep: addressData.cep,
      street: addressData.logradouro,
      neighborhood: addressData.bairro,
      city: addressData.localidade,
      state: addressData.uf,
      latitude: geocodeResult.latitude,
      longitude: geocodeResult.longitude
    });
  } catch (error) {
    console.error('Erro ao buscar CEP:', error);
    return res.status(500).json({ error: 'Erro ao buscar CEP' });
  }
});

// ===== BUSCAR ENDEREÇO POR COORDENADAS (PÚBLICO) =====
router.get('/reverse-geocode', async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude e longitude são obrigatórios' });
    }

    const latitude = parseFloat(lat as string);
    const longitude = parseFloat(lng as string);

    if (!geolocationService.isValidCoordinates(latitude, longitude)) {
      return res.status(400).json({ error: 'Coordenadas inválidas' });
    }

    const result = await geolocationService.reverseGeocode(latitude, longitude);

    if (!result) {
      return res.status(404).json({ error: 'Endereço não encontrado' });
    }

    return res.json(result);
  } catch (error) {
    console.error('Erro ao fazer reverse geocode:', error);
    return res.status(500).json({ error: 'Erro ao buscar endereço' });
  }
});

// ===== ATUALIZAR LOCALIZAÇÃO DA BARBEARIA (ADMIN) =====
router.put('/update-location', authMiddleware, isAdmin, async (req, res) => {
  try {
    const {
      zipCode,
      address,
      number,
      complement,
      neighborhood,
      city,
      state
      // ✅ NÃO RECEBE latitude e longitude do front-end!
    } = req.body;

    const barbershopId = req.user!.barbershopId!;

    // Validações
    if (!zipCode || !address || !neighborhood || !city || !state) {
      return res.status(400).json({ 
        error: 'CEP, endereço, bairro, cidade e estado são obrigatórios' 
      });
    }

    // ✅ CORREÇÃO: Montar endereço completo para geocoding
    const fullAddress = `${address}${number ? ', ' + number : ''}, ${neighborhood}, ${city}, ${state}, Brasil`;

    console.log('🔍 Fazendo geocoding para:', fullAddress);

    // Fazer geocoding
    const geocodeResult = await geolocationService.geocodeAddress(fullAddress);

    if (!geocodeResult) {
      return res.status(400).json({ 
        error: 'Não foi possível encontrar as coordenadas deste endereço. Verifique se está correto.' 
      });
    }

    console.log('✅ Coordenadas encontradas:', geocodeResult.latitude, geocodeResult.longitude);

    // Atualizar barbearia
    const barbershop = await prisma.barbershop.update({
      where: { id: barbershopId },
      data: {
        zipCode: zipCode.replace(/\D/g, ''),
        address,
        number: number || null,
        complement: complement || null,
        neighborhood,
        city,
        state,
        latitude: geocodeResult.latitude,
        longitude: geocodeResult.longitude
      },
      select: {
        id: true,
        name: true,
        zipCode: true,
        address: true,
        number: true,
        complement: true,
        neighborhood: true,
        city: true,
        state: true,
        latitude: true,
        longitude: true
      }
    });

    return res.json({
      message: 'Localização atualizada com sucesso!',
      barbershop
    });
  } catch (error) {
    console.error('❌ Erro ao atualizar localização:', error);
    return res.status(500).json({ error: 'Erro ao atualizar localização' });
  }
});

// ===== BUSCAR LOCALIZAÇÃO ATUAL DA BARBEARIA (ADMIN) =====
router.get('/my-location', authMiddleware, async (req, res) => {
  try {
    const barbershopId = req.user!.barbershopId!;

    const barbershop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: {
        zipCode: true,
        address: true,
        number: true,
        complement: true,
        neighborhood: true,
        city: true,
        state: true,
        latitude: true,
        longitude: true
      }
    });

    if (!barbershop) {
      return res.status(404).json({ error: 'Barbearia não encontrada' });
    }

    return res.json(barbershop);
  } catch (error) {
    console.error('Erro ao buscar localização:', error);
    return res.status(500).json({ error: 'Erro ao buscar localização' });
  }
});

export default router;