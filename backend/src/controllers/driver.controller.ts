import { pagination, pageRows } from '../middleware/pagination';
import { DispatchService } from '../services/fulfillment/dispatch.service';
import { respondError } from '../lib/errors';
import { Request, Response } from 'express';
import { PrismaClient, DeliveryMode, DeliveryStatus, DriverAssignmentStatus } from '@prisma/client';
import { FulfillmentService } from '../services/fulfillment/fulfillment.service';
import { GeoService } from '../services/routing/geo.service';
import { PrivacyMasker } from '../middleware/privacy';
import { SocketService } from '../services/socket/socket.service';

import { prisma } from '../lib/prisma';
const fulfillmentService = new FulfillmentService(prisma);

export class DriverController {
  static async updateLocation(req: Request, res: Response) {
    try {
      if (!req.user?.driverProfile) return res.status(403).json({ error: 'Driver profile required' });
      await prisma.driverProfile.update({ where: { id: req.user.driverProfile.id }, data: { currentLatitude: req.body.latitude, currentLongitude: req.body.longitude, locationUpdatedAt: new Date() } });
      res.json({ updated: true });
    } catch(err) { respondError(req,res,err); }
  }

  static async getAvailableJobs(req: Request, res: Response) {
    try {
      const user = req.user;
      const lat = user?.driverProfile?.currentLatitude;
      const lng = user?.driverProfile?.currentLongitude;
      const driverCoords = lat != null && lng != null ? { latitude: lat, longitude: lng } : null;

      const deliveries = await prisma.delivery.findMany({
        ...pagination(req),
        where: {
          allocation: { donation: { safeDeadline: { gt: new Date() } } },
          deliveryMode: DeliveryMode.PLATFORM_DRIVER,
          status: {
            in: [DeliveryStatus.DRIVER_SEARCH, DeliveryStatus.REASSIGNMENT_REQUIRED],
          },
        },
        include: {
          allocation: {
            include: {
              donation: {
                include: { donor: true },
              },
              receiver: true,
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });

      const formatted = pageRows(req, res, deliveries).map((d) => {
        const donorCoords = {
          latitude: d.allocation.donation.pickupLatitude,
          longitude: d.allocation.donation.pickupLongitude,
        };
        const receiverCoords = {
          latitude: d.allocation.receiver.latitude,
          longitude: d.allocation.receiver.longitude,
        };

        const distanceToPickupKm = driverCoords ? GeoService.estimateRoadDistanceKm(driverCoords, donorCoords) : null;
        const etaToPickupMinutes = driverCoords ? GeoService.estimateTransitMinutes(driverCoords, donorCoords) : null;
        const deliveryTransitMinutes = GeoService.estimateTransitMinutes(donorCoords, receiverCoords);
        const totalEtaMinutes = etaToPickupMinutes == null ? null : etaToPickupMinutes + deliveryTransitMinutes;

        return {
          deliveryId: d.id,
          allocationId: d.allocationId,
          foodCategory: d.allocation.donation.foodCategory,
          foodDescription: d.allocation.donation.foodDescription,
          quantity: d.allocation.allocatedQuantity,
          unit: d.allocation.donation.unit,
          donorName: d.allocation.donation.donor.organizationName,
          donorAddress: 'Exact pickup address available after assignment',
          receiverName: d.allocation.receiver.organizationName,
          receiverAddress: 'Exact destination available after assignment',
          distanceToPickupKm,
          etaToPickupMinutes,
          deliveryTransitMinutes,
          totalEtaMinutes,
          safeDeadline: d.allocation.donation.safeDeadline,
          status: d.status,
        };
      });

      res.json(formatted);
    } catch (err: any) {
      respondError(req, res, err);
    }
  }

  static async getMyJobs(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user || !user.driverProfile) {
        return res.status(403).json({ error: 'Must be logged in as a platform driver' });
      }

      const assignments = await prisma.driverAssignment.findMany({
        where: {
          driverId: user.driverProfile.id,
          status: DriverAssignmentStatus.ACCEPTED,
        },
        include: {
          delivery: {
            include: {
              allocation: {
                include: {
                  donation: { include: { donor: true } },
                  receiver: true,
                },
              },
            },
          },
        },
        orderBy: { assignedAt: 'desc' },
      });

      const sanitized = assignments.map((a) => {
        const cloned = JSON.parse(JSON.stringify(a));
        cloned.delivery = PrivacyMasker.maskDeliveryForUser(cloned.delivery, user, true);
        return cloned;
      });

      res.json(sanitized);
    } catch (err: any) {
      respondError(req, res, err);
    }
  }

  static async claimJob(req: Request, res: Response) {
    try {
      const { id } = req.params; // deliveryId
      const user = req.user;
      if (!user || !user.driverProfile) {
        return res.status(403).json({ error: 'Must be logged in as a platform driver' });
      }

      const { latitude, longitude } = req.body;
      const driverCoords = { latitude: latitude ?? user.driverProfile.currentLatitude, longitude: longitude ?? user.driverProfile.currentLongitude };
      if (driverCoords.latitude == null || driverCoords.longitude == null) return res.status(400).json({ error: 'Provide your current location before claiming a job' });

      const result = await new DispatchService(prisma).claim(
        id,
        user.driverProfile.id,
        { latitude: driverCoords.latitude, longitude: driverCoords.longitude }
      );

      const receiverUserId = (result.delivery as any).allocation?.receiver?.userId;
      // Assignment event is emitted by the dispatch resolver, including recovery paths.

      res.json({
        message: 'Delivery job claimed successfully',
        totalEtaMinutes: result.totalEtaMinutes,
        delivery: PrivacyMasker.maskDeliveryForUser(result.delivery, user),
      });
    } catch (err: any) {
      respondError(req, res, err);
    }
  }

  static async cancelJob(req: Request, res: Response) {
    try {
      const { id } = req.params; // deliveryId
      const { reason } = req.body;
      const user = req.user;

      if (!user || !user.driverProfile) {
        return res.status(403).json({ error: 'Must be logged in as a platform driver' });
      }

      if (!reason || reason.trim().length === 0) {
        return res.status(400).json({ error: 'Cancellation reason is required' });
      }

      const updated = await fulfillmentService.cancelPlatformDriver(id, user.driverProfile.id, reason);
      const receiverUserId = (updated as any).allocation?.receiver?.userId;
      SocketService.emitDriverCancelled(id, reason, receiverUserId);

      res.json({
        message: 'Delivery assignment cancelled. Reassignment search initiated.',
        delivery: PrivacyMasker.maskDeliveryForUser(updated, user),
      });
    } catch (err: any) {
      respondError(req, res, err);
    }
  }
}
