import { lookup } from "dns/promises";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { hashIp } from "@/lib/crypto";
import { isPrivateIp } from "@/lib/client-ip";
import { isSupportedMediaHost, normalizeHostname } from "@/lib/supported-sites";

export { hashIp, isPrivateIp };

export type ApiErrorCode =
  | "invalidUrl"
  | "unauthorized"
  | "rateLimited"
  | "tooManyJobs"
  | "tooManyPending"
  | "videoTooLong"
  | "fileTooLarge"
  | "termsRequired"
  | "generic"
  | "notFound"
  | "jobExpired"
  | "sessionExpired"
  | "forbidden"
  | "unsupportedPlatform"
  | "ytdlpNotFound"
  | "ytdlpBotCheck"
  | "ytdlpVideoUnavailable"
  | "ytdlpExtractFailed"
  | "downloadDirUnavailable"
  | "diskFull"
  | "invalidFormat";

export async function validatePublicUrl(urlString: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(urlString.trim());
  } catch {
    throw new Error("invalidUrl");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("invalidUrl");
  }

  if (parsed.username || parsed.password) {
    throw new Error("invalidUrl");
  }

  const port = parsed.port ? Number(parsed.port) : 443;
  if (port !== 443) {
    throw new Error("invalidUrl");
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("invalidUrl");
  }

  if (!isSupportedMediaHost(hostname)) {
    throw new Error("unsupportedPlatform");
  }

  if (isPrivateIp(hostname)) {
    throw new Error("invalidUrl");
  }

  try {
    const records = await lookup(hostname, { all: true });
    for (const record of records) {
      if (isPrivateIp(record.address)) {
        throw new Error("invalidUrl");
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message === "invalidUrl") throw err;
    throw new Error("invalidUrl");
  }

  // Single-video download only (playlist/radio params make yt-dlp much slower).
  if (
    hostname === "youtube.com" ||
    hostname === "youtu.be" ||
    hostname.endsWith(".youtube.com")
  ) {
    parsed.searchParams.delete("list");
    parsed.searchParams.delete("start_radio");
    parsed.searchParams.delete("index");
  }

  return parsed;
}

export async function checkRateLimit(params: {
  action: "probe" | "download" | "login";
  userId?: string;
  ipHash?: string;
}): Promise<void> {
  const limits: Record<string, number> = {
    probe: config.rateLimitProbePerHour,
    download: config.rateLimitDownloadPerHour,
    login: config.rateLimitLoginPerHour,
  };
  const limit = limits[params.action];
  const since = new Date(Date.now() - 60 * 60 * 1000);

  const where = {
    action: params.action,
    createdAt: { gte: since },
    ...(params.userId ? { userId: params.userId } : { ipHash: params.ipHash }),
  };

  await prisma.$transaction(async (tx) => {
    const count = await tx.rateLimitEvent.count({ where });
    if (count >= limit) {
      throw new Error("rateLimited");
    }
    await tx.rateLimitEvent.create({
      data: {
        action: params.action,
        userId: params.userId,
        ipHash: params.ipHash,
      },
    });
  });
}

export async function countRunningJobs(userId: string): Promise<number> {
  return prisma.downloadJob.count({
    where: { userId, status: "running" },
  });
}

export async function countPendingJobs(userId: string): Promise<number> {
  return prisma.downloadJob.count({
    where: {
      userId,
      status: { in: ["queued", "running"] },
    },
  });
}

/** @deprecated Use countPendingJobs or countRunningJobs */
export async function countActiveJobs(userId: string): Promise<number> {
  return countPendingJobs(userId);
}

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[^\w.\-() ]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200) || "download";
}

export { getClientIp, getClientIpFromHeaders } from "@/lib/client-ip";

export function apiError(
  code: ApiErrorCode,
  status: number
): Response {
  return Response.json({ error: code }, { status });
}
