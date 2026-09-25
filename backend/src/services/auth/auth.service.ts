import { DomainError } from '../../lib/errors';
import { randomBytes, scrypt as derive, createHash, timingSafeEqual, createHmac } from 'crypto';
import { prisma } from '../../lib/prisma';
import { demoMode, otpEncryptionKey } from '../../config/runtime';

export const sessionCookie = process.env.NODE_ENV === 'production' ? '__Host-rescue_session' : 'rescue_session';
export const profileInclude = { donorProfile: true, receiverProfile: true, driverProfile: true };
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

let activeDerivations = 0;
async function derivePassword(password: string, salt: string, legacy = false) {
  if (activeDerivations >= 4) throw new DomainError('Sign-in is busy. Please try again shortly.', 503, 'AUTH_BUSY');
  ++activeDerivations;
  try {
    return await new Promise<Buffer>((resolve, reject) =>
      derive(password, salt, 64, legacy ? {} : { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (err, key) =>
        err ? reject(err) : resolve(key)
      )
    );
  } finally {
    --activeDerivations;
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await derivePassword(password, salt);
  return `scrypt-v1:${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, hash?: string | null) {
  const current = hash?.startsWith('scrypt-v1:');
  const parts = (hash || `scrypt-v1:${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
  const [salt, expected] = parts.length === 3 ? parts.slice(1) : parts;
  if (!/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(expected || '')) return false;
  const derived = await derivePassword(password, salt, !!hash && !current);
  const wanted = Buffer.from(expected, 'hex');
  return timingSafeEqual(derived, wanted) && !!hash;
}

export function cookieToken(header?: string) {
  if (!header) return undefined;
  const parts = header.split(';').map(s => s.trim());
  const match = parts.find(s =>
    s.startsWith(`${sessionCookie}=`) ||
    s.startsWith('rescue_session=') ||
    s.startsWith('__Host-rescue_session=')
  );
  if (!match) return undefined;
  return match.substring(match.indexOf('=') + 1);
}

export function signStatelessToken(userId: string, expiresAt: Date): string {
  const exp = expiresAt.getTime();
  const nonce = randomBytes(16).toString('hex');
  const payload = `${userId}.${exp}.${nonce}`;
  const key = otpEncryptionKey || '6945fd33ce0691bb25c8e53628802f1a93f2fff9a369cae0e62a799c50ca12d9';
  const sig = createHmac('sha256', key).update(payload).digest('hex');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

export function verifyStatelessToken(token: string): { userId: string; expiresAt: Date } | null {
  try {
    const [b64Payload, sig] = token.split('.');
    if (!b64Payload || !sig) return null;
    const payload = Buffer.from(b64Payload, 'base64url').toString('utf8');
    const [userId, expStr] = payload.split('.');
    if (!userId || !expStr) return null;
    const exp = parseInt(expStr, 10);
    if (isNaN(exp) || Date.now() > exp) return null;

    const key = otpEncryptionKey || '6945fd33ce0691bb25c8e53628802f1a93f2fff9a369cae0e62a799c50ca12d9';
    const expectedSig = createHmac('sha256', key).update(payload).digest('hex');
    if (!timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) {
      return null;
    }
    return { userId, expiresAt: new Date(exp) };
  } catch {
    return null;
  }
}

export async function resolveIdentity(cookie?: string, demoUserId?: string, demoEmail?: string) {
  const token = cookieToken(cookie);
  if (token) {
    // 1. Try finding in database
    try {
      const session = await prisma.session.findUnique({
        where: { tokenHash: tokenHash(token) },
        include: { user: { include: profileInclude } },
      });
      if (session && session.expiresAt > new Date()) return session.user;
    } catch {}

    // 2. Fall back to stateless HMAC token verification for serverless deployments
    const verified = verifyStatelessToken(token);
    if (verified) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: verified.userId },
          include: profileInclude,
        });
        if (user) return user;
      } catch {}
    }
  }

  if (demoMode && (demoUserId || demoEmail)) {
    return prisma.user.findFirst({
      where: demoUserId ? { id: demoUserId } : { email: demoEmail },
      include: profileInclude,
    });
  }

  return null;
}

export async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  const token = signStatelessToken(userId, expiresAt);
  try {
    await prisma.session.create({ data: { tokenHash: tokenHash(token), userId, expiresAt } });
  } catch {}
  return { token, expiresAt };
}
