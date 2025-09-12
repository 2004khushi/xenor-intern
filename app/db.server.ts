import { PrismaClient } from "@prisma/client";

declare global {
  var prismaGlobal: PrismaClient;
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

try {
  const host = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).host : "MISSING_DATABASE_URL";
  console.log("[DB] Using host:", host);
} catch {}


const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;
