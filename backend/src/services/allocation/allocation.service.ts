import { PrismaClient, Prisma, DonationAllocation } from '@prisma/client';
import { MatchingService } from '../matching/matching.service';
import { DomainError } from '../../lib/errors';

export interface AllocationResult {
  allocations: DonationAllocation[];
  unallocatedQuantity: number;
  matchedReceivers: { receiverId: string; organizationName: string; allocatedQuantity: number; compositeScore: number; isPartial: boolean }[];
  disqualified: { receiverId: string; reason: string }[];
}
export class AllocationEngine {
  constructor(private prisma: PrismaClient) {}

  private async propose(tx: Prisma.TransactionClient, donationId: string, exclusions: string[] = []): Promise<AllocationResult> {
    // Acquire SQLite's writer lock before reading resource balances.
    await tx.$executeRaw`UPDATE Donation SET id = id WHERE id = ${donationId}`;
    const donation = await tx.donation.findUnique({ where: { id: donationId }, include: { allocations: true } });
    if (!donation) throw new DomainError('Donation not found', 404);
    if (['FULFILLED', 'EXPIRED', 'CANCELLED'].includes(donation.status) || donation.safeDeadline <= new Date()) throw new DomainError('Donation is no longer available');
    const used = donation.allocations.filter(a => !['REJECTED', 'CANCELLED'].includes(a.status)).reduce((sum, a) => sum + a.allocatedQuantity, 0);
    let remaining = donation.quantity - used;
    const result: AllocationResult = { allocations: [], unallocatedQuantity: remaining, matchedReceivers: [], disqualified: [] };
    if (!remaining) return result;
    const matching = await new MatchingService(tx).matchDonation(donation, remaining, [...exclusions, ...donation.allocations.map(a => a.receiverId)]);
    result.disqualified = matching.disqualified;
    for (const scored of matching.ranked) {
      if (remaining <= 0) break;
      const receiver = await tx.receiverProfile.findUniqueOrThrow({ where: { id: scored.receiver.id } });
      const quantity = Math.min(remaining, receiver.maxCapacity - receiver.currentOccupancy - receiver.reservedIncomingQuantity);
      if (quantity <= 0 || !receiver.acceptingDonations) continue;
      const reserved = await tx.$executeRaw`UPDATE ReceiverProfile SET reservedIncomingQuantity = reservedIncomingQuantity + ${quantity}, updatedAt = CURRENT_TIMESTAMP WHERE id = ${receiver.id} AND acceptingDonations = 1 AND maxCapacity - currentOccupancy - reservedIncomingQuantity >= ${quantity}`;
      if (reserved !== 1) continue;
      const allocation = await tx.donationAllocation.create({ data: {
        donationId, receiverId: receiver.id, allocatedQuantity: quantity,
        capacityReservation: { create: { receiverId: receiver.id, reservedQuantity: quantity } },
      } });
      result.allocations.push(allocation);
      result.matchedReceivers.push({ receiverId: receiver.id, organizationName: receiver.organizationName, allocatedQuantity: quantity, compositeScore: scored.scores.composite, isPartial: quantity < remaining });
      remaining -= quantity;
    }
    await tx.donation.update({ where: { id: donationId }, data: { status: remaining === 0 ? 'FULLY_MATCHED' : remaining < donation.quantity ? 'PARTIALLY_MATCHED' : 'MATCHING' } });
    result.unallocatedQuantity = remaining;
    return result;
  }
  async proposeAllocationsForDonation(donationId: string, excludedReceiverIds: string[] = []): Promise<AllocationResult> {
    return this.prisma.$transaction(tx => this.propose(tx, donationId, excludedReceiverIds), { timeout: 10000 });
  }
  async acceptAllocation(allocationId: string): Promise<DonationAllocation> {
    return this.prisma.$transaction(async tx => {
      const changed = await tx.donationAllocation.updateMany({ where: { id: allocationId, status: 'PROPOSED', donation: { safeDeadline: { gt: new Date() }, status: { notIn: ['CANCELLED', 'EXPIRED'] } }, capacityReservation: { status: 'ACTIVE' } }, data: { status: 'ACCEPTED' } });
      if (changed.count !== 1) throw new DomainError('This allocation is no longer available to accept');
      return tx.donationAllocation.findUniqueOrThrow({ where: { id: allocationId } });
    });
  }
  async rejectAllocation(allocationId: string, reason = 'Receiver declined recommendation'): Promise<{ rejectedAllocation: DonationAllocation; rematchResult: AllocationResult }> {
    return this.prisma.$transaction(async tx => {
      const changed = await tx.donationAllocation.updateMany({ where: { id: allocationId, status: { in: ['PROPOSED', 'ACCEPTED'] }, delivery: null }, data: { status: 'REJECTED', rejectionReason: reason } });
      if (changed.count !== 1) throw new DomainError('This allocation can no longer be rejected');
      const allocation = await tx.donationAllocation.findUniqueOrThrow({ where: { id: allocationId } });
      const released = await tx.capacityReservation.updateMany({ where: { allocationId, status: 'ACTIVE' }, data: { status: 'RELEASED' } });
      if (released.count !== 1) throw new DomainError('Capacity reservation is no longer active');
      await tx.receiverProfile.update({ where: { id: allocation.receiverId }, data: { reservedIncomingQuantity: { decrement: allocation.allocatedQuantity } } });
      const rematchResult = await this.propose(tx, allocation.donationId, [allocation.receiverId]);
      return { rejectedAllocation: allocation, rematchResult };
    }, { timeout: 10000 });
  }
}
