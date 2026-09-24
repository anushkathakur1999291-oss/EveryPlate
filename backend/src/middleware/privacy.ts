import { AuthenticatedUser } from './auth';

// All API graphs, including admin graphs, exclude custody secrets and private contacts.
// Dedicated ownership-checked endpoints reveal one currently usable OTP at a time.
export function stripSecrets(value: any): any {
  if (value == null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stripSecrets);
  const result: any = {};
  for (const [key, child] of Object.entries(value)) {
    if (['pickupOtp', 'deliveryOtp', 'pickupOtpVersion', 'deliveryOtpVersion', 'pickupOtpReissuedAt', 'deliveryOtpReissuedAt', 'submittedOtp', 'phone', 'contactMechanism', 'passwordHash', 'tokenHash', 'otpVerifications', 'events', 'metadata', 'email', 'nextMatchAttemptAt'].includes(key)) continue;
    result[key] = stripSecrets(child);
  }
  return result;
}
function hideLocation(profile: any) {
  if (!profile) return;
  for (const key of ['address', 'latitude', 'longitude', 'currentLatitude', 'currentLongitude']) delete profile[key];
}
function hidePickup(donation: any) {
  if (!donation) return;
  for (const key of ['pickupAddress', 'pickupLatitude', 'pickupLongitude']) delete donation[key];
  hideLocation(donation.donor);
}
export class PrivacyMasker {
  static maskDeliveryForUser(delivery: any, user?: AuthenticatedUser, assignedContext = false): any {
    if (!delivery) return null;
    const result = stripSecrets(delivery);
    const admin = user?.role === 'ADMIN';
    const transporter = assignedContext || (user?.role === 'DRIVER' && delivery.driverAssignments?.some((a: any) => a.status === 'ACCEPTED' && a.driverId === user.driverProfile?.id)) ||
      (user?.role === 'RECEIVER' && delivery.deliveryMode === 'RECEIVER_LOGISTICS' && delivery.allocation?.receiverId === user.receiverProfile?.id);
    const donor = !!user?.donorProfile && delivery.allocation?.donation?.donorId === user.donorProfile.id;
    const receiver = !!user?.receiverProfile && delivery.allocation?.receiverId === user.receiverProfile.id;
    if (!admin && !transporter && !donor) hidePickup(result.allocation?.donation);
    if (!admin && !transporter && !receiver) hideLocation(result.allocation?.receiver);
    if (!admin) for (const a of result.driverAssignments || []) hideLocation(a.driver);
    return result;
  }
  static maskDonationForUser(donation: any, user?: AuthenticatedUser, pickupContext = false): any {
    if (!donation) return null;
    const result = stripSecrets(donation);
    const admin = user?.role === 'ADMIN';
    const owner = !!user?.donorProfile && donation.donorId === user.donorProfile.id;
    if (!admin && !owner && !pickupContext) hidePickup(result);
    if (result.allocations) {
      if (!admin && !owner) result.allocations = result.allocations.filter((a: any) => a.receiverId === user?.receiverProfile?.id || a.delivery?.driverAssignments?.some((d: any) => d.status === 'ACCEPTED' && d.driverId === user?.driverProfile?.id));
      result.allocations = result.allocations.map((a: any) => {
        if (!admin && a.receiverId !== user?.receiverProfile?.id) hideLocation(a.receiver);
        if (a.delivery) a.delivery = this.maskDeliveryForUser({ ...a.delivery, allocation: { receiverId: a.receiverId, donation: { donorId: donation.donorId } } }, user);
        return a;
      });
    }
    return result;
  }
}
