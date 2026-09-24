export type Role = 'DONOR' | 'RECEIVER' | 'DRIVER' | 'ADMIN';
export type NeedLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type DeliveryMode = 'PLATFORM_DRIVER' | 'RECEIVER_LOGISTICS';

export type DonationStatus =
  | 'CREATED'
  | 'MATCHING'
  | 'PARTIALLY_MATCHED'
  | 'FULLY_MATCHED'
  | 'FULFILLED'
  | 'EXPIRED'
  | 'CANCELLED';

export type AllocationStatus =
  | 'PROPOSED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'FULFILLING'
  | 'COMPLETED'
  | 'CANCELLED';

export type DeliveryStatus =
  | 'PENDING_DISPATCH'
  | 'DRIVER_SEARCH'
  | 'DRIVER_ASSIGNED'
  | 'RECEIVER_LOGISTICS_ASSIGNED'
  | 'EN_ROUTE_TO_PICKUP'
  | 'PICKED_UP'
  | 'EN_ROUTE_TO_RECEIVER'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'DRIVER_CANCELLED'
  | 'RECEIVER_LOGISTICS_CANCELLED'
  | 'DELIVERY_FAILED'
  | 'REASSIGNMENT_REQUIRED'
  | 'LOGISTICS_SWITCH_REQUIRED'
  | 'EXPIRED';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  donorProfile?: DonorProfile;
  receiverProfile?: ReceiverProfile;
  driverProfile?: DriverProfile;
}

export interface DonorProfile {
  id: string;
  organizationName: string;
  donorType: string;
  address: string;
  latitude: number;
  longitude: number;
  phone?: string;
}

export interface ReceiverProfile {
  id: string;
  organizationName: string;
  maxCapacity: number;
  currentOccupancy: number;
  reservedIncomingQuantity: number;
  needLevel: NeedLevel;
  foodPreferences: string;
  acceptingDonations: boolean;
  address: string;
  latitude: number;
  longitude: number;
  phone?: string;
  hasOwnLogistics: boolean;
}

export interface DriverProfile {
  id: string;
  fullName: string;
  vehicleType: string;
  currentLatitude?: number;
  currentLongitude?: number;
  isAvailable: boolean;
  phone?: string;
}

export interface Donation {
  id: string;
  donorId: string;
  foodCategory: string;
  foodDescription: string;
  quantity: number;
  unit: string;
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;
  availableAt: string;
  safeDeadline: string;
  imageUrl?: string;
  notes?: string;
  status: DonationStatus;
  createdAt: string;
  donor?: DonorProfile;
  allocations?: DonationAllocation[];
}

export interface DonationAllocation {
  id: string;
  donationId: string;
  receiverId: string;
  allocatedQuantity: number;
  status: AllocationStatus;
  rejectionReason?: string;
  createdAt: string;
  donation?: Donation;
  receiver?: ReceiverProfile;
  delivery?: Delivery;
}

export interface Delivery {
  id: string;
  allocationId: string;
  deliveryMode: DeliveryMode;
  status: DeliveryStatus;
  pickupOtp?: string;
  deliveryOtp?: string;
  pickupVerifiedAt?: string;
  deliveryVerifiedAt?: string;
  startedAt?: string;
  completedAt?: string;
  allocation?: DonationAllocation;
  driverAssignments?: any[];
  receiverLogisticsAssignment?: {
    driverName: string;
    vehicleInfo?: string;
    contactMechanism?: string;
    status: string;
  };
  events?: any[];
  impactRecord?: ImpactRecord;
}

export interface ImpactRecord {
  id: string;
  deliveryId: string;
  mealsRescued: number;
  weightDivertedKg: number;
  co2eAvoidedKg: number;
  deliveryMode: DeliveryMode;
  pickupDurationMinutes?: number;
  deliveryDurationMinutes?: number;
  totalDurationMinutes?: number;
  completedAt: string;
}

export interface EnvironmentalEquivalents {
  treesPlantedEquivalent: number;
  passengerVehicleMilesOffset: number;
  landfillVolumeSparedM3: number;
  landfillVolumeSparedLiters: number;
  freshwaterPreservedLiters: number;
}

export interface TransitEfficiency {
  averageMatchingMinutes: number;
  averagePickupMinutes: number;
  averageDeliveryMinutes: number;
  averageTotalMinutes: number;
  platformDriverAverageTotalMinutes: number;
  receiverLogisticsAverageTotalMinutes: number;
}

export interface RecentRescue {
  id: string;
  mealsRescued: number;
  weightDivertedKg: number;
  co2eAvoidedKg: number;
  deliveryMode: DeliveryMode;
  donorName: string;
  receiverName: string;
  foodDescription: string;
  foodCategory: string;
  completedAt: string;
}

export interface ImpactSummary {
  totalMealsRescued: number;
  totalWeightDivertedKg: number;
  totalCo2eAvoidedKg: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  expiredDonations: number;
  deliveryModeBreakdown: {
    platformDriver: number;
    receiverLogistics: number;
    total: number;
  };
  durations: {
    averagePickupMinutes: number;
    averageDeliveryMinutes: number;
    averageTotalMinutes: number;
  };
  environmentalEquivalents?: EnvironmentalEquivalents;
  transitEfficiency?: TransitEfficiency;
  categoryBreakdown?: Record<string, { meals: number; weightKg: number; co2eKg: number }>;
  recentRescues?: RecentRescue[];
}

export interface LayaDonationParseResult {
  foodCategory: 'COOKED_MEALS' | 'PRODUCE' | 'BAKERY' | 'DAIRY' | 'PACKAGED_GOODS';
  foodDescription: string;
  quantity: number;
  unit: string;
  safeDeadline: string;
  safeHoursRemaining: number;
  urgencyTier: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  detectedAllergens: string[];
  confidence: number;
  engine: 'LAYA_SYSTEM_ONE' | 'LAYA_DETERMINISTIC_FALLBACK';
  executionTimeMs: number;
}

export interface LayaDispatchRecommendation {
  recommendedMode: 'PLATFORM_DRIVER' | 'RECEIVER_LOGISTICS';
  confidence: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reasoning: string;
  engine: 'LAYA_SYSTEM_ONE' | 'LAYA_DETERMINISTIC_FALLBACK';
  executionTimeMs: number;
}

export interface FoodVisionResult {
  foodCategory: 'COOKED_MEALS' | 'BAKERY' | 'PRODUCE' | 'DAIRY' | 'PACKAGED_GOODS' | 'CANNED_GOODS' | 'BEVERAGES' | 'RAW_INGREDIENTS';
  foodName: string;
  itemsDetected: string[];
  isCooked: boolean;
  vegetarian: boolean;
  nonVegetarian: boolean;
  packaged: boolean;
  estimatedPortions: number | null;
  estimatedQuantity: number | null;
  quantityUnit: string;
  confidence: number;
  visualNotes: string;
  uncertainFields: string[];
  modelUsed: string;
  latencyMs: number;
  provider: string;
  fallback: boolean;
}

export interface VisionStatus {
  available: boolean;
  provider: string;
  model: string;
  latencyMs?: number;
  message: string;
}


