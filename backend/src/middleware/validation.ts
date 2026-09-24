import { RequestHandler } from 'express';
import { z } from 'zod';

const text = z.string().trim().min(1).max(500);
const mode = z.enum(['PLATFORM_DRIVER', 'RECEIVER_LOGISTICS']);
const personnel = { driverName: text.optional(), vehicleInfo: text.optional(), contactMechanism: text.optional() };
export const schemas = {
  coordinates: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict(),
  donation: z.object({
    foodCategory: z.enum(['COOKED_MEALS', 'PACKAGED_GOODS', 'PRODUCE', 'BAKERY', 'DAIRY']),
    foodDescription: text, quantity: z.number().int().positive().max(100000), unit: z.literal('meals').optional(),
    pickupAddress: text.optional(), pickupLatitude: z.number().min(-90).max(90).optional(), pickupLongitude: z.number().min(-180).max(180).optional(),
    availableAt: z.string().datetime({ offset: true }).optional(), safeDeadline: z.string().datetime({ offset: true }),
    imageUrl: z.string().url().max(2048).refine(s => /^https?:\/\//.test(s)).optional(), notes: z.string().max(2000).optional(),
  }).strict().refine(d => new Date(d.safeDeadline).getTime() > Math.max(Date.now(), d.availableAt ? new Date(d.availableAt).getTime() : 0), 'Deadline must follow availability and be in the future'),
  otp: z.object({ otp: z.string().regex(/^\d{6}$/) }).strict(),
  claim: z.object({ latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional() }).strict(),
  reason: z.object({ reason: text.optional() }).strict(),
  fulfillment: z.object({ deliveryMode: mode, ...personnel }).strict().refine(d => d.deliveryMode !== 'RECEIVER_LOGISTICS' || !!d.driverName, 'Personnel name is required'),
  switch: z.object({ newMode: mode, ...personnel }).strict().refine(d => d.newMode !== 'RECEIVER_LOGISTICS' || !!d.driverName, 'Personnel name is required'),
};
export function validate(schema: z.ZodTypeAny): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body || {});
    if (!result.success) return void res.status(400).json({ error: 'Check the submitted fields.', code: 'VALIDATION_ERROR', fields: result.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })) });
    req.body = result.data;
    next();
  };
}
