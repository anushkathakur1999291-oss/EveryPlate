export interface ScoringWeights {
  urgency: number;     // e.g. 0.35
  needLevel: number;   // e.g. 0.30
  capacityFit: number; // e.g. 0.20
  distance: number;    // e.g. 0.15
}

export interface ScoringConfig {
  weights: ScoringWeights;
  averageSpeedKmH: number;      // Average urban road speed (km/h)
  pickupBufferMinutes: number;  // Estimated time to load food at donor
  deliveryBufferMinutes: number;// Estimated time to unload food at receiver
  needLevelScores: {
    HIGH: number;
    MEDIUM: number;
    LOW: number;
  };
}

export const defaultScoringConfig: ScoringConfig = {
  weights: {
    urgency: 0.35,
    needLevel: 0.30,
    capacityFit: 0.20,
    distance: 0.15,
  },
  averageSpeedKmH: 25.0, // 25 km/h urban traffic speed
  pickupBufferMinutes: 10,
  deliveryBufferMinutes: 10,
  needLevelScores: {
    HIGH: 100,
    MEDIUM: 60,
    LOW: 25,
  },
};
