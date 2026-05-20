/** Strip Windows CRLF from `.env` values (common when editing on Windows). */
function env(key: string, fallback = ""): string {
  const raw = process.env[key] ?? fallback;
  return raw.replace(/\r/g, "").trim();
}

export const config = {
  nodeEnv: env("NODE_ENV", "development"),
  tempDownloadDir: env("TEMP_DOWNLOAD_DIR", "/tmp/downloads"),
  sessionMaxAgeSeconds: Number(process.env.SESSION_MAX_AGE_SECONDS ?? "604800"),
  sessionUpdateAgeSeconds: Number(
    process.env.SESSION_UPDATE_AGE_SECONDS ?? "86400"
  ),
  jobTtlHours: Number(process.env.JOB_TTL_HOURS ?? "2"),
  maxVideoDurationSeconds: Number(
    process.env.MAX_VIDEO_DURATION_SECONDS ?? "7200"
  ),
  maxOutputBytes: Number(process.env.MAX_OUTPUT_BYTES ?? "2147483648"),
  redisUrl: env("REDIS_URL"),
  queueConcurrency: Number(process.env.QUEUE_CONCURRENCY ?? "4"),
  maxConcurrentJobsPerUser: Number(
    process.env.MAX_CONCURRENT_JOBS_PER_USER ?? "3"
  ),
  maxPendingJobsPerUser: Number(
    process.env.MAX_PENDING_JOBS_PER_USER ?? "10"
  ),
  rateLimitProbePerHour: Number(process.env.RATE_LIMIT_PROBE_PER_HOUR ?? "10"),
  rateLimitDownloadPerHour: Number(
    process.env.RATE_LIMIT_DOWNLOAD_PER_HOUR ?? "5"
  ),
  rateLimitLoginPerHour: Number(process.env.RATE_LIMIT_LOGIN_PER_HOUR ?? "20"),
  ytdlpTimeoutMs: Number(process.env.YTDLP_TIMEOUT_MS ?? "1800000"),
  ytdlpPath: env("YTDLP_PATH", "yt-dlp"),
  /** argon2id (recommended) or bcrypt */
  passwordAlgorithm: env("PASSWORD_HASH_ALGORITHM", "argon2id").toLowerCase(),
  bcryptCost: Number(process.env.BCRYPT_COST ?? "12"),
  argon2MemoryCost: Number(process.env.ARGON2_MEMORY_COST ?? "65536"),
  argon2TimeCost: Number(process.env.ARGON2_TIME_COST ?? "3"),
  argon2Parallelism: Number(process.env.ARGON2_PARALLELISM ?? "4"),
  trustProxy: env("TRUST_PROXY") === "true",
  trustedProxyHops: Number(process.env.TRUSTED_PROXY_HOPS ?? "1"),
  maxmindLicenseKey: env("MAXMIND_LICENSE_KEY"),
  maxmindAccountId: env("MAXMIND_ACCOUNT_ID"),
  maxmindDbPath: env("MAXMIND_GEOLITE_CITY_PATH", "data/GeoLite2-City.mmdb"),
  loginHistoryLimit: Number(process.env.LOGIN_HISTORY_LIMIT ?? "50"),
  loginHistoryRetentionDays: Number(
    process.env.LOGIN_HISTORY_RETENTION_DAYS ?? "90"
  ),
  /** Separate from session JWT when DOWNLOAD_TOKEN_SECRET is set */
  downloadTokenSecret:
    env("DOWNLOAD_TOKEN_SECRET") || env("AUTH_SECRET"),
};
