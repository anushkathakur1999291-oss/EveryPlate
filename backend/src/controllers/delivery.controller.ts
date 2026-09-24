import { OtpRecoveryService } from '../services/otp/recovery.service';
import { respondError } from '../lib/errors';
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { FulfillmentService } from '../services/fulfillment/fulfillment.service';
import { PrivacyMasker } from '../middleware/privacy';
import { SocketService } from '../services/socket/socket.service';

import { prisma } from '../lib/prisma';
const fulfillmentService = new FulfillmentService(prisma);

export class DeliveryController {
  static async reissueOtp(req: Request, res: Response) {
    try {
      const stage = req.body.stage;
      if (!req.user || !['PICKUP','DELIVERY'].includes(stage)) return res.status(400).json({ error: 'Choose PICKUP or DELIVERY' });
      const result = await new OtpRecoveryService(prisma).reissue(req.params.id,stage,req.user.id);
      res.json(result);
    } catch(err) { respondError(req,res,err); }
  }

  static async getDeliveryDetails(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const delivery = await prisma.delivery.findUnique({
        where: { id },
        include: {
          allocation: {
            include: {
              donation: { include: { donor: true } },
              receiver: true,
            },
          },
          driverAssignments: { include: { driver: true } },
          receiverLogisticsAssignment: true,
          events: { orderBy: { timestamp: 'desc' } },
          impactRecord: true,
        },
      });

      if (!delivery) {
        return res.status(404).json({ error: 'Delivery not found' });
      }

      res.json(PrivacyMasker.maskDeliveryForUser(delivery, req.user));
    } catch (err: any) {
      respondError(req, res, err);
    }
  }

  static async verifyPickupOtp(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { otp } = req.body;
      const user = req.user;

      if (!otp) {
        return res.status(400).json({ error: 'Pickup OTP is required' });
      }

      const updated = await fulfillmentService.verifyPickupOtp(
        id,
        otp,
        user?.id,
        user?.role
      );

      // Fetch parties to emit real-time event
      const deliveryWithUsers = await prisma.delivery.findUnique({
        where: { id },
        include: {
          allocation: {
            include: {
              donation: { include: { donor: true } },
              receiver: true,
            },
          },
        },
      });
      const donorUserId = deliveryWithUsers?.allocation?.donation?.donor?.userId;
      const receiverUserId = deliveryWithUsers?.allocation?.receiver?.userId;
      SocketService.emitPickupVerified(updated, donorUserId, receiverUserId);

      res.json({
        message: 'Pickup OTP verified! Food successfully collected.',
        delivery: PrivacyMasker.maskDeliveryForUser(updated, user),
      });
    } catch (err: any) {
      respondError(req, res, err);
    }
  }

  static async verifyDeliveryOtp(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { otp } = req.body;
      const user = req.user;

      if (!otp) {
        return res.status(400).json({ error: 'Delivery OTP is required' });
      }

      const { delivery, impactRecord } = await fulfillmentService.verifyDeliveryOtp(
        id,
        otp,
        user?.id,
        user?.role
      );

      // Fetch parties to emit real-time event
      const deliveryWithUsers = await prisma.delivery.findUnique({
        where: { id },
        include: {
          allocation: {
            include: {
              donation: { include: { donor: true } },
              receiver: true,
            },
          },
        },
      });
      const donorUserId = deliveryWithUsers?.allocation?.donation?.donor?.userId;
      const receiverUserId = deliveryWithUsers?.allocation?.receiver?.userId;
      SocketService.emitDeliveryVerified(delivery, impactRecord, donorUserId, receiverUserId);

      res.json({
        message: 'Delivery OTP verified! Food successfully rescued and impact recorded.',
        delivery: PrivacyMasker.maskDeliveryForUser(delivery, user),
        impactRecord,
      });
    } catch (err: any) {
      respondError(req, res, err);
    }
  }

  static async switchMode(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { newMode, driverName, vehicleInfo, contactMechanism } = req.body;
      const user = req.user;

      if (!newMode) {
        return res.status(400).json({ error: 'newMode is required (PLATFORM_DRIVER or RECEIVER_LOGISTICS)' });
      }

      const updated = await fulfillmentService.switchDeliveryMode(
        id,
        newMode,
        driverName ? { driverName, vehicleInfo, contactMechanism } : undefined,
        user?.id
      );

      if (newMode === 'PLATFORM_DRIVER') SocketService.emitDriverRequested(updated);
      else SocketService.emitReceiverLogisticsSelected(updated);
      res.json({
        message: `Delivery mode successfully switched to ${newMode}`,
        delivery: PrivacyMasker.maskDeliveryForUser(updated, user),
      });
    } catch (err: any) {
      respondError(req, res, err);
    }
  }
}
