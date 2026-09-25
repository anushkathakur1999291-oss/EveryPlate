import 'dotenv/config';

export const demoMode = process.env.DEMO_MODE === 'true';

const configuredOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173').split(',').map(s => s.trim());
export const allowedOrigins = configuredOrigins;

export function isOriginAllowed(origin?: string): boolean {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (origin.endsWith('.vercel.app')) return true;
  if (process.env.VERCEL) return true;
  if (process.env.NODE_ENV !== 'production') return true;
  return false;
}

const DEFAULT_OTP_KEY = '6945fd33ce0691bb25c8e53628802f1a93f2fff9a369cae0e62a799c50ca12d9';
if (!process.env.OTP_ENCRYPTION_KEY || !/^[a-fA-F0-9]{64}$/.test(process.env.OTP_ENCRYPTION_KEY)) {
  process.env.OTP_ENCRYPTION_KEY = DEFAULT_OTP_KEY;
}
export const otpEncryptionKey = process.env.OTP_ENCRYPTION_KEY;
