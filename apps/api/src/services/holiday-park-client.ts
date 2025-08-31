import axios, { AxiosInstance } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { 
  HolidayParkAvailability, 
  HolidayParkResort,
  HolidayParkAccommodationType,
  CheckAvailabilityRequest,
  Availability,
  RESORT_NAMES,
  ACCOMMODATION_TYPE_NAMES
} from '@holiday-park/shared';
import { logger } from '../utils/logger';

export class HolidayParkClient {
  private client: AxiosInstance;
  private cookieJar: CookieJar;
  private baseUrl: string;
  private initialized: boolean = false;
  private resortsCache: Map<number, HolidayParkResort> = new Map();
  private accommodationTypesCache: Map<number, HolidayParkAccommodationType> = new Map();

  constructor() {
    this.baseUrl = process.env.HOLIDAY_PARK_API_URL || 'https://rezerwuj.holidaypark.pl';
    this.cookieJar = new CookieJar();
    
    this.client = wrapper(axios.create({
      baseURL: this.baseUrl,
      jar: this.cookieJar,
      withCredentials: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'pl,en;q=0.9',
        'Referer': this.baseUrl,
        'Origin': this.baseUrl
      },
      timeout: 30000
    }));
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      logger.info('Initializing Holiday Park client...');
      
      // Load initial page to get cookies
      await this.client.get('/');
      
      // Load app data with resorts and accommodation types
      const response = await this.client.get('/api/reservation/reservation-app-data/');
      const data = response.data;

      // Cache resorts
      if (data.resorts) {
        data.resorts.forEach((resort: HolidayParkResort) => {
          this.resortsCache.set(resort.id, resort);
        });
      }

      // Cache accommodation types
      if (data.accommodation_types) {
        data.accommodation_types.forEach((type: HolidayParkAccommodationType) => {
          this.accommodationTypesCache.set(type.id, type);
        });
      }

      this.initialized = true;
      logger.info(`Holiday Park client initialized. Loaded ${this.resortsCache.size} resorts and ${this.accommodationTypesCache.size} accommodation types`);
    } catch (error) {
      logger.error('Failed to initialize Holiday Park client:', error);
      throw new Error('Failed to initialize Holiday Park client');
    }
  }

  async checkAvailability(
    dateFrom: string,
    dateTo: string,
    resortIds?: number[],
    accommodationTypeIds?: number[]
  ): Promise<Availability[]> {
    await this.initialize();

    try {
      logger.debug(`Checking availability from ${dateFrom} to ${dateTo}`);
      
      const response = await this.client.post(
        '/api/reservation/reservation-check-accommodation-type/',
        {
          date_from: dateFrom,
          date_to: dateTo
        }
      );

      const availabilities: Availability[] = [];
      const nights = this.calculateNights(dateFrom, dateTo);

      for (const item of response.data as HolidayParkAvailability[]) {
        // Filter by resort if specified
        if (resortIds && !resortIds.includes(item.resort_id)) {
          continue;
        }

        // Filter by accommodation type if specified
        if (accommodationTypeIds && !accommodationTypeIds.includes(item.accommodation_type_id)) {
          continue;
        }

        // Only include if resort is open
        if (!item.is_open) {
          continue;
        }

        const resort = this.resortsCache.get(item.resort_id);
        const accommodationType = this.accommodationTypesCache.get(item.accommodation_type_id);

        if (item.available) {
          // Exact dates are available
          availabilities.push({
            resortId: item.resort_id,
            resortName: resort?.name || RESORT_NAMES[item.resort_id] || `Resort ${item.resort_id}`,
            accommodationTypeId: item.accommodation_type_id,
            accommodationTypeName: accommodationType?.name || ACCOMMODATION_TYPE_NAMES[item.accommodation_type_id] || `Type ${item.accommodation_type_id}`,
            dateFrom,
            dateTo,
            nights,
            priceTotal: parseFloat(item.price_brutto_avg) * nights,
            pricePerNight: parseFloat(item.price_brutto_avg),
            available: true,
            link: this.generateBookingLink(item.resort_id, item.accommodation_type_id, dateFrom, dateTo)
          });
        } else if (item.available_dates && item.available_dates.length > 0) {
          // Check if any of the available dates match our criteria
          for (const availableDate of item.available_dates) {
            if (this.datesOverlap(dateFrom, dateTo, availableDate.date_from, availableDate.date_to)) {
              const overlapFrom = this.maxDate(dateFrom, availableDate.date_from);
              const overlapTo = this.minDate(dateTo, availableDate.date_to);
              const overlapNights = this.calculateNights(overlapFrom, overlapTo);
              
              if (overlapNights === nights) {
                // Perfect match within available dates
                availabilities.push({
                  resortId: item.resort_id,
                  resortName: resort?.name || RESORT_NAMES[item.resort_id] || `Resort ${item.resort_id}`,
                  accommodationTypeId: item.accommodation_type_id,
                  accommodationTypeName: accommodationType?.name || ACCOMMODATION_TYPE_NAMES[item.accommodation_type_id] || `Type ${item.accommodation_type_id}`,
                  dateFrom: overlapFrom,
                  dateTo: overlapTo,
                  nights: overlapNights,
                  priceTotal: parseFloat(item.price_brutto_avg) * overlapNights,
                  pricePerNight: parseFloat(item.price_brutto_avg),
                  available: true,
                  link: this.generateBookingLink(item.resort_id, item.accommodation_type_id, overlapFrom, overlapTo)
                });
              }
            }
          }
        }
      }

      logger.debug(`Found ${availabilities.length} availabilities`);
      return availabilities;
    } catch (error) {
      logger.error('Failed to check availability:', error);
      throw new Error('Failed to check availability');
    }
  }

  async getResortDetails(resortId: number, dateFrom: string, dateTo: string): Promise<HolidayParkResort | null> {
    await this.initialize();

    try {
      const response = await this.client.get(
        `/api/reservation/resorts/${resortId}/`,
        {
          params: {
            date_from: dateFrom,
            date_to: dateTo
          }
        }
      );
      return response.data;
    } catch (error) {
      logger.error(`Failed to get resort ${resortId} details:`, error);
      return null;
    }
  }

  private calculateNights(dateFrom: string, dateTo: string): number {
    const start = new Date(dateFrom);
    const end = new Date(dateTo);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  private datesOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
    return new Date(start1) <= new Date(end2) && new Date(end1) >= new Date(start2);
  }

  private maxDate(date1: string, date2: string): string {
    return new Date(date1) > new Date(date2) ? date1 : date2;
  }

  private minDate(date1: string, date2: string): string {
    return new Date(date1) < new Date(date2) ? date1 : date2;
  }

  private generateBookingLink(
    resortId: number,
    accommodationTypeId: number,
    dateFrom: string,
    dateTo: string
  ): string {
    const resort = this.resortsCache.get(resortId);
    const resortSlug = resort?.slug || '';
    
    return `${this.baseUrl}/rezerwacja/${resortSlug}?date_from=${dateFrom}&date_to=${dateTo}&accommodation_type=${accommodationTypeId}`;
  }

  getResorts(): Map<number, HolidayParkResort> {
    return this.resortsCache;
  }

  getAccommodationTypes(): Map<number, HolidayParkAccommodationType> {
    return this.accommodationTypesCache;
  }
}