/** Keys admins may override in the database (env is fallback). */
export type ServerSettingDef = {
  key: string;
  type: "number" | "boolean" | "string";
  min?: number;
  max?: number;
  description: string;
};

export const SERVER_SETTING_DEFINITIONS: ServerSettingDef[] = [
  {
    key: "QUEUE_CONCURRENCY",
    type: "number",
    min: 1,
    max: 32,
    description: "Parallel download workers (BullMQ)",
  },
  {
    key: "MAX_CONCURRENT_JOBS_PER_USER",
    type: "number",
    min: 1,
    max: 20,
    description: "Max running jobs per user",
  },
  {
    key: "MAX_PENDING_JOBS_PER_USER",
    type: "number",
    min: 1,
    max: 50,
    description: "Max queued jobs per user",
  },
  {
    key: "MAX_VIDEO_DURATION_SECONDS",
    type: "number",
    min: 60,
    max: 86400,
    description: "Max media duration (seconds)",
  },
  {
    key: "MAX_OUTPUT_BYTES",
    type: "number",
    min: 1_000_000,
    max: 16_000_000_000,
    description: "Max output file size (bytes)",
  },
  {
    key: "JOB_TTL_HOURS",
    type: "number",
    min: 1,
    max: 168,
    description: "Hours before job files expire",
  },
  {
    key: "RATE_LIMIT_PROBE_PER_HOUR",
    type: "number",
    min: 1,
    max: 500,
    description: "URL probe rate limit per hour",
  },
  {
    key: "RATE_LIMIT_DOWNLOAD_PER_HOUR",
    type: "number",
    min: 1,
    max: 500,
    description: "Download start rate limit per hour",
  },
  {
    key: "RATE_LIMIT_LOGIN_PER_HOUR",
    type: "number",
    min: 1,
    max: 500,
    description: "Login attempts rate limit per hour",
  },
  {
    key: "YTDLP_TIMEOUT_MS",
    type: "number",
    min: 60_000,
    max: 7_200_000,
    description: "yt-dlp timeout (milliseconds)",
  },
  {
    key: "YTDLP_CONCURRENT_FRAGMENTS",
    type: "number",
    min: 0,
    max: 16,
    description: "Parallel HLS/DASH fragments (0=off)",
  },
  {
    key: "LOGIN_HISTORY_LIMIT",
    type: "number",
    min: 10,
    max: 500,
    description: "Login history rows shown per user",
  },
  {
    key: "LOGIN_HISTORY_RETENTION_DAYS",
    type: "number",
    min: 1,
    max: 3650,
    description: "Login history retention (days)",
  },
  {
    key: "YTDLP_FFMPEG_COPY_MERGE",
    type: "boolean",
    description: "Use ffmpeg stream copy when merging",
  },
  {
    key: "YTDLP_DEFAULT_YOUTUBE_CLIENTS",
    type: "boolean",
    description: "Use default YouTube client bundle",
  },
];

export const SERVER_SETTING_KEYS = new Set(
  SERVER_SETTING_DEFINITIONS.map((d) => d.key)
);

export function getServerSettingDef(
  key: string
): ServerSettingDef | undefined {
  return SERVER_SETTING_DEFINITIONS.find((d) => d.key === key);
}
