import { PrismaClient } from '@prisma/client';
// One connection pool per application process. Services still accept injection for tests.
export const prisma = new PrismaClient();
