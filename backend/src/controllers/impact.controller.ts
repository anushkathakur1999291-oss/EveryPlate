import { stripSecrets } from '../middleware/privacy';
import { respondError } from '../lib/errors';
import { Request, Response } from 'express';
import { PrismaClient, DeliveryMode, DeliveryStatus, DonationStatus } from '@prisma/client';

import { prisma } from '../lib/prisma';

export class ImpactController {
  /**
   * Aggregates genuine impact records computed strictly from verified completed deliveries
   */
  static async getImpactSummary(req: Request, res: Response) {
    try {
      const [totals, modes] = await Promise.all([
        prisma.impactRecord.aggregate({ _sum: { mealsRescued: true, weightDivertedKg: true, co2eAvoidedKg: true }, _avg: { pickupDurationMinutes: true, deliveryDurationMinutes: true, totalDurationMinutes: true }, _count: { _all: true } }),
        prisma.impactRecord.groupBy({ by: ['deliveryMode'], _count: { _all: true }, _avg: { totalDurationMinutes: true } }),
      ]);
      const round = (n: number | null | undefined, digits = 1) => Number((n || 0).toFixed(digits));
      const totalMealsRescued = totals._sum.mealsRescued || 0;
      const totalWeightDivertedKg = round(totals._sum.weightDivertedKg, 2);
      const totalCo2eAvoidedKg = round(totals._sum.co2eAvoidedKg, 2);
      const platform = modes.find(m => m.deliveryMode === DeliveryMode.PLATFORM_DRIVER);
      const receiver = modes.find(m => m.deliveryMode === DeliveryMode.RECEIVER_LOGISTICS);
      const platformDeliveries = platform?._count._all || 0;
      const receiverLogisticsDeliveries = receiver?._count._all || 0;
      const avgPickupMins = round(totals._avg.pickupDurationMinutes);
      const avgDeliveryMins = round(totals._avg.deliveryDurationMinutes);
      const avgTotalMins = round(totals._avg.totalDurationMinutes);
      const avgPlatformTotalMins = round(platform?._avg.totalDurationMinutes);
      const avgReceiverTotalMins = round(receiver?._avg.totalDurationMinutes);
      const successfulDeliveries = totals._count._all;
      const failedDeliveries = await prisma.delivery.count({
        where: { status: DeliveryStatus.DELIVERY_FAILED },
      });
      const expiredDonations = await prisma.donation.count({
        where: { status: DonationStatus.EXPIRED },
      });

      // Environmental Equivalents (EPA / UN FAO Standard Conversion Metrics)
      // 1. Trees planted equivalent: ~21.77 kg CO2 absorbed per urban tree per year
      const treesPlantedEquivalent = totalCo2eAvoidedKg > 0
        ? Number((totalCo2eAvoidedKg / 21.77).toFixed(1))
        : 0;

      // 2. Passenger vehicle miles offset: ~0.404 kg CO2 emitted per average passenger vehicle mile
      const passengerVehicleMilesOffset = totalCo2eAvoidedKg > 0
        ? Number((totalCo2eAvoidedKg / 0.404).toFixed(1))
        : 0;

      // 3. Landfill volume spared: ~475 kg/m3 organic waste density in landfills (~0.0021 m3/kg)
      const landfillVolumeSparedM3 = totalWeightDivertedKg > 0
        ? Number((totalWeightDivertedKg * 0.0021).toFixed(2))
        : 0;

      const landfillVolumeSparedLiters = totalWeightDivertedKg > 0
        ? Number((totalWeightDivertedKg * 2.1).toFixed(1))
        : 0;

      // 4. Embedded water footprint conserved: ~1,000 liters of freshwater per kg of food
      const freshwaterPreservedLiters = Math.round(totalWeightDivertedKg * 1000);

      // Transit Efficiency & Matching Speed
      const categoryRows = await prisma.$queryRaw<{ category: string; meals: number; weight: number; co2: number }[]>`
        SELECT d.foodCategory AS category, SUM(i.mealsRescued) AS meals,
          SUM(i.weightDivertedKg) AS weight, SUM(i.co2eAvoidedKg) AS co2
        FROM ImpactRecord i JOIN Donation d ON d.id = i.donationId GROUP BY d.foodCategory`;
      const matching = await prisma.$queryRaw<{ average: number | null }[]>`
        SELECT AVG(MAX(0, a.createdAt - d.createdAt) / 60000.0) AS average
        FROM ImpactRecord i JOIN DonationAllocation a ON a.id = i.allocationId JOIN Donation d ON d.id = a.donationId`;
      const avgMatchingMins = round(matching[0]?.average);
      const categoryMap: Record<string, { meals: number; weightKg: number; co2eKg: number }> = {};
      for (const row of categoryRows) categoryMap[row.category] = { meals: Number(row.meals), weightKg: round(Number(row.weight), 2), co2eKg: round(Number(row.co2), 2) };

      // Recent verified rescues (audit feed)
      const recentImpactRecords = await prisma.impactRecord.findMany({
        take: 10,
        orderBy: { completedAt: 'desc' },
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
      });

      const recentRescues = recentImpactRecords.map((ir) => ({
        id: ir.id,
        mealsRescued: ir.mealsRescued,
        weightDivertedKg: ir.weightDivertedKg,
        co2eAvoidedKg: ir.co2eAvoidedKg,
        deliveryMode: ir.deliveryMode,
        donorName: ir.delivery?.allocation?.donation?.donor?.organizationName || 'Donor',
        receiverName: ir.delivery?.allocation?.receiver?.organizationName || 'Receiver',
        foodDescription: ir.delivery?.allocation?.donation?.foodDescription || 'Rescued Food',
        foodCategory: ir.delivery?.allocation?.donation?.foodCategory || 'COOKED_MEALS',
        completedAt: ir.completedAt.toISOString(),
      }));

      res.json({
        totalMealsRescued,
        totalWeightDivertedKg,
        totalCo2eAvoidedKg,
        successfulDeliveries,
        failedDeliveries,
        expiredDonations,
        deliveryModeBreakdown: {
          platformDriver: platformDeliveries,
          receiverLogistics: receiverLogisticsDeliveries,
          total: successfulDeliveries,
        },
        durations: {
          averagePickupMinutes: avgPickupMins,
          averageDeliveryMinutes: avgDeliveryMins,
          averageTotalMinutes: avgTotalMins,
        },
        environmentalEquivalents: {
          treesPlantedEquivalent,
          passengerVehicleMilesOffset,
          landfillVolumeSparedM3,
          landfillVolumeSparedLiters,
          freshwaterPreservedLiters,
        },
        transitEfficiency: {
          averageMatchingMinutes: avgMatchingMins,
          averagePickupMinutes: avgPickupMins,
          averageDeliveryMinutes: avgDeliveryMins,
          averageTotalMinutes: avgTotalMins,
          platformDriverAverageTotalMinutes: avgPlatformTotalMins,
          receiverLogisticsAverageTotalMinutes: avgReceiverTotalMins,
        },
        categoryBreakdown: categoryMap,
        recentRescues,
      });
    } catch (err: any) {
      respondError(req, res, err);
    }
  }

  /**
   * Admin Command Center operational view
   */
  static async getAdminDashboard(req: Request, res: Response) {
    try {
      const activeDonations = await prisma.donation.findMany({
        take: 100,
        where: {
          status: { in: [DonationStatus.CREATED, DonationStatus.MATCHING, DonationStatus.PARTIALLY_MATCHED, DonationStatus.FULLY_MATCHED] },
        },
        include: { donor: true, allocations: { include: { receiver: true, delivery: true } } },
      });

      const activeReceivers = await prisma.receiverProfile.findMany({
        take: 100,
        include: { user: { select: { name: true, email: true } } },
      });

      const availableDrivers = await prisma.driverProfile.findMany({
        take: 100,
        where: { isAvailable: true },
        include: { user: { select: { name: true, email: true } } },
      });

      const activeDeliveries = await prisma.delivery.findMany({
        take: 100,
        where: {
          status: {
            notIn: [DeliveryStatus.COMPLETED, DeliveryStatus.DELIVERY_FAILED, DeliveryStatus.EXPIRED],
          },
        },
        include: {
          allocation: {
            include: {
              donation: { include: { donor: true } },
              receiver: true,
            },
          },
          driverAssignments: { include: { driver: true } },
          receiverLogisticsAssignment: true,
        },
      });

      const [activeDonationsCount, activeReceiversCount, availableDriversCount, activeDeliveriesCount] = await Promise.all([
        prisma.donation.count({ where: { status: { in: ['CREATED','MATCHING','PARTIALLY_MATCHED','FULLY_MATCHED'] } } }),
        prisma.receiverProfile.count(),
        prisma.driverProfile.count({ where: { isAvailable: true } }),
        prisma.delivery.count({ where: { status: { notIn: ['COMPLETED','DELIVERY_FAILED','EXPIRED'] } } }),
      ]);
      res.json({
        mapLimit: 100,
        activeDonationsCount,
        activeReceiversCount,
        availableDriversCount,
        activeDeliveriesCount,
        activeDonations: stripSecrets(activeDonations),
        activeReceivers: stripSecrets(activeReceivers),
        availableDrivers: stripSecrets(availableDrivers),
        activeDeliveries: stripSecrets(activeDeliveries),
      });
    } catch (err: any) {
      respondError(req, res, err);
    }
  }
}
