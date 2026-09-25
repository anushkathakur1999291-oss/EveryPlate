import './bootstrap';
import path from 'path';
import fs from 'fs';
import { MaintenanceService } from './services/maintenance/maintenance.service';
import { allowedOrigins, isOriginAllowed } from './config/runtime';
import { operational } from './middleware/operational';
import { respondError } from './lib/errors';
import { prisma } from './lib/prisma';
import express from 'express';
import cors from 'cors';
import http from 'http';
import dotenv from 'dotenv';
import apiRouter from './routes';
import { authMiddleware } from './middleware/auth';
import { SocketService } from './services/socket/socket.service';

dotenv.config();

export const app = express();
export const server = http.createServer(app);

// Initialize Socket.io Event Bus
export const io = SocketService.initialize(server);

// Global middleware
app.disable('x-powered-by');
app.use(operational);
app.use(cors({
  origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
  credentials: true,
}));
app.use(['/api/ai/analyze-food-image', '/ai/analyze-food-image'], express.json({ limit: '12mb' }));
app.use(express.json({ limit: '32kb' }));
app.use(authMiddleware);

// Health check
const healthCheck = (_req: express.Request, res: express.Response) => {
  res.json({
    status: 'ok',
    service: 'surplus-to-shelter-backend',
    timestamp: new Date().toISOString(),
  });
};
app.get('/health', healthCheck);
app.get('/api/health', healthCheck);

const readyCheck = async (_req: express.Request, res: express.Response) => {
  try {
    await prisma.$queryRaw`SELECT tokenHash FROM Session LIMIT 1`;
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
};
app.get('/ready', readyCheck);
app.get('/api/ready', readyCheck);

// API Routes mounted on both /api and / so reverse proxy rewrites work either way
app.use('/api', apiRouter);
app.use('/', apiRouter);

if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
  const publicDir = path.resolve(process.env.FRONTEND_DIST_DIR || path.join(__dirname, '../public'));
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir, {
      setHeaders(res, filename) {
        if (filename.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }));
    app.get('/', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
  }
}

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON request body', code: 'VALIDATION_ERROR' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large' });
  }
  respondError(req, res, err);
});

export default app;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = app;
  (module.exports as any).default = app;
  (module.exports as any).app = app;
}

const PORT = process.env.PORT || 4000;

if (require.main === module) {
  let running = false;
  const maintenance = new MaintenanceService(prisma);
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await maintenance.runOnce();
    } catch (err) {
      console.error(JSON.stringify({
        level: 'error',
        event: 'MAINTENANCE_FAILED',
        type: err instanceof Error ? err.name : 'Unknown',
      }));
    } finally {
      running = false;
    }
  };
  void tick();
  const interval = setInterval(tick, 30000);
  interval.unref();
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => {
      clearInterval(interval);
      const deadline = setTimeout(() => process.exit(1), 10000);
      deadline.unref();
      io.close();
      server.close(() => {
        void prisma.$disconnect().then(() => process.exit(0));
      });
    });
  }
  server.listen(PORT, () => {
    console.log(`Surplus-To-Shelter API Server listening on port ${PORT}`);
  });
}
