import { pagination, pageRows } from '../middleware/pagination';
import { OtpService } from '../services/otp/otp.service';
import { respondError } from '../lib/errors';
import { Request, Response } from 'express';
import { PrismaClient, DonationStatus, Role } from '@prisma/client';
import { AllocationEngine } from '../services/allocation/allocation.service';
import { PrivacyMasker } from '../middleware/privacy';
import { SocketService } from '../services/socket/socket.service';

import { prisma } from '../lib/prisma';
const allocationEngine = new AllocationEngine(prisma);

export class DonationController {
  /**
   * Donor creates surplus food donation.
   * Matching engine is immediately triggered.
   * Donor CANNOT manually choose a receiver.
   */
  static async createDonation(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user || user.role !== Role.DONOR || !user.donorProfile) {
        return res.status(403).json({ error: 'Only registered donors can create donations' });
      }

      const {
        foodCategory,
        foodDescription,
        quantity,
        unit = 'meals',
        pickupAddress,
        pickupLatitude,
        pickupLongitude,
        availableAt,
        safeDeadline,
        imageUrl,
        notes,
      } = req.body;

      if (!foodCategory || !foodDescription || !quantity || !safeDeadline) {
        return res.status(400).json({ error: 'Missing required donation fields' });
      }

      const parsedQty = parseInt(quantity, 10);
      if (isNaN(parsedQty) || parsedQty <= 0) {
        return res.status(400).json({ error: 'Quantity must be a positive integer' });
      }

      const parsedSafeDeadline = new Date(safeDeadline);
      if (isNaN(parsedSafeDeadline.getTime()) || parsedSafeDeadline.getTime() <= Date.now()) {
        return res.status(400).json({ error: 'Safe donation deadline must be in the future' });
      }

      const parsedAvailableAt = availableAt ? new Date(availableAt) : new Date();

      // Create donation
      const donation = await prisma.donation.create({
        data: {
          donorId: user.donorProfile.id,
          foodCategory,
          foodDescription,
          quantity: parsedQty,
          unit,
          pickupAddress: pickupAddress || user.donorProfile.address,
          pickupLatitude: pickupLatitude ?? user.donorProfile.latitude,
          pickupLongitude: pickupLongitude ?? user.donorProfile.longitude,
          availableAt: parsedAvailableAt,
          safeDeadline: parsedSafeDeadline,
          imageUrl,
          notes,
          status: DonationStatus.MATCHING,
        },
      });

      // Trigger automatic matching & allocation proposals
      let allocationResult;
      try { allocationResult = await allocationEngine.proposeAllocationsForDonation(donation.id); }
      catch { console.error(JSON.stringify({ level: 'warn', event: 'MATCHING_RETRY_SCHEDULED', donationId: donation.id, requestId: res.locals.requestId })); }


      // Fetch fresh donation with allocations
      const fullDonation = await prisma.donation.findUnique({
        where: { id: donation.id },
        include: {
          donor: true,
          allocations: {
            include: {
              receiver: true,
              delivery: true,
            },
          },
        },
      });

      const sanitized = PrivacyMasker.maskDonationForUser(fullDonation, user);

      // Emit real-time events
      SocketService.emitDonationCreated(sanitized);
      if (fullDonation?.allocations) {
        for (const alloc of fullDonation.allocations) {
          if (alloc.receiver?.userId) {
            SocketService.emitMatchFound(alloc.receiver.userId, alloc);
          }
        }
      }

      res.status(201).json({
        donation: sanitized,
        matchingSummary: allocationResult?.matchedReceivers || [],
        unallocatedQuantity: allocationResult?.unallocatedQuantity ?? donation.quantity,
      });
    } catch (err: any) {
      respondError(req, res, err);
    }
  }

  static async getMyDonations(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user || !user.donorProfile) {
        return res.status(403).json({ error: 'Must be logged in as a donor' });
      }

      const donations = await prisma.donation.findMany({
        ...pagination(req),
        where: { donorId: user.donorProfile.id },
        include: {
          allocations: {
            include: {
              receiver: {
                select: {
                  id: true,
                  organizationName: true,
                  needLevel: true,
                },
              },
              delivery: {
                include: {
                  driverAssignments: {
                    include: { driver: true },
                  },
                  receiverLogisticsAssignment: true,
                },
              },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });

      const sanitized = pageRows(req, res, donations).map((d) => PrivacyMasker.maskDonationForUser(d, user));
      res.json(sanitized);
    } catch (err: any) {
      respondError(req, res, err);
    }
  }

  static async getDonationById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const donation = await prisma.donation.findUnique({
        where: { id },
        include: {
          donor: true,
          allocations: {
            include: {
              receiver: true,
              delivery: {
                include: {
                  driverAssignments: {
                    include: { driver: true },
                  },
                  receiverLogisticsAssignment: true,
                },
              },
            },
          },
        },
      });

      if (!donation) {
        return res.status(404).json({ error: 'Donation not found' });
      }

      const user = req.user;
      const involved = user?.role === 'ADMIN' || (!!user?.donorProfile && donation.donorId === user.donorProfile.id) ||
        donation.allocations.some(a => (!!user?.receiverProfile && a.receiverId === user.receiverProfile.id) ||
          a.delivery?.driverAssignments.some(d => d.status === 'ACCEPTED' && d.driverId === user?.driverProfile?.id));
      if (!involved) return res.status(404).json({ error: 'Donation not found' });
      res.json(PrivacyMasker.maskDonationForUser(donation, req.user));
    } catch (err: any) {
      respondError(req, res, err);
    }
  }

  /**
   * Only the donor (or admin) can retrieve the pickup OTP to share with the transporter upon arrival.
   */
  static async getPickupOtp(req: Request, res: Response) {
    try {
      const { deliveryId } = req.params;
      const delivery = await prisma.delivery.findUnique({
        where: { id: deliveryId },
        include: {
          allocation: {
            include: { donation: true },
          },
        },
      });

      if (!delivery) {
        return res.status(404).json({ error: 'Delivery not found' });
      }

      const user = req.user;
      const isOwnerDonor = user?.donorProfile?.id === delivery.allocation.donation.donorId;
      const isAdmin = user?.role === Role.ADMIN;

      if (!isOwnerDonor && !isAdmin) {
        return res.status(403).json({ error: 'Only the donor organization can view the pickup OTP' });
      }

      res.json({
        deliveryId: delivery.id,
        pickupOtp: OtpService.reveal(delivery.pickupOtp, `${delivery.allocationId}:PICKUP`),
        status: delivery.status,
      });
    } catch (err: any) {
      respondError(req, res, err);
    }
  }
}
