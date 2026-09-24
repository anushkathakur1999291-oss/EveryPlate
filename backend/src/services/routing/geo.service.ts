import { defaultScoringConfig } from '../../config/scoring';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export class GeoService {
  /**
   * Calculates the Haversine distance between two coordinates in kilometers
   */
  static calculateHaversineDistanceKm(pointA: Coordinates, pointB: Coordinates): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(pointB.latitude - pointA.latitude);
    const dLon = this.toRadians(pointB.longitude - pointA.longitude);

    const lat1 = this.toRadians(pointA.latitude);
    const lat2 = this.toRadians(pointB.latitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Estimates road network distance applying an urban circuity factor (~1.25x)
   */
  static estimateRoadDistanceKm(pointA: Coordinates, pointB: Coordinates): number {
    const haversine = this.calculateHaversineDistanceKm(pointA, pointB);
    const circuityFactor = 1.25; // Standard urban grid circuity factor
    return Number((haversine * circuityFactor).toFixed(2));
  }

  /**
   * Estimates total transit duration in minutes between two points
   */
  static estimateTransitMinutes(
    pointA: Coordinates,
    pointB: Coordinates,
    speedKmH: number = defaultScoringConfig.averageSpeedKmH
  ): number {
    const roadDistanceKm = this.estimateRoadDistanceKm(pointA, pointB);
    const travelHours = roadDistanceKm / speedKmH;
    const travelMinutes = travelHours * 60;
    return Math.ceil(travelMinutes);
  }

  /**
   * Checks whether travel from donor to receiver plus loading/unloading
   * can arrive before the safe donation deadline
   */
  static isFeasibleBeforeDeadline(
    donorCoords: Coordinates,
    receiverCoords: Coordinates,
    safeDeadline: Date,
    currentTime: Date = new Date()
  ): { isFeasible: boolean; estimatedArrival: Date; minutesRemaining: number; travelMinutes: number } {
    const travelMinutes = this.estimateTransitMinutes(donorCoords, receiverCoords);
    const totalRequiredMinutes =
      travelMinutes +
      defaultScoringConfig.pickupBufferMinutes +
      defaultScoringConfig.deliveryBufferMinutes;

    const estimatedArrival = new Date(currentTime.getTime() + totalRequiredMinutes * 60 * 1000);
    const minutesRemaining = (safeDeadline.getTime() - currentTime.getTime()) / (60 * 1000);

    const isFeasible = estimatedArrival.getTime() <= safeDeadline.getTime();

    return {
      isFeasible,
      estimatedArrival,
      minutesRemaining,
      travelMinutes,
    };
  }

  private static toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }
}
