// app/db.server.ts
import { PrismaClient } from '@prisma/client';

type GlobalWithPrisma = typeof globalThis & { __prisma?: PrismaClient };
const g = globalThis as GlobalWithPrisma;

export const prisma =
  g.__prisma ??
  new PrismaClient({
    // log: ['warn', 'error'], // optional
  });

if (process.env.NODE_ENV !== 'production') {
  g.__prisma = prisma;
}
