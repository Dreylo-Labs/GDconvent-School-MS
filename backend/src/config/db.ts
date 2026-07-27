import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | undefined;
export function getDb() {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}
