import { DomainError } from '../../lib/errors';
import {
  PrismaClient,
  Prisma,
  Delivery,
  DeliveryMode,
  DeliveryStatus,
  DriverAssignmentStatus,
  ReceiverLogisticsStatus,
  OTPType,
  AllocationStatus,
  CapacityReservationStatus,
  DonationStatus,
  ImpactRecord
} from '@prisma/client';
import { OtpService } from '../otp/otp.service';
import { defaultScoringConfig } from '../../config/scoring';
import { GeoService, Coordinates } from '../routing/geo.service';

export interface ReceiverPersonnelInput {
  driverName: string;
  vehicleInfo?: string;
  contactMechanism?: string;
}

export class FulfillmentService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Initializes delivery after receiver accepts allocation and selects fulfillment method.
   */
  async createDeliveryForAllocation(
    allocationId: string,
    deliveryMode: DeliveryMode,
    personnelInput?: ReceiverPersonnelInput,
    actorUserId?: string
  ): Promise<Delivery> {
    return await this.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE DonationAllocation SET id = id WHERE id = ${allocationId}`;
    const allocation = await tx.donationAllocation.findUnique({
      where: { id: allocationId },
      include: {
        donation: true,
        receiver: true,
        delivery: true,
      },
    });

    if (!allocation) {
      throw new DomainError(`Allocation ${allocationId} not found`);
    }

    if (allocation.delivery) {
      throw new DomainError(`Delivery already created for allocation ${allocationId}`);
    }

    if (allocation.status !== AllocationStatus.ACCEPTED) throw new DomainError('Accept this allocation before arranging fulfillment');
    if (actorUserId && allocation.receiver.userId !== actorUserId) throw new DomainError('Allocation not found', 404);
    this.validateMode(deliveryMode, allocation.receiver.hasOwnLogistics, personnelInput);
    this.assertFeasible(allocation.donation, allocation.receiver);
    // Generate cryptographic OTPs
    const pickupOtp = OtpService.seal(OtpService.generateOtp(), `${allocationId}:PICKUP`, allocation.donation.safeDeadline);
    const deliveryOtp = OtpService.seal(OtpService.generateOtp(), `${allocationId}:DELIVERY`, allocation.donation.safeDeadline);

    const initialStatus =
      deliveryMode === DeliveryMode.PLATFORM_DRIVER
        ? DeliveryStatus.DRIVER_SEARCH
        : DeliveryStatus.RECEIVER_LOGISTICS_ASSIGNED;

      // 1. Update allocation status
      await tx.donationAllocation.update({
        where: { id: allocationId },
        data: { status: AllocationStatus.FULFILLING },
      });

      // 2. Create Delivery record
      const delivery = await tx.delivery.create({
        data: {
          allocationId,
          deliveryMode,
          status: initialStatus,
          pickupOtp,
          deliveryOtp,
          startedAt: deliveryMode === DeliveryMode.RECEIVER_LOGISTICS ? new Date() : undefined,
          receiverLogisticsAssignment:
            deliveryMode === DeliveryMode.RECEIVER_LOGISTICS && personnelInput
              ? {
                  create: {
                    driverName: personnelInput.driverName,
                    vehicleInfo: personnelInput.vehicleInfo,
                    contactMechanism: personnelInput.contactMechanism,
                    status: ReceiverLogisticsStatus.ASSIGNED,
                  },
                }
              : undefined,
          events: {
            create: {
              toStatus: initialStatus,
              actorId: actorUserId,
              actorRole: 'RECEIVER',
              metadata: JSON.stringify({
                deliveryMode,
                personnel: personnelInput || null,
              }),
            },
          },
        },
        include: {
          receiverLogisticsAssignment: true,
          events: true,
        },
      });

      return delivery;
    });
  }

  /**
   * Evaluates driver acceptance with Lowest Total ETA to Receiver resolution.
   * Atomic lock prevents race conditions where multiple drivers claim simultaneously.
   */
  async acceptPlatformDeliveryJob(
    deliveryId: string,
    driverId: string,
    driverCoords: Coordinates
  ): Promise<{ delivery: Delivery; totalEtaMinutes: number }> {
    return await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE Delivery SET id = id WHERE id = ${deliveryId}`;
      // 1. Fetch fresh delivery with parent donation and receiver
      await tx.$executeRaw`UPDATE Delivery SET id = id WHERE id = ${deliveryId}`;
      const delivery = await tx.delivery.findUnique({
        where: { id: deliveryId },
        include: {
          allocation: {
            include: {
              donation: true,
              receiver: true,
            },
          },
          driverAssignments: {
            where: { status: DriverAssignmentStatus.ACCEPTED },
          },
        },
      });

      if (!delivery) {
        throw new DomainError(`Delivery ${deliveryId} not found`);
      }

      if (delivery.deliveryMode !== DeliveryMode.PLATFORM_DRIVER) {
        throw new DomainError(`Delivery ${deliveryId} is not in PLATFORM_DRIVER mode`);
      }

      if (delivery.status !== DeliveryStatus.DRIVER_SEARCH && delivery.status !== DeliveryStatus.REASSIGNMENT_REQUIRED) {
        throw new DomainError(`Delivery ${deliveryId} is not available for assignment (current status: ${delivery.status})`);
      }

      if (delivery.driverAssignments.length > 0) {
        throw new DomainError(`Delivery ${deliveryId} has already been claimed by another driver`);
      }

      const donation = delivery.allocation.donation;
      const receiver = delivery.allocation.receiver;

      const donorCoords = { latitude: donation.pickupLatitude, longitude: donation.pickupLongitude };
      const receiverCoords = { latitude: receiver.latitude, longitude: receiver.longitude };

      // Compute Total ETA = ETA(driver -> donor) + ETA(donor -> receiver)
      const etaToDonor = GeoService.estimateTransitMinutes(driverCoords, donorCoords);
      const etaDonorToReceiver = GeoService.estimateTransitMinutes(donorCoords, receiverCoords);
      const totalEtaMinutes = etaToDonor + etaDonorToReceiver;

      const earliest = Math.max(Date.now() + etaToDonor * 60000, donation.availableAt.getTime());
      if (earliest + (etaDonorToReceiver + defaultScoringConfig.pickupBufferMinutes + defaultScoringConfig.deliveryBufferMinutes) * 60000 > donation.safeDeadline.getTime()) throw new DomainError('Insufficient time to complete this delivery safely');
      const driver = await tx.driverProfile.updateMany({ where: { id: driverId, isAvailable: true, assignments: { none: { status: DriverAssignmentStatus.ACCEPTED } } }, data: { isAvailable: false } });
      if (driver.count !== 1) throw new DomainError('Driver is unavailable or already assigned');
      // 2. Create DriverAssignment
      await tx.driverAssignment.create({
        data: {
          deliveryId: delivery.id,
          driverId,
          status: DriverAssignmentStatus.ACCEPTED,
        },
      });

      // 3. Atomically transition Delivery status
      const updatedDelivery = await tx.delivery.update({
        where: { id: delivery.id },
        data: {
          status: DeliveryStatus.DRIVER_ASSIGNED,
          startedAt: new Date(),
        },
        include: {
          driverAssignments: true,
          events: true,
        },
      });

      // 4. Log audit event
      await tx.deliveryEvent.create({
        data: {
          deliveryId: delivery.id,
          fromStatus: delivery.status,
          toStatus: DeliveryStatus.DRIVER_ASSIGNED,
          actorId: driverId,
          actorRole: 'DRIVER',
          metadata: JSON.stringify({
            etaToDonor,
            etaDonorToReceiver,
            totalEtaMinutes,
          }),
        },
      });

      return { delivery: updatedDelivery, totalEtaMinutes };
    });
  }

  /**
   * Resolves simultaneous offers across multiple candidate drivers, selecting the driver
   * with the Lowest Total ETA to Receiver.
   */
  async resolveBestDriverForDelivery(
    deliveryId: string,
    candidates: { driverId: string; coords: Coordinates }[]
  ): Promise<{ assignedDriverId: string; totalEtaMinutes: number; delivery: Delivery }> {
    if (candidates.length === 0) {
      throw new DomainError('No candidate drivers provided');
    }

    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: {
        allocation: {
          include: {
            donation: true,
            receiver: true,
          },
        },
      },
    });

    if (!delivery) {
      throw new DomainError(`Delivery ${deliveryId} not found`);
    }

    const donorCoords = {
      latitude: delivery.allocation.donation.pickupLatitude,
      longitude: delivery.allocation.donation.pickupLongitude,
    };
    const receiverCoords = {
      latitude: delivery.allocation.receiver.latitude,
      longitude: delivery.allocation.receiver.longitude,
    };

    // Calculate total ETA for each candidate
    const scoredCandidates = candidates.map((c) => {
      const etaToDonor = GeoService.estimateTransitMinutes(c.coords, donorCoords);
      const etaDonorToReceiver = GeoService.estimateTransitMinutes(donorCoords, receiverCoords);
      const totalEta = etaToDonor + etaDonorToReceiver;
      return {
        driverId: c.driverId,
        coords: c.coords,
        totalEta,
      };
    });

    // Sort ascending by total ETA (lowest ETA wins)
    scoredCandidates.sort((a, b) => a.totalEta - b.totalEta || a.driverId.localeCompare(b.driverId));
    const winner = scoredCandidates[0];

    const result = await this.acceptPlatformDeliveryJob(deliveryId, winner.driverId, winner.coords);

    return {
      assignedDriverId: winner.driverId,
      totalEtaMinutes: winner.totalEta,
      delivery: result.delivery,
    };
  }

  /**
   * Platform driver cancels an accepted job. Requires a cancellation reason.
   * Transitions status and triggers search for replacement driver.
   */
  async cancelPlatformDriver(
    deliveryId: string,
    driverId: string,
    reason: string
  ): Promise<Delivery> {
    return await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE Delivery SET id = id WHERE id = ${deliveryId}`;
      const delivery = await tx.delivery.findUnique({
        where: { id: deliveryId },
        include: {
          driverAssignments: {
            where: { driverId, status: DriverAssignmentStatus.ACCEPTED },
          },
        },
      });

      if (!delivery) throw new DomainError(`Delivery ${deliveryId} not found`);

      if (!delivery.driverAssignments.length || delivery.pickupVerifiedAt || !this.prePickupStates.includes(delivery.status)) throw new DomainError('Only the assigned driver can cancel before pickup');
      // Update active assignment
      await tx.driverAssignment.updateMany({
        where: { deliveryId, driverId, status: DriverAssignmentStatus.ACCEPTED },
        data: {
          status: DriverAssignmentStatus.CANCELLED,
          cancellationReason: reason,
          cancelledAt: new Date(),
        },
      });

      await tx.driverProfile.update({ where: { id: driverId }, data: { isAvailable: true } });
      // Transition delivery back to search or switch required
      const updatedDelivery = await tx.delivery.update({
        where: { id: deliveryId },
        data: {
          status: DeliveryStatus.DRIVER_SEARCH, // Attempt reassignment
        },
      });

      await tx.deliveryEvent.create({
        data: {
          deliveryId,
          fromStatus: delivery.status,
          toStatus: DeliveryStatus.DRIVER_SEARCH,
          actorId: driverId,
          actorRole: 'DRIVER',
          metadata: JSON.stringify({ cancellationReason: reason }),
        },
      });

      return updatedDelivery;
    });
  }

  /**
   * Receiver assigns or updates their internal logistics personnel.
   */
  async updateReceiverLogisticsPersonnel(
    deliveryId: string,
    personnelInput: ReceiverPersonnelInput,
    actorUserId?: string
  ): Promise<Delivery> {
    return await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE Delivery SET id = id WHERE id = ${deliveryId}`;
      const delivery = await tx.delivery.findUnique({
        where: { id: deliveryId },
        include: { receiverLogisticsAssignment: true },
      });

      if (!delivery) throw new DomainError(`Delivery ${deliveryId} not found`);

      if (delivery.deliveryMode !== DeliveryMode.RECEIVER_LOGISTICS || !this.prePickupStates.includes(delivery.status) || delivery.pickupVerifiedAt) throw new DomainError('Personnel cannot be changed in this delivery state');
      const owner = await tx.donationAllocation.findUniqueOrThrow({ where: { id: delivery.allocationId }, include: { receiver: true } });
      if (actorUserId && actorUserId !== owner.receiver.userId) throw new DomainError('Delivery not found', 404);
      if (!personnelInput.driverName?.trim()) throw new DomainError('Personnel name is required', 400);
      if (delivery.receiverLogisticsAssignment) {
        await tx.receiverLogisticsAssignment.update({
          where: { deliveryId },
          data: {
            driverName: personnelInput.driverName,
            vehicleInfo: personnelInput.vehicleInfo,
            contactMechanism: personnelInput.contactMechanism,
            status: ReceiverLogisticsStatus.ASSIGNED,
          },
        });
      } else {
        await tx.receiverLogisticsAssignment.create({
          data: {
            deliveryId,
            driverName: personnelInput.driverName,
            vehicleInfo: personnelInput.vehicleInfo,
            contactMechanism: personnelInput.contactMechanism,
            status: ReceiverLogisticsStatus.ASSIGNED,
          },
        });
      }

      const updated = await tx.delivery.update({
        where: { id: deliveryId },
        data: { status: DeliveryStatus.RECEIVER_LOGISTICS_ASSIGNED },
      });

      await tx.deliveryEvent.create({
        data: {
          deliveryId,
          fromStatus: delivery.status,
          toStatus: DeliveryStatus.RECEIVER_LOGISTICS_ASSIGNED,
          actorId: actorUserId,
          actorRole: 'RECEIVER',
          metadata: JSON.stringify(personnelInput),
        },
      });

      return updated;
    });
  }

  /**
   * Allows receiver to switch between PLATFORM_DRIVER and RECEIVER_LOGISTICS
   * with strict safety revalidation against safe-donation deadline.
   */
  async switchDeliveryMode(
    deliveryId: string,
    newMode: DeliveryMode,
    personnelInput?: ReceiverPersonnelInput,
    actorUserId?: string
  ): Promise<Delivery> {
    return await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE Delivery SET id = id WHERE id = ${deliveryId}`;
      const delivery = await tx.delivery.findUnique({
        where: { id: deliveryId },
        include: {
          allocation: {
            include: {
              donation: true,
              receiver: true,
            },
          },
        },
      });

      if (!delivery) throw new DomainError(`Delivery ${deliveryId} not found`);

      if (!this.prePickupStates.includes(delivery.status)) throw new DomainError('This delivery can no longer change fulfillment mode');
      if (actorUserId && delivery.allocation.receiver.userId !== actorUserId) throw new DomainError('Delivery not found', 404);
      this.validateMode(newMode, delivery.allocation.receiver.hasOwnLogistics, personnelInput);
      this.assertFeasible(delivery.allocation.donation, delivery.allocation.receiver);
      if (newMode === delivery.deliveryMode) throw new DomainError('Delivery already uses this fulfillment mode');
      if (delivery.pickupVerifiedAt) {
        throw new DomainError('Cannot switch delivery mode after food has already been picked up');
      }

      // Safety re-validation: Can transit be completed before safeDeadline?
      const donorCoords = {
        latitude: delivery.allocation.donation.pickupLatitude,
        longitude: delivery.allocation.donation.pickupLongitude,
      };
      const receiverCoords = {
        latitude: delivery.allocation.receiver.latitude,
        longitude: delivery.allocation.receiver.longitude,
      };

      const feasibility = GeoService.isFeasibleBeforeDeadline(
        donorCoords,
        receiverCoords,
        delivery.allocation.donation.safeDeadline
      );

      if (!feasibility.isFeasible) {
        throw new DomainError(
          `Delivery mode switch rejected: Insufficient time remaining before safe deadline (${delivery.allocation.donation.safeDeadline.toISOString()})`
        );
      }

      const activeAssignments = await tx.driverAssignment.findMany({ where: { deliveryId, status: DriverAssignmentStatus.ACCEPTED } });
      await tx.driverAssignment.updateMany({ where: { deliveryId, status: DriverAssignmentStatus.ACCEPTED }, data: { status: DriverAssignmentStatus.CANCELLED, cancelledAt: new Date(), cancellationReason: 'Fulfillment mode changed' } });
      await tx.driverProfile.updateMany({ where: { id: { in: activeAssignments.map(a => a.driverId) } }, data: { isAvailable: true } });
      await tx.receiverLogisticsAssignment.updateMany({ where: { deliveryId }, data: { status: ReceiverLogisticsStatus.CANCELLED, cancelledAt: new Date() } });
      const reservation = await tx.capacityReservation.findUnique({ where: { allocationId: delivery.allocationId } });
      if (reservation?.status !== CapacityReservationStatus.ACTIVE) throw new DomainError('Capacity reservation is no longer active');
      const newStatus =
        newMode === DeliveryMode.PLATFORM_DRIVER
          ? DeliveryStatus.DRIVER_SEARCH
          : DeliveryStatus.RECEIVER_LOGISTICS_ASSIGNED;

      if (newMode === DeliveryMode.RECEIVER_LOGISTICS && personnelInput) {
        await tx.receiverLogisticsAssignment.upsert({
          where: { deliveryId },
          create: {
            deliveryId,
            driverName: personnelInput.driverName,
            vehicleInfo: personnelInput.vehicleInfo,
            contactMechanism: personnelInput.contactMechanism,
            status: ReceiverLogisticsStatus.ASSIGNED,
          },
          update: {
            driverName: personnelInput.driverName,
            vehicleInfo: personnelInput.vehicleInfo,
            contactMechanism: personnelInput.contactMechanism,
            status: ReceiverLogisticsStatus.ASSIGNED,
          },
        });
      }

      const updated = await tx.delivery.update({
        where: { id: deliveryId },
        data: {
          deliveryMode: newMode,
          status: newStatus,
        },
      });

      await tx.deliveryEvent.create({
        data: {
          deliveryId,
          fromStatus: delivery.status,
          toStatus: newStatus,
          actorId: actorUserId,
          actorRole: 'RECEIVER',
          metadata: JSON.stringify({
            switchedTo: newMode,
            personnel: personnelInput || null,
          }),
        },
      });

      return updated;
    });
  }

  /**
   * Stage 1 Handoff: Transporter submits Pickup OTP at Donor location.
   */
  async verifyPickupOtp(
    deliveryId: string,
    submittedOtp: string,
    actorUserId?: string,
    actorRole?: string
  ): Promise<Delivery> {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE Delivery SET id = id WHERE id = ${deliveryId}`;
      const delivery = await tx.delivery.findUnique({
        where: { id: deliveryId },
        include: { allocation: { include: { donation: true, receiver: true } }, driverAssignments: { include: { driver: true } } },
      });

      if (!delivery) throw new DomainError(`Delivery ${deliveryId} not found`);

      if (delivery.pickupVerifiedAt) {
        throw new DomainError('Pickup has already been verified for this delivery');
      }

      await this.assertCustody(tx, delivery, 'PICKUP', actorUserId);
      const isMatch = OtpService.verifyOtp(submittedOtp, OtpService.reveal(delivery.pickupOtp, `${delivery.allocationId}:PICKUP`));

      // Audit OTP attempt
      await tx.oTPVerification.create({
        data: {
          deliveryId,
          otpType: OTPType.PICKUP,
          generation: delivery.pickupOtpVersion,
          submittedOtp: '[REDACTED]',
          isSuccessful: isMatch,
          verifiedByUserId: actorUserId,
        },
      });

      if (!isMatch) {
        return { otpError: 'Invalid pickup code. Check the code with the donor.' };
      }

      const updated = await tx.delivery.update({
        where: { id: deliveryId },
        data: {
          status: DeliveryStatus.PICKED_UP,
          pickupVerifiedAt: new Date(),
          pickupOtp: '',
        },
      });

      await tx.deliveryEvent.create({
        data: {
          deliveryId,
          fromStatus: delivery.status,
          toStatus: DeliveryStatus.PICKED_UP,
          actorId: actorUserId,
          actorRole: actorRole || 'TRANSPORTER',
          metadata: JSON.stringify({ event: 'PICKUP_VERIFIED' }),
        },
      });

      return updated;
    });
    if ('otpError' in result) throw new DomainError(result.otpError!, 400, 'INVALID_OTP');
    return result;
  }

  /**
   * Stage 2 Handoff: Transporter submits Delivery OTP at Receiver location.
   * Only upon successful verification does the food count as RESCUED and generate an ImpactRecord.
   */
  async verifyDeliveryOtp(
    deliveryId: string,
    submittedOtp: string,
    actorUserId?: string,
    actorRole?: string
  ): Promise<{ delivery: Delivery; impactRecord: ImpactRecord }> {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE Delivery SET id = id WHERE id = ${deliveryId}`;
      const delivery = await tx.delivery.findUnique({
        where: { id: deliveryId },
        include: {
          driverAssignments: { include: { driver: true } },
          allocation: {
            include: {
              donation: true,
              receiver: true,
            },
          },
        },
      });

      if (!delivery) throw new DomainError(`Delivery ${deliveryId} not found`);

      if (!delivery.pickupVerifiedAt) {
        throw new DomainError('Cannot verify delivery before pickup has been verified');
      }

      if (delivery.deliveryVerifiedAt) {
        throw new DomainError('Delivery has already been verified');
      }

      await this.assertCustody(tx, delivery, 'DELIVERY', actorUserId);
      const isMatch = OtpService.verifyOtp(submittedOtp, OtpService.reveal(delivery.deliveryOtp, `${delivery.allocationId}:DELIVERY`));

      // Audit OTP attempt
      await tx.oTPVerification.create({
        data: {
          deliveryId,
          otpType: OTPType.DELIVERY,
          generation: delivery.deliveryOtpVersion,
          submittedOtp: '[REDACTED]',
          isSuccessful: isMatch,
          verifiedByUserId: actorUserId,
        },
      });

      if (!isMatch) {
        return { otpError: 'Invalid delivery code. Check the code with the receiver.' };
      }

      const now = new Date();

      // 1. Mark Delivery COMPLETED
      const updatedDelivery = await tx.delivery.update({
        where: { id: deliveryId },
        data: {
          status: DeliveryStatus.COMPLETED,
          deliveryVerifiedAt: now,
          deliveryOtp: '',
          completedAt: now,
        },
      });

      // 2. Mark Allocation COMPLETED
      await tx.donationAllocation.update({
        where: { id: delivery.allocationId },
        data: { status: AllocationStatus.COMPLETED },
      });

      // 3. Commit Capacity Reservation (move from reserved to current occupancy)
      const allocatedQty = delivery.allocation.allocatedQuantity;
      const committed = await tx.capacityReservation.updateMany({
        where: { allocationId: delivery.allocationId, status: CapacityReservationStatus.ACTIVE },
        data: { status: CapacityReservationStatus.COMMITTED },
      });

      if (committed.count !== 1) throw new DomainError('Capacity reservation is no longer active');
      await tx.receiverProfile.update({
        where: { id: delivery.allocation.receiverId },
        data: {
          reservedIncomingQuantity: { decrement: allocatedQty },
          currentOccupancy: { increment: allocatedQty },
        },
      });

      const assignments = await tx.driverAssignment.findMany({ where: { deliveryId, status: DriverAssignmentStatus.ACCEPTED } });
      await tx.driverAssignment.updateMany({ where: { deliveryId, status: DriverAssignmentStatus.ACCEPTED }, data: { status: DriverAssignmentStatus.COMPLETED } });
      await tx.driverProfile.updateMany({ where: { id: { in: assignments.map(a => a.driverId) } }, data: { isAvailable: true } });
      await tx.receiverLogisticsAssignment.updateMany({ where: { deliveryId, status: { not: ReceiverLogisticsStatus.CANCELLED } }, data: { status: ReceiverLogisticsStatus.DELIVERED } });
      // 4. Calculate Durations
      const pickupDurationMinutes = delivery.startedAt
        ? Number(((delivery.pickupVerifiedAt.getTime() - delivery.startedAt.getTime()) / 60000).toFixed(1))
        : null;

      const deliveryDurationMinutes = Number(
        ((now.getTime() - delivery.pickupVerifiedAt.getTime()) / 60000).toFixed(1)
      );

      const totalDurationMinutes = delivery.startedAt
        ? Number(((now.getTime() - delivery.startedAt.getTime()) / 60000).toFixed(1))
        : deliveryDurationMinutes;

      // 5. Generate verified Impact Record
      const mealsRescued = allocatedQty;
      const weightDivertedKg = Number((mealsRescued * 0.42).toFixed(2));
      const co2eAvoidedKg = Number((weightDivertedKg * 2.50).toFixed(2));

      const impactRecord = await tx.impactRecord.create({
        data: {
          deliveryId: delivery.id,
          allocationId: delivery.allocationId,
          donationId: delivery.allocation.donationId,
          mealsRescued,
          weightDivertedKg,
          co2eAvoidedKg,
          deliveryMode: delivery.deliveryMode,
          pickupDurationMinutes,
          deliveryDurationMinutes,
          totalDurationMinutes,
          completedAt: now,
        },
      });

      // 6. Check if all sibling allocations for parent donation are fulfilled
      const allAllocations = await tx.donationAllocation.findMany({
        where: { donationId: delivery.allocation.donationId },
      });

      const allCompleted = allAllocations.filter(a => a.status === AllocationStatus.COMPLETED).reduce((sum, a) => sum + a.allocatedQuantity, 0) === delivery.allocation.donation.quantity;
      if (allCompleted) {
        await tx.donation.update({
          where: { id: delivery.allocation.donationId },
          data: { status: DonationStatus.FULFILLED },
        });
      }

      await tx.deliveryEvent.create({
        data: {
          deliveryId,
          fromStatus: delivery.status,
          toStatus: DeliveryStatus.COMPLETED,
          actorId: actorUserId,
          actorRole: actorRole || 'RECEIVER',
          metadata: JSON.stringify({
            event: 'DELIVERY_VERIFIED_FOOD_RESCUED',
            mealsRescued,
            co2eAvoidedKg,
          }),
        },
      });

      return { delivery: updatedDelivery, impactRecord };
    });
    if ('otpError' in result) throw new DomainError(result.otpError!, 400, 'INVALID_OTP');
    return result;
  }
  private prePickupStates: DeliveryStatus[] = [DeliveryStatus.DRIVER_SEARCH, DeliveryStatus.DRIVER_ASSIGNED, DeliveryStatus.RECEIVER_LOGISTICS_ASSIGNED, DeliveryStatus.EN_ROUTE_TO_PICKUP, DeliveryStatus.REASSIGNMENT_REQUIRED];
  private validateMode(mode: DeliveryMode, ownsLogistics: boolean, personnel?: ReceiverPersonnelInput) {
    if (!Object.values(DeliveryMode).includes(mode)) throw new DomainError('Invalid fulfillment mode', 400);
    if (mode === DeliveryMode.RECEIVER_LOGISTICS && (!ownsLogistics || !personnel?.driverName?.trim())) throw new DomainError('Own logistics requires an enabled receiver profile and assigned personnel', 400);
  }
  private assertFeasible(donation: any, receiver: any) {
    const feasibility = GeoService.isFeasibleBeforeDeadline(
      { latitude: donation.pickupLatitude, longitude: donation.pickupLongitude }, receiver,
      donation.safeDeadline, new Date(Math.max(Date.now(), donation.availableAt.getTime())));
    if (!feasibility.isFeasible || ['CANCELLED', 'EXPIRED'].includes(donation.status)) throw new DomainError('Insufficient time to complete delivery before the safe deadline');
  }
  private async assertCustody(tx: Prisma.TransactionClient, delivery: any, stage: OTPType, actorUserId?: string) {
    const allowed = delivery.deliveryMode === DeliveryMode.RECEIVER_LOGISTICS
      ? delivery.allocation.receiver.userId === actorUserId
      : delivery.driverAssignments?.some((a: any) => a.status === DriverAssignmentStatus.ACCEPTED && a.driver.userId === actorUserId);
    if (!actorUserId || !allowed) throw new DomainError('Only the assigned transporter can verify custody', 403);
    const states = stage === 'PICKUP' ? ['DRIVER_ASSIGNED', 'RECEIVER_LOGISTICS_ASSIGNED', 'EN_ROUTE_TO_PICKUP'] : ['PICKED_UP', 'EN_ROUTE_TO_RECEIVER'];
    if (!states.includes(delivery.status)) throw new DomainError('Custody cannot be verified in this delivery state');
    if (delivery.allocation.donation.safeDeadline <= new Date()) throw new DomainError('The safe donation deadline has passed');
    if (stage === 'PICKUP' && delivery.allocation.donation.availableAt > new Date()) throw new DomainError('Food is not yet available for pickup');
    const failures = await tx.oTPVerification.count({ where: { deliveryId: delivery.id, otpType: stage, generation: stage === 'PICKUP' ? delivery.pickupOtpVersion : delivery.deliveryOtpVersion, isSuccessful: false } });
    if (failures >= 5) throw new DomainError('Too many incorrect codes. Contact the coordinator.', 429, 'OTP_LOCKED');
  }

}
