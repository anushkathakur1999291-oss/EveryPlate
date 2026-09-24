import { DomainError } from '../../lib/errors';
import { randomBytes, scrypt as derive, createHash, timingSafeEqual } from 'crypto';
import { prisma } from '../../lib/prisma';
import { demoMode } from '../../config/runtime';
export const sessionCookie = process.env.NODE_ENV === 'production' ? '__Host-rescue_session' : 'rescue_session';
export const profileInclude = { donorProfile: true, receiverProfile: true, driverProfile: true };
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
let activeDerivations = 0;
async function derivePassword(password: string, salt: string, legacy = false) {
  if (activeDerivations >= 4) throw new DomainError('Sign-in is busy. Please try again shortly.',503,'AUTH_BUSY');
  ++activeDerivations;
  try { return await new Promise<Buffer>((resolve,reject) => derive(password,salt,64,legacy ? {} : { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },(err,key) => err ? reject(err) : resolve(key))); }
  finally { --activeDerivations; }
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await derivePassword(password,salt);
  return `scrypt-v1:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password: string, hash?: string | null) {
  const current = hash?.startsWith('scrypt-v1:');
  const parts = (hash || `scrypt-v1:${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
  const [salt, expected] = parts.length === 3 ? parts.slice(1) : parts;
  if (!/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(expected || '')) return false;
  const derived = await derivePassword(password,salt,!!hash && !current);
  const wanted = Buffer.from(expected,'hex');
  return timingSafeEqual(derived,wanted) && !!hash;
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
