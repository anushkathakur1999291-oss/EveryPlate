import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

export class DomainError extends Error {
  constructor(message: string, public status = 409, public code = 'STATE_CONFLICT') { super(message); }
}
export function respondError(req: Request, res: Response, error: unknown) {
  if (error instanceof DomainError) {
    return res.status(error.status).json({ error: error.message, code: error.code, requestId: res.locals.requestId });
  }
  const retryable = error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2028', 'P1008'].includes(error.code);
  const conflict = error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2025', 'P2004'].includes(error.code);
  console.error(JSON.stringify({ level: 'error', event: 'REQUEST_FAILED', requestId: res.locals.requestId, method: req.method, route: req.route?.path, type: error instanceof Error ? error.name : 'Unknown', databaseCode: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined }));
  return res.status(retryable ? 503 : conflict ? 409 : 500).json({
    error: retryable ? 'This operation is busy. Refresh and try again.' : conflict ? 'This record has changed. Refresh before trying again.' : 'We could not complete this operation. Please try again.',
    code: retryable ? 'TEMPORARILY_UNAVAILABLE' : conflict ? 'STATE_CONFLICT' : 'INTERNAL_ERROR', requestId: res.locals.requestId,
  });
}
