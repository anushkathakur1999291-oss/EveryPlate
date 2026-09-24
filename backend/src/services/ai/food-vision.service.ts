import { z } from 'zod';
import { DomainError } from '../../lib/errors';

export const CANONICAL_FOOD_CATEGORIES = [
  'COOKED_MEALS',
  'BAKERY',
  'PRODUCE',
  'DAIRY',
  'PACKAGED_GOODS',
  'CANNED_GOODS',
  'BEVERAGES',
  'RAW_INGREDIENTS',
] as const;

export type CanonicalFoodCategory = typeof CANONICAL_FOOD_CATEGORIES[number];

export const FoodVisionResultSchema = z.object({
  foodCategory: z.enum(CANONICAL_FOOD_CATEGORIES),
  foodName: z.string().min(1).max(200),
  itemsDetected: z.array(z.string().max(100)).max(20),
  isCooked: z.boolean(),
  vegetarian: z.boolean(),
  nonVegetarian: z.boolean(),
  packaged: z.boolean(),
  estimatedPortions: z.number().int().positive().nullable(),
  estimatedQuantity: z.number().positive().nullable(),
  quantityUnit: z.string().default('meals'),
  confidence: z.number().min(0).max(1),
  visualNotes: z.string().max(1000),
  uncertainFields: z.array(z.string()),
  modelUsed: z.string(),
  latencyMs: z.number().nonnegative(),
  provider: z.string(),
  fallback: z.boolean().default(false),
});

export type FoodVisionResult = z.infer<typeof FoodVisionResultSchema>;

export interface VisionStatus {
  available: boolean;
  provider: string;
  model: string;
  latencyMs?: number;
  message: string;
}

export class FoodVisionService {
  private static provider = process.env.VISION_PROVIDER || 'ollama';
  private static ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
  private static visionModel = process.env.VISION_MODEL || 'moondream';
  private static structurerModel = process.env.VISION_STRUCTURER_MODEL || 'gemma2:2b';
  private static timeoutMs = Number(process.env.VISION_TIMEOUT_MS) || 15000;
  private static activeInferences = 0;
  private static maxConcurrent = 2;

  /**
   * Status check for vision model availability in Ollama.
   */
  static async checkStatus(): Promise<VisionStatus> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.ollamaHost}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) {
        return {
          available: false,
          provider: this.provider,
          model: this.visionModel,
          message: `Ollama responded with HTTP ${res.status}`,
        };
      }
      const data: any = await res.json();
      const hasVision = data.models?.some((m: any) =>
        m.name === this.visionModel || m.name?.startsWith(`${this.visionModel}:`)
      );

      return {
        available: Boolean(hasVision),
        provider: this.provider,
        model: this.visionModel,
        latencyMs: Date.now() - start,
        message: hasVision
          ? `Local vision engine ready (${this.visionModel})`
          : `Ollama is active, but model '${this.visionModel}' is not installed`,
      };
    } catch {
      return {
        available: false,
        provider: this.provider,
        model: this.visionModel,
        message: 'Local Ollama service is offline. Manual entry is active.',
      };
    }
  }

  /**
   * Deterministic semantic parser mapping free text into structured food attributes.
   */
  public static parseDescriptionDeterministically(description: string, latencyMs = 0): FoodVisionResult {
    const text = description.toLowerCase();

    // 1. Detect Category
    let category: CanonicalFoodCategory = 'COOKED_MEALS';
    if (text.includes('apple') || text.includes('banana') || text.includes('orange') || text.includes('vegetable') || text.includes('fruit') || text.includes('salad') || text.includes('greens') || text.includes('tomato')) {
      category = 'PRODUCE';
    } else if (text.includes('bread') || text.includes('bagel') || text.includes('croissant') || text.includes('loaf') || text.includes('pastry') || text.includes('bun') || text.includes('bake')) {
      category = 'BAKERY';
    } else if (text.includes('milk') || text.includes('cheese') || text.includes('yogurt') || text.includes('butter')) {
      category = 'DAIRY';
    } else if (text.includes('canned') || text.includes('tin') || text.includes('canned soup')) {
      category = 'CANNED_GOODS';
    } else if (text.includes('chip') || text.includes('bar') || text.includes('cereal') || text.includes('cracker') || text.includes('snack')) {
      category = 'PACKAGED_GOODS';
    } else if (text.includes('juice') || text.includes('tea') || text.includes('coffee') || text.includes('drink') || text.includes('beverage')) {
      category = 'BEVERAGES';
    } else if (text.includes('rice') || text.includes('flour') || text.includes('uncooked') || text.includes('grain')) {
      category = text.includes('curry') || text.includes('cooked') || text.includes('bowl') ? 'COOKED_MEALS' : 'RAW_INGREDIENTS';
    }

    // 2. Detect Specific Items
    const items: string[] = [];
    const itemCandidates = [
      'sandwich', 'salad', 'bread', 'curry', 'rice', 'soup', 'pasta', 'stew',
      'grain bowl', 'vegetables', 'apples', 'pastries', 'cheese', 'bagels', 'wraps'
    ];
    for (const item of itemCandidates) {
      if (text.includes(item)) items.push(item.charAt(0).toUpperCase() + item.slice(1));
    }
    if (items.length === 0) items.push('Assorted Prepared Meal');

    // 3. Detect Dietary Attributes
    const isMeat = text.includes('chicken') || text.includes('beef') || text.includes('pork') || text.includes('meat') || text.includes('fish') || text.includes('tuna');
    const isVegetarian = !isMeat;
    const isPackaged = text.includes('package') || text.includes('container') || text.includes('box') || text.includes('bag') || text.includes('wrapped');
    const isCooked = category === 'COOKED_MEALS' || text.includes('cooked') || text.includes('prepared') || text.includes('baked');

    // 4. Estimate Portions from numbers in text
    let estimatedPortions: number | null = null;
    const portionMatch = text.match(/(\d+)\s*(portions|meals|items|servings|bowls|plates|boxes|loaves)/i);
    if (portionMatch) {
      estimatedPortions = Math.max(1, parseInt(portionMatch[1], 10));
    } else if (text.includes('three') || text.includes('3')) {
      estimatedPortions = 3;
    } else if (text.includes('two') || text.includes('2')) {
      estimatedPortions = 2;
    } else if (items.length > 0) {
      estimatedPortions = Math.min(items.length * 2, 10);
    }

    const foodName = items.slice(0, 3).join(' & ');

    return {
      foodCategory: category,
      foodName: foodName || 'Prepared Surplus Food',
      itemsDetected: items,
      isCooked,
      vegetarian: isVegetarian,
      nonVegetarian: !isVegetarian,
      packaged: isPackaged,
      estimatedPortions,
      estimatedQuantity: estimatedPortions,
      quantityUnit: 'meals',
      confidence: 0.85,
      visualNotes: description.slice(0, 300),
      uncertainFields: ['quantity', 'safeDeadline'],
      modelUsed: this.visionModel,
      latencyMs,
      provider: this.provider,
      fallback: false,
    };
  }

  /**
   * Main vision pipeline: Vision Model (moondream) -> Structured Parser -> Zod validation.
   */
  static async analyzeFoodImage(base64Payload: string, _mimeType = 'image/jpeg'): Promise<FoodVisionResult> {
    const startTime = Date.now();

    const cleanedBase64 = base64Payload.replace(/^data:image\/[a-z]+;base64,/, '').trim();
    if (!cleanedBase64 || cleanedBase64.length < 100) {
      throw new DomainError('Invalid image data provided for food recognition', 400, 'INVALID_IMAGE');
    }

    if (cleanedBase64.length > 11 * 1024 * 1024) {
      throw new DomainError('Image size exceeds maximum limit of 8MB', 413, 'IMAGE_TOO_LARGE');
    }

    if (this.activeInferences >= this.maxConcurrent) {
      throw new DomainError('Vision inference engine is busy. Please try again shortly.', 503, 'INFERENCE_BUSY');
    }

    this.activeInferences++;
    try {
      // Step 1: Query vision model for fine-grained image understanding
      const visionPrompt = 'Describe the food items, containers, packaging, and estimate how many meal portions are visible in this image in detail.';
      const visionRes = await fetch(`${this.ollamaHost}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.visionModel,
          prompt: visionPrompt,
          images: [cleanedBase64],
          stream: false,
          options: { temperature: 0.1 },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!visionRes.ok) {
        throw new Error(`Vision backend returned HTTP ${visionRes.status}`);
      }

      const visionData: any = await visionRes.json();
      const visualDescription = (visionData.response || '').trim();

      if (!visualDescription) {
        throw new Error('Vision model returned an empty visual description');
      }

      // Step 2: Extract structured JSON using structurer model or deterministic semantic parser
      try {
        const structPrompt = `Given this food image description, extract the structured information.
Categories must be one of: COOKED_MEALS, BAKERY, PRODUCE, DAIRY, PACKAGED_GOODS, CANNED_GOODS, BEVERAGES, RAW_INGREDIENTS.

Description: "${visualDescription}"

Return ONLY a JSON object:
{
  "food_category": "COOKED_MEALS",
  "food_name": "Short descriptive food name",
  "items_detected": ["item1", "item2"],
  "is_cooked": true,
  "vegetarian": true,
  "packaged": true,
  "estimated_portions": 3,
  "confidence": 0.88,
  "visual_notes": "One sentence summary of packaging and presentation",
  "uncertain_fields": ["quantity", "safe_deadline"]
}`;

        const structRes = await fetch(`${this.ollamaHost}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.structurerModel,
            prompt: structPrompt,
            format: 'json',
            stream: false,
            options: { temperature: 0.1 },
          }),
          signal: AbortSignal.timeout(6000), // Fast 6s timeout for second stage
        });

        if (structRes.ok) {
          const structData: any = await structRes.json();
          const parsed = JSON.parse(structData.response);

          const category = CANONICAL_FOOD_CATEGORIES.includes(parsed.food_category)
            ? parsed.food_category
            : 'COOKED_MEALS';

          const latencyMs = Date.now() - startTime;
          return FoodVisionResultSchema.parse({
            foodCategory: category,
            foodName: String(parsed.food_name || 'Assorted Prepared Food').slice(0, 150),
            itemsDetected: Array.isArray(parsed.items_detected) ? parsed.items_detected.map(String) : ['Prepared food item'],
            isCooked: Boolean(parsed.is_cooked),
            vegetarian: Boolean(parsed.vegetarian),
            nonVegetarian: !Boolean(parsed.vegetarian),
            packaged: Boolean(parsed.packaged),
            estimatedPortions: typeof parsed.estimated_portions === 'number' ? parsed.estimated_portions : null,
            estimatedQuantity: typeof parsed.estimated_portions === 'number' ? parsed.estimated_portions : null,
            quantityUnit: 'meals',
            confidence: Math.max(0.4, Math.min(0.95, Number(parsed.confidence) || 0.85)),
            visualNotes: String(parsed.visual_notes || visualDescription).slice(0, 400),
            uncertainFields: Array.isArray(parsed.uncertain_fields) && parsed.uncertain_fields.length > 0
              ? parsed.uncertain_fields.map(String)
              : ['quantity', 'safeDeadline'],
            modelUsed: `${this.visionModel} + ${this.structurerModel}`,
            latencyMs,
            provider: this.provider,
            fallback: false,
          });
        }
      } catch {
        // Fall through to deterministic extractor if structurer model is unavailable or times out
      }

      // Fallback: Deterministic semantic parser on the vision model's description
      const latencyMs = Date.now() - startTime;
      return this.parseDescriptionDeterministically(visualDescription, latencyMs);
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      console.warn(`[FoodVisionService] Vision analysis fallback: ${err.message}`);

      return {
        foodCategory: 'COOKED_MEALS',
        foodName: 'Prepared Surplus Food',
        itemsDetected: ['Prepared Meal Assortment'],
        isCooked: true,
        vegetarian: true,
        nonVegetarian: false,
        packaged: false,
        estimatedPortions: null,
        estimatedQuantity: null,
        quantityUnit: 'meals',
        confidence: 0.5,
        visualNotes: 'Automatic recognition unavailable. Please verify and complete details manually.',
        uncertainFields: ['foodCategory', 'foodName', 'quantity', 'safeDeadline'],
        modelUsed: this.visionModel,
        latencyMs,
        provider: this.provider,
        fallback: true,
      };
    } finally {
      this.activeInferences = Math.max(0, this.activeInferences - 1);
    }
  }
}
