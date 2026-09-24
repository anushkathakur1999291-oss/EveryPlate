import { PrismaClient, Prisma, ReceiverProfile, Donation } from '@prisma/client';
import { defaultScoringConfig, ScoringConfig } from '../../config/scoring';
import { GeoService } from '../routing/geo.service';

export interface ScoredReceiver {
  receiver: ReceiverProfile & { user?: { name: string; email: string } };
  availableCapacity: number;
  travelMinutes: number;
  roadDistanceKm: number;
  scores: {
    urgency: number;
    needLevel: number;
    capacityFit: number;
    distance: number;
    composite: number;
  };
  feasibility: {
    isFeasible: boolean;
    estimatedArrival: Date;
    minutesRemaining: number;
  };
}

export class MatchingService {
  private prisma: PrismaClient | Prisma.TransactionClient;
  private config: ScoringConfig;

  constructor(prisma: PrismaClient | Prisma.TransactionClient, config: ScoringConfig = defaultScoringConfig) {
    this.prisma = prisma;
    if (Object.values(config.weights).some(w => !Number.isFinite(w) || w < 0) || Math.abs(Object.values(config.weights).reduce((a,b) => a+b, 0) - 1) > 0.00001) throw new Error('Matching weights must be nonnegative and sum to one');
    this.config = config;
  }

  /**
   * Stage 1: Hard Eligibility Filtering
   * Evaluates if a receiver is eligible to receive this donation.
   */
  async getEligibleReceivers(
    donation: Donation,
    requiredQuantity: number,
    excludedReceiverIds: string[] = [],
    currentTime: Date = new Date()
  ): Promise<{ eligible: ReceiverProfile[]; disqualified: { receiverId: string; reason: string }[] }> {
    const allReceivers = await this.prisma.receiverProfile.findMany({
      orderBy: { id: 'asc' }
    });

    const eligible: ReceiverProfile[] = [];
    const disqualified: { receiverId: string; reason: string }[] = [];

    for (const receiver of allReceivers) {
      // 1. Excluded from previous rejection
      if (excludedReceiverIds.includes(receiver.id)) {
        disqualified.push({ receiverId: receiver.id, reason: 'Previously rejected or explicitly excluded' });
        continue;
      }

      // 2. Active status check
      if (!receiver.acceptingDonations) {
        disqualified.push({ receiverId: receiver.id, reason: 'Receiver is not currently accepting donations' });
        continue;
      }

      // 3. Food Preference compatibility check (HARD CONSTRAINT)
      let parsedPrefs: string[] = [];
      try {
        const parsed = JSON.parse(receiver.foodPreferences);
        parsedPrefs = Array.isArray(parsed) ? parsed.filter(p => typeof p === 'string') : [];
      } catch {
        parsedPrefs = [receiver.foodPreferences];
      }

      if (!parsedPrefs.includes(donation.foodCategory)) {
        disqualified.push({
          receiverId: receiver.id,
          reason: `Food category '${donation.foodCategory}' is not accepted. Prefers: ${parsedPrefs.join(', ')}`,
        });
        continue;
      }

      // 4. Available Capacity check (available_capacity = maxCapacity - currentOccupancy - reservedIncomingQuantity)
      const availableCapacity = receiver.maxCapacity - receiver.currentOccupancy - receiver.reservedIncomingQuantity;
      if (availableCapacity <= 0) {
        disqualified.push({
          receiverId: receiver.id,
          reason: `No available capacity. (Max: ${receiver.maxCapacity}, Occ: ${receiver.currentOccupancy}, Reserved: ${receiver.reservedIncomingQuantity})`,
        });
        continue;
      }

      // 5. Transit Feasibility check (must arrive safely before safeDeadline)
      const feasibility = GeoService.isFeasibleBeforeDeadline(
        { latitude: donation.pickupLatitude, longitude: donation.pickupLongitude },
        { latitude: receiver.latitude, longitude: receiver.longitude },
        donation.safeDeadline,
        new Date(Math.max(currentTime.getTime(), donation.availableAt.getTime()))
      );

      if (!feasibility.isFeasible) {
        disqualified.push({
          receiverId: receiver.id,
          reason: `Transit infeasible before safe deadline. Needed arrival ${feasibility.estimatedArrival.toISOString()} > Deadline ${donation.safeDeadline.toISOString()}`,
        });
        continue;
      }

      eligible.push(receiver);
    }

    return { eligible, disqualified };
  }

  /**
   * Stage 2: Multi-Factor Scoring & Ranking
   * Prioritizes: 1. Safety/Feasibility (guaranteed by Stage 1), 2. Urgency, 3. Need Level, 4. Capacity Fit, 5. Distance
   */
  scoreAndRankReceivers(
    donation: Donation,
    eligibleReceivers: ReceiverProfile[],
    requiredQuantity: number,
    currentTime: Date = new Date()
  ): ScoredReceiver[] {
    const scoredList: ScoredReceiver[] = eligibleReceivers.map((receiver) => {
      const availableCapacity = receiver.maxCapacity - receiver.currentOccupancy - receiver.reservedIncomingQuantity;

      const donorCoords = { latitude: donation.pickupLatitude, longitude: donation.pickupLongitude };
      const receiverCoords = { latitude: receiver.latitude, longitude: receiver.longitude };

      const roadDistanceKm = GeoService.estimateRoadDistanceKm(donorCoords, receiverCoords);
      const travelMinutes = GeoService.estimateTransitMinutes(donorCoords, receiverCoords, this.config.averageSpeedKmH);
      const feasibility = GeoService.isFeasibleBeforeDeadline(donorCoords, receiverCoords, donation.safeDeadline, currentTime);

      // 1. Urgency Score (0-100): More urgent when safeDeadline is closer
      const hoursRemaining = Math.max(0, (donation.safeDeadline.getTime() - currentTime.getTime()) / (3600 * 1000));
      // Under 1 hour = 100 pts, 2 hours = 86 pts, 6 hours = 58 pts, 12+ hours = 20 pts
      const urgencyScore = Math.max(20, Math.min(100, 100 - hoursRemaining * 7));

      // 2. Need Level Score (0-100)
      const needScore = this.config.needLevelScores[receiver.needLevel] || 50;

      // 3. Capacity Fit Score (0-100)
      // Ideal fit: can take 100% of required quantity. Partial fit: proportional.
      const capacityRatio = Math.min(1, availableCapacity / requiredQuantity);
      const capacityFitScore = Math.round(capacityRatio * 100);

      // 4. Distance / Travel Time Score (0-100)
      // Shorter travel time receives higher score
      const distanceScore = Math.max(0, Math.min(100, Math.round(100 - travelMinutes * 2.5)));

      // Composite Weighted Score
      const compositeScore = Number(
        (
          this.config.weights.urgency * urgencyScore +
          this.config.weights.needLevel * needScore +
          this.config.weights.capacityFit * capacityFitScore +
          this.config.weights.distance * distanceScore
        ).toFixed(2)
      );

      return {
        receiver,
        availableCapacity,
        travelMinutes,
        roadDistanceKm,
        scores: {
          urgency: Math.round(urgencyScore),
          needLevel: needScore,
          capacityFit: capacityFitScore,
          distance: distanceScore,
          composite: compositeScore,
        },
        feasibility: {
          isFeasible: feasibility.isFeasible,
          estimatedArrival: feasibility.estimatedArrival,
          minutesRemaining: Math.round(feasibility.minutesRemaining),
        },
      };
    });

    // Sort descending by composite score
    return scoredList.sort((a, b) => b.scores.composite - a.scores.composite || a.receiver.id.localeCompare(b.receiver.id));
  }

  /**
   * Complete Pipeline: Evaluates Stage 1 + Stage 2 and returns ranked candidates
   */
  async matchDonation(
    donation: Donation,
    requiredQuantity: number,
    excludedReceiverIds: string[] = [],
    currentTime: Date = new Date()
  ): Promise<{ ranked: ScoredReceiver[]; disqualified: { receiverId: string; reason: string }[] }> {
    const { eligible, disqualified } = await this.getEligibleReceivers(
      donation,
      requiredQuantity,
      excludedReceiverIds,
      currentTime
    );

    const ranked = this.scoreAndRankReceivers(donation, eligible, requiredQuantity, currentTime);

    return { ranked, disqualified };
  }
}
