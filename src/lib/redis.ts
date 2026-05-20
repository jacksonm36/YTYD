import IORedis from "ioredis";
import { config } from "@/lib/config";

export function isRedisEnabled(): boolean {
  return Boolean(config.redisUrl?.trim());
}

/** Shared options for BullMQ (requires maxRetriesPerRequest: null). */
export function createRedisConnection(): IORedis {
  return new IORedis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}
