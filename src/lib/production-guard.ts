import { config } from "@/lib/config";
import { getConfiguredAppUrls } from "@/lib/app-origin";

/** Fail fast when production is misconfigured (call at Node startup). */
export function validateProductionConfig(): void {
  if (config.nodeEnv !== "production") return;

  const missing: string[] = [];

  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
    missing.push("AUTH_SECRET (min 32 chars)");
  }

  if (!process.env.ADMIN_DEFAULT_PASSWORD) {
    missing.push(
      "ADMIN_DEFAULT_PASSWORD (set via install script or securely)"
    );
  }

  if (getConfiguredAppUrls().length === 0) {
    missing.push("APP_URL or NEXT_PUBLIC_APP_URL");
  }

  if (!config.trustProxy) {
    console.warn(
      "[security] TRUST_PROXY is not true — rate limits and IP logging may be wrong behind a reverse proxy."
    );
  }

  if (!config.redisUrl) {
    console.warn(
      "[security] REDIS_URL is not set — downloads run in-process without queue isolation."
    );
  }

  // Validate ALLOWED_HOSTS in production
  if (!process.env.ALLOWED_HOSTS && getConfiguredAppUrls().length === 0) {
    console.warn(
      "[security] ALLOWED_HOSTS should be configured in production for host header validation."
    );
  }

  if (missing.length > 0) {
    throw new Error(
      `Production configuration incomplete: ${missing.join(", ")}`
    );
  }
}
