import crypto from 'crypto';
import { demoMode } from '../../config/runtime';
import { DomainError } from '../../lib/errors';
export class OtpService {
  private static key(): Buffer {
    const configured = process.env.OTP_ENCRYPTION_KEY;
    if (configured && /^[a-fA-F0-9]{64}$/.test(configured)) return Buffer.from(configured, 'hex');
    if (demoMode) return crypto.createHash('sha256').update('LOCAL-DEMO-ONLY-NOT-A-PRODUCTION-KEY').digest();
    throw new Error('A 32-byte OTP_ENCRYPTION_KEY is required');
  }
  static generateOtp(): string { return crypto.randomInt(100000, 1000000).toString(); }
  // Authenticated encryption allows retrieval by the owning organization; AAD binds stage and allocation.
  static seal(code: string, scope: string, expires: Date): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key(), iv);
    cipher.setAAD(Buffer.from(scope));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify({ code, expires: expires.getTime() }), 'utf8'), cipher.final()]);
    return ['v1', iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join('.');
  }
  static reveal(stored: string, scope: string): string {
    try {
      const [version, iv, tag, data] = stored.split('.');
      if (version !== 'v1') throw new Error('Legacy OTP requires reissue');
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv, 'hex'));
      decipher.setAAD(Buffer.from(scope));
      decipher.setAuthTag(Buffer.from(tag, 'hex'));
      const payload = JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8'));
      if (payload.expires <= Date.now()) throw new Error('Expired');
      return payload.code;
    } catch { throw new DomainError('This verification code has expired or is unavailable', 409, 'OTP_UNAVAILABLE'); }
  }
  static verifyOtp(submitted: string, expected: string): boolean {
    if (typeof submitted !== 'string' || !/^\d{6}$/.test(submitted) || !/^\d{6}$/.test(expected)) return false;
    return crypto.timingSafeEqual(Buffer.from(submitted), Buffer.from(expected));
  }
}
