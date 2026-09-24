import { Request, Response } from 'express';
import { DomainError } from '../lib/errors';
export function pagination(req: Request) {
  const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
  const cursor = req.query.cursor;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 100))) throw new DomainError('Use a limit from 1 to 100 and a valid cursor', 400, 'VALIDATION_ERROR');
  return { take: limit + 1, ...(typeof cursor === 'string' ? { cursor: { id: cursor }, skip: 1 } : {}) };
}
export function pageRows<T extends { id: string }>(req: Request, res: Response, rows: T[]) {
  const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  if (hasMore) res.setHeader('X-Next-Cursor', items[items.length-1].id);
  return items;
}
