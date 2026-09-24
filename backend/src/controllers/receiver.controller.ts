import { pagination, pageRows } from '../middleware/pagination';
import { OtpService } from '../services/otp/otp.service';
import { respondError } from '../lib/errors';
import { Request, Response } from 'express';
import { PrismaClient, Role, DeliveryMode } from '@prisma/client';
import { AllocationEngine } from '../services/allocation/allocation.service';
import { FulfillmentService } from '../services/fulfillment/fulfillment.service';
import { PrivacyMasker } from '../middleware/privacy';
import { SocketService } from '../services/socket/socket.service';

import { prisma } from '../lib/prisma';
const allocationEngine = new AllocationEngine(prisma);
const fulfillmentService = new FulfillmentService(prisma);

export class ReceiverController {
  static async getMyAllocations(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user || !user.receiverProfile) {
        return res.status(403).json({ error: 'Must be logged in as a receiver' });
      }

      const allocations = await prisma.donationAllocation.findMany({
        ...pagination(req),
        where: { receiverId: user.receiverProfile.id },
        include: {
          donation: {
            include: { donor: true },
          },
          delivery: {
            include: {
              driverAssignments: {
                include: { driver: true },
              },
              receiverLogisticsAssignment: true,
            },
          },
          capacityReservation: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });

      const sanitized = pageRows(req, res, allocations).map((alloc) => {
        const cloned = JSON.parse(JSON.stringify(alloc));
        if (cloned.donation) {
          cloned.donation = PrivacyMasker.maskDonationForUser(cloned.donation, user, cloned.delivery?.deliveryMode === 'RECEIVER_LOGISTICS' && !['COMPLETED', 'EXPIRED', 'DELIVERY_FAILED'].includes(cloned.delivery.status));
        }
        if (cloned.delivery) {
          cloned.delivery = PrivacyMasker.maskDeliveryForUser(cloned.delivery, user);
        }
        return cloned;
      });

      res.json(sanitized);
    } catch (err: any) {
      respondError(req, res, err);
    }
  }

  static async acceptAllocation(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = req.user;
      if (!user || !user.receiverProfile) {
        return res.status(403).json({ error: 'Must be logged in as a receiver' });
      }

      const allocation = await prisma.donationAllocation.findUnique({
        where: { id },
      });

      if (!allocation || allocation.receiverId !== user.receiverProfile.id) {
        return res.status(404).json({ error: 'Allocation not found for this receiver' });
      }

      const updated = await allocationEngine.acceptAllocation(id);
      SocketService.emitAllocationAccepted(allocation.donationId, updated);

      res.json({ message: 'Allocation accepted successfully', allocation: updated });
    } catch (err: any) {
      respondError(req, res, err);
    }
  }

  static async rejectAllocation(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { reason = 'Receiver declined recommendation' } = req.body;
      const user = req.user;
      if (!user || !user.receiverProfile) {
        return res.status(403).json({ error: 'Must be logged in as a receiver' });
      }

      const allocation = await prisma.donationAllocation.findUnique({
        where: { id },
      });

      if (!allocation || allocation.receiverId !== user.receiverProfile.id) {
        return res.status(404).json({ error: 'Allocation not found for this receiver' });
      }

      const result = await allocationEngine.rejectAllocation(id, reason);
      SocketService.emitAllocationRejected(allocation.donationId, result.rejectedAllocation, result.rematchResult.matchedReceivers);

      res.json({
        message: 'Allocation rejected and capacity released. Rematching triggered.',
        rejectedAllocation: result.rejectedAllocation,
        rematchSummary: result.rematchResult.matchedReceivers,
      });
    } catch (err: any) {
      respondError(req, res, err);
    }
  }

  static async selectFulfillmentMethod(req: Request, res: Response) {
    try {
      const { id } = req.params; // allocationId
      const { deliveryMode, driverName, vehicleInfo, contactMechanism } = req.body;
      const user = req.user;

      if (!user || !user.receiverProfile) {
        return res.status(403).json({ error: 'Must be logged in as a receiver' });
      }

      if (deliveryMode !== DeliveryMode.PLATFORM_DRIVER && deliveryMode !== DeliveryMode.RECEIVER_LOGISTICS) {
        return res.status(400).json({ error: 'deliveryMode must be PLATFORM_DRIVER or RECEIVER_LOGISTICS' });
      }

      if (deliveryMode === DeliveryMode.RECEIVER_LOGISTICS && !driverName) {
        return res.status(400).json({ error: 'driverName is required when choosing own logistics' });
      }

      const allocation = await prisma.donationAllocation.findUnique({
        where: { id },
      });

      if (!allocation || allocation.receiverId !== user.receiverProfile.id) {
        return res.status(404).json({ error: 'Allocation not found for this receiver' });
      }

      const delivery = await fulfillmentService.createDeliveryForAllocation(
        id,
        deliveryMode,
        deliveryMode === DeliveryMode.RECEIVER_LOGISTICS
          ? { driverName, vehicleInfo, contactMechanism }
          : undefined,
        user.id
      );

      // Emit real-time fulfillment event
      if (deliveryMode === DeliveryMode.PLATFORM_DRIVER) {
        SocketService.emitDriverRequested(delivery);
      } else {
        SocketService.emitReceiverLogisticsSelected(delivery);
      }

      res.status(201).json({
        message: `Fulfillment initialized with mode: ${deliveryMode}`,
        delivery: PrivacyMasker.maskDeliveryForUser(delivery, user),
      });
    } catch (err: any) {
      respondError(req, res, err);
    }
  }

  static async getDeliveryOtp(req: Request, res: Response) {
    try {
      const { deliveryId } = req.params;
      const delivery = await prisma.delivery.findUnique({
        where: { id: deliveryId },
        include: {
          allocation: {
            include: { receiver: true },
          },
        },
      });

      if (!delivery) {
        return res.status(404).json({ error: 'Delivery not found' });
      }

      const user = req.user;
      const isOwnerReceiver = user?.receiverProfile?.id === delivery.allocation.receiverId;
      const isAdmin = user?.role === Role.ADMIN;

      if (!isOwnerReceiver && !isAdmin) {
        return res.status(403).json({ error: 'Only the receiver organization can view the delivery OTP' });
      }

      res.json({
        deliveryId: delivery.id,
        deliveryOtp: OtpService.reveal(delivery.deliveryOtp, `${delivery.allocationId}:DELIVERY`),
        status: delivery.status,
      });
    } catch (err: any) {
      respondError(req, res, err);
    }
  }
}
