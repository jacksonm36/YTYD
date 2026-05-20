import { randomUUID } from "crypto";
import { config } from "@/lib/config";
import { createRedisConnection, isRedisEnabled } from "@/lib/redis";
export type DownloadTokenPayload = {
  jobId: string;
  userId: string;
};

const TTL_SECONDS = 900;
const KEY_PREFIX = "yaytd:dl:";

type StoredPayload = DownloadTokenPayload & { jti: string };

const memoryStore = new Map<string, { payload: StoredPayload; expiresAt: number }>();

function pruneMemory(): void {
  const now = Date.now();
  for (const [k, v] of memoryStore) {
    if (v.expiresAt < now) memoryStore.delete(k);
  }
}

export function createDownloadJti(): string {
  return randomUUID();
}

/** Register a one-time download token (must be consumed on file fetch). */
export async function registerDownloadJti(
  jti: string,
  payload: DownloadTokenPayload
): Promise<void> {
  const stored: StoredPayload = { ...payload, jti };
  if (isRedisEnabled()) {
    const redis = createRedisConnection();
    try {
      await redis.set(
        `${KEY_PREFIX}${jti}`,
        JSON.stringify(stored),
        "EX",
        TTL_SECONDS,
        "NX"
      );
    } finally {
      redis.disconnect();
    }
    return;
  }

  pruneMemory();
  memoryStore.set(jti, {
    payload: stored,
    expiresAt: Date.now() + TTL_SECONDS * 1000,
  });
}

/**
 * Consume jti (one-time). Returns payload or null if missing/expired/reused.
 */
export async function consumeDownloadJti(
  jti: string
): Promise<DownloadTokenPayload | null> {
  if (isRedisEnabled()) {
    const redis = createRedisConnection();
    try {
      const key = `${KEY_PREFIX}${jti}`;
      const raw = await redis.get(key);
      if (!raw) return null;
      await redis.del(key);
      const parsed = JSON.parse(raw) as StoredPayload;
      return { jobId: parsed.jobId, userId: parsed.userId };
    } finally {
      redis.disconnect();
    }
  }

  pruneMemory();
  const entry = memoryStore.get(jti);
  if (!entry || entry.expiresAt < Date.now()) {
    memoryStore.delete(jti);
    return null;
  }
  memoryStore.delete(jti);
  return { jobId: entry.payload.jobId, userId: entry.payload.userId };
}
