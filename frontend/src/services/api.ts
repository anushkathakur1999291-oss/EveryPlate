import { User, Donation, DonationAllocation, Delivery, ImpactSummary, LayaDonationParseResult, LayaDispatchRecommendation } from '../types';

let currentUserId: string = '';

export function setApiUserId(userId: string) {
  currentUserId = userId;
}

async function request<T>(path: string, options: RequestInit = {}, page = false): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (currentUserId) {
    headers.set('x-user-id', currentUserId);
  }

  const res = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: 'same-origin',
    signal: options.signal || AbortSignal.timeout(15000),
  });

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({ error: 'The server returned an unreadable response. Please try again.' }));
  if (!res.ok) {
    throw new Error(data.error || `HTTP error ${res.status}`);
  }
  return page ? { items: data, nextCursor: res.headers.get('X-Next-Cursor') } as T : data;
}

export interface Page<T> { items: T[]; nextCursor: string | null }
const pageQuery = (cursor?: string) => cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
export const api = {
  // Auth & Users
  getAuthConfig: () => request<{ demoMode: boolean }>('/auth/config'),
  login: (email: string, password: string) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getUsers: () => request<User[]>('/auth/users'),
  getMe: () => request<User>('/auth/me'),

  // Donations
  createDonation: (payload: {
    foodCategory: string;
    foodDescription: string;
    quantity: number;
    safeDeadline: string;
    notes?: string;
    pickupAddress?: string;
    pickupLatitude?: number;
    pickupLongitude?: number;
  }) => request<{ donation: Donation; matchingSummary: any[] }>('/donations', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  getMyDonations: (cursor?: string) => request<Page<Donation>>(`/donations/my${pageQuery(cursor)}`, {}, true),
  getDonationById: (id: string) => request<Donation>(`/donations/${id}`),
  getPickupOtp: (deliveryId: string) =>
    request<{ pickupOtp: string; status: string }>(`/donations/deliveries/${deliveryId}/pickup-otp`),

  // Receivers & Allocations
  getMyAllocations: (cursor?: string) => request<Page<DonationAllocation>>(`/receivers/my/allocations${pageQuery(cursor)}`, {}, true),
  acceptAllocation: (allocationId: string) =>
    request<{ allocation: DonationAllocation }>(`/allocations/${allocationId}/accept`, { method: 'POST' }),
  rejectAllocation: (allocationId: string, reason: string) =>
    request<{ rejectedAllocation: DonationAllocation; rematchSummary: any[] }>(`/allocations/${allocationId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  selectFulfillment: (
    allocationId: string,
    payload: {
      deliveryMode: 'PLATFORM_DRIVER' | 'RECEIVER_LOGISTICS';
      driverName?: string;
      vehicleInfo?: string;
      contactMechanism?: string;
    }
  ) =>
    request<{ delivery: Delivery }>(`/allocations/${allocationId}/fulfillment`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getDeliveryOtp: (deliveryId: string) =>
    request<{ deliveryOtp: string; status: string }>(`/receivers/deliveries/${deliveryId}/delivery-otp`),

  // Platform Drivers
  updateDriverLocation: (coords: { latitude: number; longitude: number }) => request('/drivers/my/location', { method: 'PATCH', body: JSON.stringify(coords) }),
  getAvailableJobs: (cursor?: string) => request<Page<any>>(`/drivers/available-jobs${pageQuery(cursor)}`, {}, true),
  getMyJobs: () => request<any[]>('/drivers/my-jobs'),
  claimJob: (deliveryId: string, coords?: { latitude: number; longitude: number }) =>
    request<{ delivery: Delivery; totalEtaMinutes: number }>(`/deliveries/${deliveryId}/claim`, {
      method: 'POST',
      body: JSON.stringify(coords || {}),
    }),
  cancelJob: (deliveryId: string, reason: string) =>
    request<{ delivery: Delivery }>(`/deliveries/${deliveryId}/cancel-claim`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // Deliveries & OTPs
  reissueOtp: (deliveryId: string, stage: 'PICKUP' | 'DELIVERY') => request<{ otp: string }>(`/deliveries/${deliveryId}/reissue-otp`, { method: 'POST', body: JSON.stringify({ stage }) }),
  getDelivery: (id: string) => request<Delivery>(`/deliveries/${id}`),
  verifyPickupOtp: (deliveryId: string, otp: string) =>
    request<{ delivery: Delivery }>(`/deliveries/${deliveryId}/verify-pickup-otp`, {
      method: 'POST',
      body: JSON.stringify({ otp }),
    }),
  verifyDeliveryOtp: (deliveryId: string, otp: string) =>
    request<{ delivery: Delivery; impactRecord: any }>(`/deliveries/${deliveryId}/verify-delivery-otp`, {
      method: 'POST',
      body: JSON.stringify({ otp }),
    }),
  switchDeliveryMode: (
    deliveryId: string,
    payload: {
      newMode: 'PLATFORM_DRIVER' | 'RECEIVER_LOGISTICS';
      driverName?: string;
      vehicleInfo?: string;
      contactMechanism?: string;
    }
  ) =>
    request<{ delivery: Delivery }>(`/deliveries/${deliveryId}/switch-mode`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Impact & Admin
  getImpactSummary: () => request<ImpactSummary>('/impact/summary'),
  getAdminDashboard: () => request<any>('/admin/dashboard'),

  // AI System-1 Decision Engine (Laya) & Vision
  parseDonationWithAI: (text: string) =>
    request<LayaDonationParseResult>('/ai/parse-donation', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  getAIModeRecommendation: (payload: {
    allocationId: string;
  }) =>
    request<LayaDispatchRecommendation>('/ai/recommend-mode', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getVisionStatus: () =>
    request<import('../types').VisionStatus>('/ai/vision-status'),
  analyzeFoodImage: (imageBase64: string, mimeType?: string) =>
    request<import('../types').FoodVisionResult>('/ai/analyze-food-image', {
      method: 'POST',
      body: JSON.stringify({ imageBase64, mimeType }),
    }),
};
