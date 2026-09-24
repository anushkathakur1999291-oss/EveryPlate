import { SocketService } from '../services/socket/socket.service';
import { createSession, verifyPassword, hashPassword, sessionCookie, cookieToken, tokenHash } from '../services/auth/auth.service';
import { z } from 'zod';
import { demoMode } from '../config/runtime';
import { respondError } from '../lib/errors';
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

import { prisma } from '../lib/prisma';

export class AuthController {
  static async login(req: Request, res: Response) {
    try {
      const parsed = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(256) }).strict().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email and password' });
      const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
      if (!await verifyPassword(parsed.data.password, user?.passwordHash) || !user) return res.status(401).json({ error: 'Email or password is incorrect' });
      if (!user.passwordHash?.startsWith('scrypt-v1:')) await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.password) } });
      const { token, expiresAt } = await createSession(user.id);
      res.cookie(sessionCookie, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', expires: expiresAt });
      res.json({ authenticated: true });
    } catch (err) { respondError(req, res, err); }
  }
  static async logout(req: Request, res: Response) {
    try {
      const token = cookieToken(req.headers.cookie);
      if (token) await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
      if (req.user) SocketService.disconnectUser(req.user.id);
      res.clearCookie(sessionCookie, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' });
      res.status(204).end();
    } catch (err) { respondError(req, res, err); }
  }

  static async getUsers(req: Request, res: Response) {
    if (!demoMode) return res.status(404).json({ error: 'Not found' });
    try {
      const users = await prisma.user.findMany({
        select: { id: true, name: true, role: true },
        orderBy: { role: 'asc' },
      });
      res.json(users);
    } catch (err: any) {
      respondError(req, res, err);
    }
  }

  static async getMe(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const { passwordHash, ...profile } = req.user;
    res.json(profile);
  }
}
