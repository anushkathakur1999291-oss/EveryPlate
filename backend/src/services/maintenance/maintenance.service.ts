import { PrismaClient } from '@prisma/client';
import { AllocationEngine } from '../allocation/allocation.service';
import { SocketService } from '../socket/socket.service';
export class MaintenanceService {
  constructor(private prisma: PrismaClient) {}
  async expireDonation(id: string, now = new Date()) {
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`UPDATE Donation SET id = id WHERE id = ${id}`;
      const donation = await tx.donation.findUnique({ where: { id }, include: { allocations: { include: { delivery: true, capacityReservation: true } } } });
      if (!donation || donation.safeDeadline > now || ['FULFILLED','EXPIRED','CANCELLED'].includes(donation.status)) return false;
      for (const allocation of donation.allocations) {
        if (allocation.status === 'COMPLETED') continue;
        const released = await tx.capacityReservation.updateMany({ where: { allocationId: allocation.id, status: 'ACTIVE' }, data: { status: 'RELEASED' } });
        if (released.count) await tx.receiverProfile.update({ where: { id: allocation.receiverId }, data: { reservedIncomingQuantity: { decrement: allocation.allocatedQuantity } } });
        if (!['REJECTED','CANCELLED'].includes(allocation.status)) await tx.donationAllocation.update({ where: { id: allocation.id }, data: { status: 'CANCELLED' } });
        if (allocation.delivery && allocation.delivery.status !== 'COMPLETED') {
          const deliveryId = allocation.delivery.id;
          const assignments = await tx.driverAssignment.findMany({ where: { deliveryId, status: 'ACCEPTED' } });
          await tx.driverAssignment.updateMany({ where: { deliveryId, status: 'ACCEPTED' }, data: { status: 'CANCELLED', cancelledAt: now, cancellationReason: 'Safe deadline passed' } });
          await tx.driverProfile.updateMany({ where: { id: { in: assignments.map(a=>a.driverId) } }, data: { isAvailable: true } });
          await tx.receiverLogisticsAssignment.updateMany({ where: { deliveryId, status: { not: 'DELIVERED' } }, data: { status: 'CANCELLED', cancelledAt: now } });
          await tx.delivery.update({ where: { id: deliveryId }, data: { status: 'EXPIRED', pickupOtp: '', deliveryOtp: '', events: { create: { fromStatus: allocation.delivery.status, toStatus: 'EXPIRED', actorRole: 'SYSTEM', metadata: '{"event":"SAFE_DEADLINE_PASSED"}' } } } });
        }
      }
      await tx.donation.update({ where: { id }, data: { status: 'EXPIRED' } });
      return true;
    });
  }
  async runOnce() {
    const now = new Date();
    const expired = await this.prisma.donation.findMany({ where: { safeDeadline: { lte: now }, status: { notIn: ['FULFILLED','EXPIRED','CANCELLED'] } }, take: 100, orderBy: { safeDeadline: 'asc' } });
    for (const d of expired) if (await this.expireDonation(d.id, now)) SocketService.emitDonationCreated(d);
    // Recover interrupted matching and retry partial donations as capacity becomes available.
    const pending = await this.prisma.donation.findMany({ where: { safeDeadline: { gt: now }, status: { in: ['CREATED','MATCHING','PARTIALLY_MATCHED'] } }, take: 20, orderBy: { safeDeadline: 'asc' } });
    const engine = new AllocationEngine(this.prisma);
    for (const d of pending) {
      const result = await engine.proposeAllocationsForDonation(d.id);
      if (result.allocations.length) SocketService.emitDonationCreated(d);
    }
    await this.prisma.session.deleteMany({ where: { expiresAt: { lte: now } } });
  }
}
