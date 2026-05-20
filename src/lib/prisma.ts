import { config as loadEnv } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

function bootstrapEnv(): void {
  if (process.env.DATABASE_URL) return;
  const candidates = [
    process.env.YAYTD_ENV_FILE,
    resolve(process.cwd(), ".env"),
  ].filter((p): p is string => Boolean(p));
  for (const path of candidates) {
    if (existsSync(path)) {
      loadEnv({ path });
      return;
    }
  }
}
bootstrapEnv();

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient(): PrismaClient {
  const connectionString = (process.env.DATABASE_URL ?? "").replace(/\r/g, "").trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
