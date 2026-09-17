import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Lazy deletion routine to keep the database lightweight.
 * Removes matches that are either FINISHED or haven't been updated in 5 minutes.
 */
export async function runGarbageCollection() {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    await prisma.match.deleteMany({
      where: {
        OR: [
          { status: "FINISHED" },
          { updatedAt: { lt: fiveMinutesAgo } }
        ]
      }
    });
  } catch (error) {
    console.error("Garbage collection failed:", error);
    // Suppress error so it doesn't crash the main thread
  }
}
