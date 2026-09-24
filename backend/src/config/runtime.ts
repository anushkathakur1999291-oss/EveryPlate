import 'dotenv/config';

export const demoMode = process.env.DEMO_MODE === 'true';
export const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173').split(',').map(s => s.trim());
if (process.env.NODE_ENV === 'production' && demoMode) {
  throw new Error('DEMO_MODE must be disabled in production');
}
if (process.env.NODE_ENV === 'production' && !/^[a-fA-F0-9]{64}$/.test(process.env.OTP_ENCRYPTION_KEY || '')) throw new Error('Production requires a persistent 32-byte OTP_ENCRYPTION_KEY');
