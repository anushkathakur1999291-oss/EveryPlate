import { resolveIdentity } from '../services/auth/auth.service';
import { demoMode } from '../config/runtime';
import { Request, Response, NextFunction } from 'express';
import { PrismaClient, Role, User, DonorProfile, ReceiverProfile, DriverProfile } from '@prisma/client';

import { prisma } from '../lib/prisma';

export interface AuthenticatedUser extends User {
  donorProfile?: DonorProfile | null;
  receiverProfile?: ReceiverProfile | null;
  driverProfile?: DriverProfile | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Authentication middleware for demo / hackathon use.
 * Resolves user from `x-user-id` or `x-user-email` header.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await resolveIdentity(req.headers.cookie, req.headers['x-user-id'] as string, req.headers['x-user-email'] as string);
    if (user) req.user = user;
    next();
  } catch (err) { next(err); }
}

/**
 * Enforces that user is logged in with specified role(s)
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden. Role '${req.user.role}' is not authorized. Allowed: ${roles.join(', ')}`,
      });
    }

    next();
  };
}
