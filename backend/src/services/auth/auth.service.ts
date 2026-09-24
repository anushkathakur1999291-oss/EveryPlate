import { randomBytes, scrypt as derive, createHash, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { prisma } from '../../lib/prisma';
import { demoMode } from '../../config/runtime';
const scrypt = promisify(derive);
export const sessionCookie = process.env.NODE_ENV === 'production' ? '__Host-rescue_session' : 'rescue_session';
export const profileInclude = { donorProfile: true, receiverProfile: true, driverProfile: true };
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password: string, hash?: string | null) {
  const [salt, expected] = (hash || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
  const derived = await scrypt(password, salt, 64) as Buffer;
  const wanted = Buffer.from(expected, 'hex');
  return wanted.length === derived.length && timingSafeEqual(derived, wanted) && !!hash;
}
export function cookieToken(header?: string) {
  return header?.split(';').map(s => s.trim()).find(s => s.startsWith(`${sessionCookie}=`))?.slice(sessionCookie.length + 1);
}
export async function resolveIdentity(cookie?: string, demoUserId?: string, demoEmail?: string) {
  const token = cookieToken(cookie);
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const session = await prisma.session.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: { include: profileInclude } } });
    if (session && session.expiresAt > new Date()) return session.user;
  }
  if (demoMode && (demoUserId || demoEmail)) return prisma.user.findFirst({ where: demoUserId ? { id: demoUserId } : { email: demoEmail }, include: profileInclude });
  return null;
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  await prisma.session.create({ data: { tokenHash: tokenHash(token), userId, expiresAt } });
  return { token, expiresAt };
}
