/** Strip Windows CRLF from `.env` values (common when editing on Windows). */
import { bool, num, str } from "@/lib/runtime-settings";

function env(key: string, fallback = ""): string {
  return str(key, fallback);
}

/** Runtime config: DB overrides (admin) with .env fallback. Use getters for fresh values. */
export const config = {
  get nodeEnv() {
    return env("NODE_ENV", "development");
  },
  get tempDownloadDir() {
    return env("TEMP_DOWNLOAD_DIR", "/tmp/downloads");
  },
  get sessionMaxAgeSeconds() {
    return num("SESSION_MAX_AGE_SECONDS", 604800);
  },
  get sessionUpdateAgeSeconds() {
    return num("SESSION_UPDATE_AGE_SECONDS", 86400);
  },
  get jobTtlHours() {
    return num("JOB_TTL_HOURS", 2);
  },
  get maxVideoDurationSeconds() {
    return num("MAX_VIDEO_DURATION_SECONDS", 7200);
  },
  get maxOutputBytes() {
    return num("MAX_OUTPUT_BYTES", 2147483648);
  },
  get redisUrl() {
    return env("REDIS_URL");
  },
  get queueConcurrency() {
    return num("QUEUE_CONCURRENCY", 4);
  },
  get maxConcurrentJobsPerUser() {
    return num("MAX_CONCURRENT_JOBS_PER_USER", 3);
  },
  get maxPendingJobsPerUser() {
    return num("MAX_PENDING_JOBS_PER_USER", 10);
  },
  get rateLimitProbePerHour() {
    return num("RATE_LIMIT_PROBE_PER_HOUR", 10);
  },
  get rateLimitDownloadPerHour() {
    return num("RATE_LIMIT_DOWNLOAD_PER_HOUR", 5);
  },
  get rateLimitLoginPerHour() {
    return num("RATE_LIMIT_LOGIN_PER_HOUR", 20);
  },
  get ytdlpTimeoutMs() {
    return num("YTDLP_TIMEOUT_MS", 1800000);
  },
  get ytdlpPath() {
    return env("YTDLP_PATH", "yt-dlp");
  },
  get ytdlpConcurrentFragments() {
    return num("YTDLP_CONCURRENT_FRAGMENTS", 4);
  },
  get ytdlpFfmpegCopyMerge() {
    return bool("YTDLP_FFMPEG_COPY_MERGE", true);
  },
  get ytdlpCookiesFile() {
    return env("YTDLP_COOKIES_FILE");
  },
  get ytdlpJsRuntimes() {
    return env("YTDLP_JS_RUNTIMES", "deno,node");
  },
  get ytdlpRemoteComponents() {
    return env("YTDLP_REMOTE_COMPONENTS", "ejs:github");
  },
  get ytdlpExtractorArgs() {
    return env("YTDLP_EXTRACTOR_ARGS");
  },
  get ytdlpDefaultYoutubeClients() {
    return bool("YTDLP_DEFAULT_YOUTUBE_CLIENTS", true);
  },
  get ytdlpYoutubePoToken() {
    return env("YTDLP_YOUTUBE_PO_TOKEN");
  },
  get ytdlpUserAgent() {
    return env("YTDLP_USER_AGENT");
  },
  get ytdlpSleepRequests() {
    return num("YTDLP_SLEEP_REQUESTS", 0);
  },
  get passwordAlgorithm() {
    return env("PASSWORD_HASH_ALGORITHM", "argon2id").toLowerCase();
  },
  get bcryptCost() {
    return num("BCRYPT_COST", 12);
  },
  get argon2MemoryCost() {
    return num("ARGON2_MEMORY_COST", 65536);
  },
  get argon2TimeCost() {
    return num("ARGON2_TIME_COST", 3);
  },
  get argon2Parallelism() {
    return num("ARGON2_PARALLELISM", 4);
  },
  get trustProxy() {
    return env("TRUST_PROXY") === "true";
  },
  get trustedProxyHops() {
    return num("TRUSTED_PROXY_HOPS", 1);
  },
  get maxmindLicenseKey() {
    return env("MAXMIND_LICENSE_KEY");
  },
  get maxmindAccountId() {
    return env("MAXMIND_ACCOUNT_ID");
  },
  get maxmindDbPath() {
    return env("MAXMIND_GEOLITE_CITY_PATH", "data/GeoLite2-City.mmdb");
  },
  get loginHistoryLimit() {
    return num("LOGIN_HISTORY_LIMIT", 50);
  },
  get loginHistoryRetentionDays() {
    return num("LOGIN_HISTORY_RETENTION_DAYS", 90);
  },
  get downloadTokenSecret() {
    return env("DOWNLOAD_TOKEN_SECRET") || env("AUTH_SECRET");
  },
};
