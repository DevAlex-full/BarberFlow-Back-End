// barberflow-back-end/src/services/geolocation.service.ts

import axios from 'axios';

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    postcode?: string;
    city?: string;
    state?: string;
    country?: string;
  };
}

interface GeocodeResult {
  latitude: number;
  longitude: number;
  fullAddress: string;
  cep?: string;
  city?: string;
  state?: string;
}

/**
 * Serviço de Geocoding usando Nominatim (OpenStreetMap)
 * 100% GRATUITO - Sem necessidade de API Key
 */
export class GeolocationService {
  private readonly BASE_URL = 'https://nominatim.openstreetmap.org';
  private lastRequestTime = 0;
  
  /**
   * Aguarda 1 segundo entre requisições (política do Nominatim)
   */
  private async respectRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = 1000; // 1 segundo
    
    if (timeSinceLastRequest < minInterval) {
      const waitTime = minInterval - timeSinceLastRequest;
      console.log(`⏳ Aguardando ${waitTime}ms para respeitar rate limit...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }
  
  /**
   * Converte endereço em coordenadas (lat/lng)
   */
  async geocodeAddress(address: string, retries = 3): Promise<GeocodeResult | null> {
    try {
      await this.respectRateLimit();
      
      console.log('🔍 Geocoding:', address);
      
      const response = await axios.get<NominatimResult[]>(`${this.BASE_URL}/search`, {
        params: {
          q: address,
          format: 'json',
          addressdetails: 1,
          limit: 1,
          countrycodes: 'br', // Apenas Brasil
        },
        headers: {
          'User-Agent': 'BarberFlow/1.0 (https://barberflow.com)', // Nominatim exige User-Agent
        },
        timeout: 10000, // 10 segundos
      });

      if (!response.data || response.data.length === 0) {
        console.log('❌ Nenhum resultado encontrado para:', address);
        
        // Retry se ainda houver tentativas
        if (retries > 0) {
          console.log(`🔄 Tentando novamente... (${retries} tentativas restantes)`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Aguarda 2s
          return this.geocodeAddress(address, retries - 1);
        }
        
        return null;
      }

      const result = response.data[0];
      
      console.log('✅ Coordenadas encontradas:', {
        lat: result.lat,
        lon: result.lon,
        display_name: result.display_name
      });

      return {
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
        fullAddress: result.display_name,
        cep: result.address?.postcode,
        city: result.address?.city,
        state: result.address?.state,
      };
    } catch (error: any) {
      console.error('❌ Erro ao fazer geocoding:', error.message);
      
      // Retry em caso de erro de rede
      if (retries > 0 && (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')) {
        console.log(`🔄 Erro de rede, tentando novamente... (${retries} tentativas restantes)`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.geocodeAddress(address, retries - 1);
      }
      
      return null;
    }
  }

  /**
   * Converte coordenadas em endereço (reverse geocoding)
   */
  async reverseGeocode(lat: number, lon: number): Promise<GeocodeResult | null> {
    try {
      await this.respectRateLimit();
      
      const response = await axios.get<NominatimResult>(`${this.BASE_URL}/reverse`, {
        params: {
          lat,
          lon,
          format: 'json',
          addressdetails: 1,
        },
        headers: {
          'User-Agent': 'BarberFlow/1.0',
        },
        timeout: 10000,
      });

      if (!response.data) {
        return null;
      }

      const result = response.data;

      return {
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
        fullAddress: result.display_name,
        cep: result.address?.postcode,
        city: result.address?.city,
        state: result.address?.state,
      };
    } catch (error) {
      console.error('❌ Erro ao fazer reverse geocoding:', error);
      return null;
    }
  }

  /**
   * Calcula distância entre dois pontos (Haversine formula)
   * Retorna distância em quilômetros
   */
  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Raio da Terra em km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return Math.round(distance * 10) / 10; // Arredondar para 1 casa decimal
  }

  private toRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  /**
   * Valida coordenadas
   */
  isValidCoordinates(lat: number, lon: number): boolean {
    return (
      typeof lat === 'number' &&
      typeof lon === 'number' &&
      lat >= -90 &&
      lat <= 90 &&
      lon >= -180 &&
      lon <= 180
    );
  }
}

export const geolocationService = new GeolocationService();