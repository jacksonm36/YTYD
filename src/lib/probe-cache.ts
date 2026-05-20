import { createHash } from "crypto";

type CacheEntry = {
  formatIds: Set<string>;
  expiresAt: number;
};

const TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheKey(userId: string, url: string): string {
  const urlHash = createHash("sha256").update(url).digest("hex");
  return `${userId}:${urlHash}`;
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (v.expiresAt < now) cache.delete(k);
  }
}

/** Remember allowed format IDs from a successful probe (per user + URL). */
export function cacheProbeFormats(
  userId: string,
  url: string,
  formatIds: string[]
): void {
  pruneExpired();
  cache.set(cacheKey(userId, url), {
    formatIds: new Set(formatIds),
    expiresAt: Date.now() + TTL_MS,
  });
}

export function isAllowedFormatId(
  userId: string,
  url: string,
  formatId: string
): boolean {
  pruneExpired();
  const entry = cache.get(cacheKey(userId, url));
  if (!entry || entry.expiresAt < Date.now()) return false;
  return entry.formatIds.has(formatId);
}
