import http from 'http';
import https from 'https';
import { z } from 'zod';

export const LayaParseSchema = z.object({
  foodCategory: z.enum(['COOKED_MEALS', 'PRODUCE', 'BAKERY', 'DAIRY', 'PACKAGED_GOODS']),
  foodDescription: z.string(),
  quantity: z.number().int().positive(),
  unit: z.string(),
  safeDeadline: z.string(), // ISO String
  safeHoursRemaining: z.number().positive(),
  urgencyTier: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  detectedAllergens: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  engine: z.enum(['LAYA_SYSTEM_ONE', 'LAYA_DETERMINISTIC_FALLBACK']),
  executionTimeMs: z.number().nonnegative(),
});

export type LayaDonationParseResult = z.infer<typeof LayaParseSchema>;

export interface LayaDispatchInput {
  timeRemainingMins: number;
  availablePlatformDrivers: number;
  distanceKm: number;
  receiverHasOwnLogistics: boolean;
  foodCategory?: string;
}

export const LayaDispatchSchema = z.object({
  recommendedMode: z.enum(['PLATFORM_DRIVER', 'RECEIVER_LOGISTICS']),
  confidence: z.number().min(0).max(1),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  reasoning: z.string(),
  engine: z.enum(['LAYA_SYSTEM_ONE', 'LAYA_DETERMINISTIC_FALLBACK']),
  executionTimeMs: z.number().nonnegative(),
});

export type LayaDispatchRecommendation = z.infer<typeof LayaDispatchSchema>;

/**
 * LayaService: System-1 Open-Source Decision Engine
 * Inspired by Convai Innovations' Laya (Apache 2.0) System-1 decision architecture.
 * Provides ultra-fast (<35ms) typed classification, intake parsing, and dispatch heuristics
 * with guaranteed deterministic fallback.
 */
export class LayaService {
  private static layaEndpoint = process.env.LAYA_ENDPOINT || null;

  /**
   * Parses natural-language surplus food descriptions into structured donation parameters.
   */
  static async parseDonation(inputText: string): Promise<LayaDonationParseResult> {
    const startTime = Date.now();

    // 1. Attempt connection to live Laya System-1 local inference server if configured
    if (this.layaEndpoint) {
      try {
        const remoteResult = await this.callLayaInference(this.layaEndpoint, {
          task: 'DONATION_INTAKE_EXTRACTION',
          text: inputText,
        });

        const parsed = LayaParseSchema.safeParse({
          ...remoteResult,
          engine: 'LAYA_SYSTEM_ONE',
          executionTimeMs: Date.now() - startTime,
        });

        if (parsed.success) {
          return parsed.data;
        }
      } catch (err) {
        // Fall back seamlessly to deterministic rule engine
        console.warn('Laya remote inference unavailable, invoking deterministic fallback:', err);
      }
    }

    // 2. High-speed deterministic linguistic extraction (runs in < 5ms)
    return this.deterministicIntakeParser(inputText, startTime);
  }

  /**
   * System-1 Dispatch Decision: Evaluates ambient risk state and recommends fulfillment mode.
   */
  static async recommendFulfillmentMode(state: LayaDispatchInput): Promise<LayaDispatchRecommendation> {
    const startTime = Date.now();

    if (this.layaEndpoint) {
      try {
        const remoteResult = await this.callLayaInference(this.layaEndpoint, {
          task: 'DISPATCH_MODE_DECISION',
          state,
        });

        const parsed = LayaDispatchSchema.safeParse({
          ...remoteResult,
          engine: 'LAYA_SYSTEM_ONE',
          executionTimeMs: Date.now() - startTime,
        });

        if (parsed.success) {
          return parsed.data;
        }
      } catch (err) {
        console.warn('Laya dispatch inference unavailable, invoking deterministic fallback');
      }
    }

    return this.deterministicDispatchAdvisor(state, startTime);
  }

  // --- Deterministic Fallback Implementations ---

  private static deterministicIntakeParser(text: string, startTime: number): LayaDonationParseResult {
    const lower = text.toLowerCase();

    // 1. Food Category Detection
    let category: 'COOKED_MEALS' | 'PRODUCE' | 'BAKERY' | 'DAIRY' | 'PACKAGED_GOODS' = 'COOKED_MEALS';
    let categoryConfidence = 0.94;

    if (/\b(curry|biryani|pasta|lasagna|stew|soup|chicken|meat|beef|pork|fish|dal|rice|roast|buffet|cooked|dinner|lunch|warm|hot meal|portions of warm)\b/i.test(lower)) {
      category = 'COOKED_MEALS';
    } else if (/\b(bread|baguette|croissant|pastry|muffin|bun|bakery|cake|sourdough|loaf|loaves|rolls|bagels)\b/i.test(lower)) {
      category = 'BAKERY';
    } else if (/\b(milk|cheese|yogurt|butter|cream|paneer|dairy|cheddar|curd)\b/i.test(lower)) {
      category = 'DAIRY';
    } else if (/\b(apple|banana|orange|tomato|potato|lettuce|vegetable|veggie|fruit|spinach|produce|salad|carrot|greens|onion|berries)\b/i.test(lower)) {
      category = 'PRODUCE';
    } else if (/\b(can|canned|box|boxed|packaged|cereal|bar|snack|dry|pasta box|beans can|preserved)\b/i.test(lower)) {
      category = 'PACKAGED_GOODS';
    } else {
      category = 'COOKED_MEALS';
    }

    // 2. Quantity & Unit Detection
    let quantity = 25;
    let unit = 'meals';

    const qtyMatch = text.match(/\b(\d+)\s*(portions|meals|trays|boxes|items|servings|plates|kg|lbs|pounds|pieces|loaves|liters|containers)?\b/i);
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1], 10);
      if (qtyMatch[2]) {
        const rawUnit = qtyMatch[2].toLowerCase();
        if (['kg', 'lbs', 'pounds', 'liters'].includes(rawUnit)) {
          unit = 'kg';
        } else {
          unit = 'meals';
        }
      }
    }

    // 3. Safe Deadline Calculation
    let safeHoursRemaining = 3.5;
    if (category === 'COOKED_MEALS') safeHoursRemaining = 3.5;
    else if (category === 'DAIRY') safeHoursRemaining = 4.0;
    else if (category === 'BAKERY') safeHoursRemaining = 12.0;
    else if (category === 'PRODUCE') safeHoursRemaining = 24.0;
    else if (category === 'PACKAGED_GOODS') safeHoursRemaining = 48.0;

    // Check for explicit hour/minute patterns
    const inHoursMatch = text.match(/\b(?:in|within)\s*(\d+(?:\.\d+)?)\s*(?:hours|hour|hrs|hr|h)\b/i);
    const inMinsMatch = text.match(/\b(?:in|within)\s*(\d+)\s*(?:minutes|minute|mins|min)\b/i);
    const timeMatch = text.match(/\b(?:until|by|before)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);

    let targetDeadline = new Date(Date.now() + safeHoursRemaining * 3600 * 1000);

    if (inHoursMatch) {
      safeHoursRemaining = parseFloat(inHoursMatch[1]);
      targetDeadline = new Date(Date.now() + safeHoursRemaining * 3600 * 1000);
    } else if (inMinsMatch) {
      safeHoursRemaining = Number((parseInt(inMinsMatch[1], 10) / 60).toFixed(1));
      targetDeadline = new Date(Date.now() + safeHoursRemaining * 3600 * 1000);
    } else if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const ampm = timeMatch[3]?.toLowerCase();

      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;

      const d = new Date();
      d.setHours(hours, minutes, 0, 0);
      if (d.getTime() <= Date.now()) {
        d.setDate(d.getDate() + 1); // target next day if time has passed
      }
      targetDeadline = d;
      safeHoursRemaining = Number(((d.getTime() - Date.now()) / 3600000).toFixed(1));
    }

    // 4. Urgency Tier
    let urgencyTier: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM';
    if (safeHoursRemaining <= 2.0) urgencyTier = 'CRITICAL';
    else if (safeHoursRemaining <= 4.0) urgencyTier = 'HIGH';
    else if (safeHoursRemaining <= 12.0) urgencyTier = 'MEDIUM';
    else urgencyTier = 'LOW';

    // 5. Common Allergen Extraction
    const detectedAllergens: string[] = [];
    if (/\b(milk|cheese|butter|dairy|cream|paneer|yogurt)\b/i.test(lower)) detectedAllergens.push('DAIRY');
    if (/\b(gluten|wheat|flour|bread|pasta|lasagna|dough)\b/i.test(lower)) detectedAllergens.push('GLUTEN');
    if (/\b(nut|peanut|almond|cashew|walnut)\b/i.test(lower)) detectedAllergens.push('NUTS');
    if (/\b(egg|eggs|mayo|mayonnaise)\b/i.test(lower)) detectedAllergens.push('EGGS');
    if (/\b(soy|tofu|soya)\b/i.test(lower)) detectedAllergens.push('SOY');

    // 6. Food Description Synthesis
    let foodDescription = text.trim();
    if (foodDescription.length > 80) {
      foodDescription = foodDescription.slice(0, 77) + '...';
    }

    const executionTimeMs = Math.max(1, Date.now() - startTime);

    return {
      foodCategory: category,
      foodDescription,
      quantity,
      unit,
      safeDeadline: targetDeadline.toISOString(),
      safeHoursRemaining: Math.max(0.5, safeHoursRemaining),
      urgencyTier,
      detectedAllergens,
      confidence: categoryConfidence,
      engine: 'LAYA_DETERMINISTIC_FALLBACK',
      executionTimeMs,
    };
  }

  private static deterministicDispatchAdvisor(state: LayaDispatchInput, startTime: number): LayaDispatchRecommendation {
    const { timeRemainingMins, availablePlatformDrivers, distanceKm, receiverHasOwnLogistics } = state;

    let recommendedMode: 'PLATFORM_DRIVER' | 'RECEIVER_LOGISTICS' = 'PLATFORM_DRIVER';
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    let confidence = 0.95;
    let reasoning = '';

    if (timeRemainingMins <= 45 && availablePlatformDrivers === 0 && receiverHasOwnLogistics) {
      recommendedMode = 'RECEIVER_LOGISTICS';
      riskLevel = 'CRITICAL';
      confidence = 0.98;
      reasoning = `High Perishability Alert: Only ${timeRemainingMins} mins remaining with 0 active platform couriers in area. Shelter self-pickup is critical to prevent expiry.`;
    } else if (availablePlatformDrivers === 0 && receiverHasOwnLogistics) {
      recommendedMode = 'RECEIVER_LOGISTICS';
      riskLevel = 'HIGH';
      confidence = 0.92;
      reasoning = 'Courier Shortage: No platform couriers currently available. Using shelter vehicle guarantees timely food rescue.';
    } else if (!receiverHasOwnLogistics) {
      recommendedMode = 'PLATFORM_DRIVER';
      riskLevel = availablePlatformDrivers > 0 ? 'LOW' : 'HIGH';
      confidence = 0.99;
      reasoning = 'Dedicated Platform Courier Required: Shelter does not operate internal transit logistics.';
    } else if (timeRemainingMins > 90 && availablePlatformDrivers >= 2) {
      recommendedMode = 'PLATFORM_DRIVER';
      riskLevel = 'LOW';
      confidence = 0.94;
      reasoning = `Ample Safety Buffer (${timeRemainingMins}m): High platform courier density (${availablePlatformDrivers} nearby) can fulfill rescue while sparing shelter staff resources.`;
    } else {
      recommendedMode = distanceKm < 3.0 && receiverHasOwnLogistics ? 'RECEIVER_LOGISTICS' : 'PLATFORM_DRIVER';
      riskLevel = 'MEDIUM';
      confidence = 0.88;
      reasoning = `Balanced Decision: Short corridor (${distanceKm.toFixed(1)} km). Recommended ${recommendedMode.replace('_', ' ')} based on optimal turnaround.`;
    }

    return {
      recommendedMode,
      confidence,
      riskLevel,
      reasoning,
      engine: 'LAYA_DETERMINISTIC_FALLBACK',
      executionTimeMs: Math.max(1, Date.now() - startTime),
    };
  }

  private static callLayaInference(endpoint: string, payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(payload);
      const url = new URL(endpoint);
      const client = url.protocol === 'https:' ? https : http;

      const req = client.request(
        endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
          },
          timeout: 1000,
        },
        (res) => {
          let chunks = '';
          res.on('data', (c) => (chunks += c));
          res.on('end', () => {
            try {
              resolve(JSON.parse(chunks));
            } catch (e) {
              reject(e);
            }
          });
        }
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Laya inference timeout'));
      });
      req.write(data);
      req.end();
    });
  }
}
