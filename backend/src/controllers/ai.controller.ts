import { prisma } from '../lib/prisma';
import { GeoService } from '../services/routing/geo.service';
import { respondError } from '../lib/errors';
import { Request, Response } from 'express';
import { LayaService } from '../services/ai/laya.service';

export class AIController {
  /**
   * System-1 Surplus Donation Parser
   * Accepts raw kitchen notes / speech-to-text transcript and outputs typed parameters
   */
  static async parseDonation(req: Request, res: Response) {
    try {
      const { text } = req.body;

      if (!text || typeof text !== 'string' || text.trim().length === 0 || text.length > 4000) {
        return res.status(400).json({ error: 'Text string is required for AI surplus parsing' });
      }

      const result = await LayaService.parseDonation(text);
      res.json(result);
    } catch (err: any) {
      respondError(req, res, err);
    }
  }

  /**
   * System-1 Fulfillment Mode Recommendation
   * Evaluates urgency, driver availability, and receiver equipment to recommend optimal dispatch mode
   */
  static async recommendMode(req: Request, res: Response) {
    try {
      if (typeof req.body?.allocationId !== 'string' || !req.user?.receiverProfile) return res.status(400).json({ error: 'A receiver allocation is required' });
      const allocation = await prisma.donationAllocation.findFirst({ where: { id: req.body.allocationId, receiverId: req.user.receiverProfile.id }, include: { donation: true, receiver: true } });
      if (!allocation) return res.status(404).json({ error: 'Allocation not found' });
      const availablePlatformDrivers = await prisma.driverProfile.count({ where: { isAvailable: true, assignments: { none: { status: 'ACCEPTED' } } } });
      const recommendation = await LayaService.recommendFulfillmentMode({
        timeRemainingMins: Math.max(0, (allocation.donation.safeDeadline.getTime() - Date.now()) / 60000),
        availablePlatformDrivers,
        distanceKm: GeoService.estimateRoadDistanceKm({ latitude: allocation.donation.pickupLatitude, longitude: allocation.donation.pickupLongitude }, allocation.receiver),
        receiverHasOwnLogistics: allocation.receiver.hasOwnLogistics,
        foodCategory: allocation.donation.foodCategory,
      });

      res.json(recommendation);
    } catch (err: any) {
      respondError(req, res, err);
    }
  }

  /**
   * Status and availability check for local food vision engine
   */
  static async getVisionStatus(req: Request, res: Response) {
    try {
      const { FoodVisionService } = await import('../services/ai/food-vision.service');
      const status = await FoodVisionService.checkStatus();
      res.json(status);
    } catch (err: any) {
      respondError(req, res, err);
    }
  }

  /**
   * Local Vision Analysis for Donor Food Images
   */
  static async analyzeFoodImage(req: Request, res: Response) {
    try {
      const { imageBase64, mimeType } = req.body;
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({ error: 'imageBase64 string is required for food vision analysis' });
      }

      const { FoodVisionService } = await import('../services/ai/food-vision.service');
      const result = await FoodVisionService.analyzeFoodImage(imageBase64, mimeType);
      res.json(result);
    } catch (err: any) {
      respondError(req, res, err);
    }
  }
}
