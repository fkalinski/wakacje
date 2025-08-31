export interface Resort {
  id: number;
  name: string;
  slug: string;
  localization_kind: 'sea' | 'mountains';
  address_city: string;
  address_postcode: string;
  address_street: string;
}

export interface AccommodationType {
  id: number;
  name: string;
  size: string;
  type: 'house' | 'apartment';
  max_guests_with_infant: number;
  display_max_guests: number;
}

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

export interface Search {
  id?: string;
  name: string;
  enabled: boolean;
  dateRanges: DateRange[];
  stayLengths: number[]; // in days
  resorts: number[]; // resort IDs
  accommodationTypes: number[]; // accommodation type IDs
  schedule: {
    frequency: 'every_30_min' | 'hourly' | 'every_2_hours' | 'every_4_hours' | 'daily';
    customCron?: string;
    lastRun?: Date | null;
    nextRun?: Date | null;
  };
  notifications: {
    email: string;
    onlyChanges: boolean;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Availability {
  resortId: number;
  resortName: string;
  accommodationTypeId: number;
  accommodationTypeName: string;
  dateFrom: string;
  dateTo: string;
  nights: number;
  priceTotal: number;
  pricePerNight: number;
  available: boolean;
  link: string;
}

export interface SearchResult {
  id?: string;
  searchId: string;
  timestamp: Date;
  availabilities: Availability[];
  changes?: {
    new: Availability[];
    removed: Availability[];
  };
  notificationSent: boolean;
  error?: string;
}

export interface SearchExecution {
  searchId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  totalChecks: number;
  completedChecks: number;
  foundAvailabilities: number;
  error?: string;
}

export interface NotificationLog {
  id?: string;
  searchId: string;
  resultId: string;
  sentAt: Date;
  recipient: string;
  subject: string;
  newAvailabilities: number;
  removedAvailabilities: number;
  success: boolean;
  error?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CheckAvailabilityRequest {
  date_from: string;
  date_to: string;
}

export interface HolidayParkAvailability {
  accommodation_type_id: number;
  available: boolean;
  available_dates: Array<{
    date_from: string;
    date_to: string;
  }>;
  price_brutto_avg: string;
  base_price_brutto_avg: string;
  resort_id: number;
  is_open: boolean;
}

export interface HolidayParkResort {
  id: number;
  name: string;
  slug: string;
  localization_kind: string;
  localization_kind_display: string;
  address_city: string;
  address_postcode: string;
  address_street: string;
  accommodation_types: number[];
  has_feeding: boolean;
  apartment_amount: number;
  house_amount: number;
}

export interface HolidayParkAccommodationType {
  id: number;
  name: string;
  type: string;
  size: string;
  max_guests_with_infant: number;
  display_max_guests: number;
  display_max_adult_guests: number;
}

export const RESORT_NAMES: Record<number, string> = {
  1: 'Pobierowo',
  2: 'Ustronie Morskie',
  5: 'Niechorze',
  6: 'Rowy',
  7: 'Kołobrzeg',
  8: 'Mielno',
  9: 'Uzdrowisko Cieplice Zdrój'
};

export const ACCOMMODATION_TYPE_NAMES: Record<number, string> = {
  1: 'Domek',
  2: 'Apartament',
  3: 'Apartament 55m²',
  4: 'Domek z ogrodem',
  5: 'Apartament z ogrodem'
};

export const SCHEDULE_FREQUENCIES = {
  every_30_min: '*/30 * * * *',
  hourly: '0 * * * *',
  every_2_hours: '0 */2 * * *',
  every_4_hours: '0 */4 * * *',
  daily: '0 9 * * *'
} as const;