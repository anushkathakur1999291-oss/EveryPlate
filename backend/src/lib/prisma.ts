import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { SEED_DATABASE_BASE64 } from './db-seed';

function getDatabaseUrl(): string {
  // If running in Vercel or AWS Lambda, ensure database is in /tmp
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const customUrl = process.env.DATABASE_URL;
    if (customUrl && !customUrl.includes('dev.db')) {
      return customUrl;
    }
    const tmpDbPath = '/tmp/dev.db';
    if (!fs.existsSync(tmpDbPath)) {
      try {
        fs.writeFileSync(tmpDbPath, Buffer.from(SEED_DATABASE_BASE64, 'base64'));
        console.log('Seeded database written to /tmp/dev.db successfully');
      } catch (err) {
        console.error('Failed to write seeded database to /tmp/dev.db:', err);
      }
    }
    const dbUrl = `file:${tmpDbPath}`;
    process.env.DATABASE_URL = dbUrl;
    return dbUrl;
  }

  // If local or custom DATABASE_URL
  if (process.env.DATABASE_URL) {
    if (process.env.DATABASE_URL.startsWith('file:') && !process.env.DATABASE_URL.startsWith('file:/')) {
      // Resolve relative path
      const relPath = process.env.DATABASE_URL.replace(/^file:/, '');
      const absPath = path.resolve(process.cwd(), relPath);
      process.env.DATABASE_URL = `file:${absPath}`;
    }
    return process.env.DATABASE_URL;
  }

  // Fallback to local dev.db
  const localDb = path.resolve(__dirname, '../../prisma/dev.db');
  const dbUrl = `file:${localDb}`;
  process.env.DATABASE_URL = dbUrl;
  return dbUrl;
}

const dbUrl = getDatabaseUrl();

// One connection pool per application process. Services still accept injection for tests.
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: dbUrl,
    },
  },
});
