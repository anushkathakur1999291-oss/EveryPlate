import { SocketService } from '../socket/socket.service';
import { PrismaClient } from '@prisma/client';
import { GeoService, Coordinates } from '../routing/geo.service';
import { FulfillmentService } from './fulfillment.service';
import { DomainError } from '../../lib/errors';
import { defaultScoringConfig } from '../../config/scoring';

// Claims persist before waiting. Any claimant can resolve a closed window after a restart.
export class DispatchService {
  constructor(private prisma: PrismaClient, private windowMs = 2000) {}
  async claim(deliveryId: string, driverId: string, coords: Coordinates) {
    const closesAt = await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`UPDATE Delivery SET id = id WHERE id = ${deliveryId}`;
      const delivery = await tx.delivery.findUnique({ where: { id: deliveryId } });
      if (!delivery || delivery.deliveryMode !== 'PLATFORM_DRIVER' || !['DRIVER_SEARCH','REASSIGNMENT_REQUIRED'].includes(delivery.status)) throw new DomainError('Delivery is no longer available');
      const pending = await tx.driverClaim.findFirst({ where: { deliveryId, status: 'PENDING' }, orderBy: { closesAt: 'asc' } });
      const end = pending?.closesAt || new Date(Date.now() + this.windowMs);
      if (end.getTime() > Date.now()) await tx.driverClaim.upsert({ where: { deliveryId_driverId_closesAt: { deliveryId, driverId, closesAt: end } }, update: {}, create: { deliveryId, driverId, ...coords, closesAt: end } });
      return end;
    });
    await new Promise(resolve => setTimeout(resolve, Math.max(0, closesAt.getTime() - Date.now())));
    await this.resolve(deliveryId, closesAt);
    const delivery = await this.prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId }, include: { driverAssignments: { where: { status: 'ACCEPTED' } }, allocation: { include: { donation: true, receiver: true } } } });
    if (!delivery.driverAssignments.some(a => a.driverId === driverId)) throw new DomainError('Another feasible courier had a lower total ETA, or this job is no longer available');
    const donation = delivery.allocation.donation;
    const donorCoords = { latitude: donation.pickupLatitude, longitude: donation.pickupLongitude };
    return { delivery, totalEtaMinutes: GeoService.estimateTransitMinutes(coords, donorCoords) + GeoService.estimateTransitMinutes(donorCoords, delivery.allocation.receiver) };
  }
  async recoverClosedWindows() {
    const windows = await this.prisma.driverClaim.groupBy({ by: ['deliveryId','closesAt'], where: { status: 'PENDING', closesAt: { lte: new Date() } }, orderBy: { closesAt: 'asc' }, take: 100 });
    for (const window of windows) {
      try { await this.resolve(window.deliveryId, window.closesAt); }
      catch (err) { console.error(JSON.stringify({ level: 'error', event: 'DISPATCH_RECOVERY_FAILED', deliveryId: window.deliveryId, type: err instanceof Error ? err.name : 'Unknown' })); }
    }
    await this.prisma.driverClaim.deleteMany({ where: { status: { not: 'PENDING' }, createdAt: { lt: new Date(Date.now()-7*86400000) } } });
  }
  private async resolve(deliveryId: string, closesAt: Date) {
    const delivery = await this.prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId }, include: { allocation: { include: { donation: true, receiver: true } } } });
    const donation = delivery.allocation.donation;
    const donor = { latitude: donation.pickupLatitude, longitude: donation.pickupLongitude };
    const claims = await this.prisma.driverClaim.findMany({ where: { deliveryId, closesAt, status: 'PENDING' } });
    const candidates = claims.map(c => ({ ...c, eta: GeoService.estimateTransitMinutes(c, donor) + GeoService.estimateTransitMinutes(donor, delivery.allocation.receiver) })).sort((a,b) => a.eta - b.eta || a.driverId.localeCompare(b.driverId));
    const fulfillment = new FulfillmentService(this.prisma);
    for (const candidate of candidates) {
      const driver = await this.prisma.driverProfile.findUnique({ where: { id: candidate.driverId } });
      const earliest = Math.max(Date.now() + GeoService.estimateTransitMinutes(candidate, donor) * 60000, donation.availableAt.getTime());
      if (!driver?.isAvailable || earliest + (GeoService.estimateTransitMinutes(donor, delivery.allocation.receiver) + defaultScoringConfig.pickupBufferMinutes + defaultScoringConfig.deliveryBufferMinutes) * 60000 > donation.safeDeadline.getTime()) continue;
      try {
        await fulfillment.acceptPlatformDeliveryJob(deliveryId, candidate.driverId, candidate, candidate.id);
        SocketService.emitDriverAssigned({ id: deliveryId }, candidate.driverId);
        break;
      } catch (err) {
        // Another resolver may already have assigned the same ranked winner.
        const fresh = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
        if (fresh?.status !== 'DRIVER_SEARCH' && fresh?.status !== 'REASSIGNMENT_REQUIRED') break;
        if (!(err instanceof DomainError)) throw err;
      }
    }
    await this.prisma.driverClaim.updateMany({ where: { deliveryId, closesAt, status: 'PENDING' }, data: { status: 'RESOLVED' } });
  }
}
