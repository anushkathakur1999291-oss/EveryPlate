import { RequestHandler } from 'express';
import { randomUUID } from 'crypto';
import { allowedOrigins } from '../config/runtime';
const buckets = new Map<string, { count: number; until: number }>();
const cleanup = setInterval(() => { for (const [k, v] of buckets) if (v.until < Date.now()) buckets.delete(k); }, 60000);
cleanup.unref();
export const operational: RequestHandler = (req, res, next) => {
  res.locals.requestId = randomUUID();
  res.setHeader('X-Request-ID', res.locals.requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  const start = Date.now();
  res.on('finish', () => console.log(JSON.stringify({ level: 'info', event: 'HTTP_REQUEST', requestId: res.locals.requestId, method: req.method, route: req.route?.path || 'unmatched', status: res.statusCode, durationMs: Date.now() - start })));
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin && !allowedOrigins.includes(req.headers.origin)) return void res.status(403).json({ error: 'Request origin is not allowed' });
  const login = req.path === '/api/auth/login';
  const key = `${req.ip}:${login ? 'login' : 'api'}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.until < Date.now()) buckets.set(key, { count: 1, until: Date.now() + 60000 });
  else if (++bucket.count > (login ? 10 : 300)) {
    res.setHeader('Retry-After', Math.ceil((bucket.until - Date.now()) / 1000));
    return void res.status(429).json({ error: 'Too many requests. Please wait before trying again.', code: 'RATE_LIMITED' });
  }
  next();
};
