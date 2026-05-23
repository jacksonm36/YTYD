import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import {
  checkRateLimit,
  countPendingJobs,
  countRunningJobs,
  validatePublicUrl,
} from "@/lib/security";
import { getJobExpiry, cleanupExpiredJobs } from "@/lib/jobs";
import { scheduleJob } from "@/lib/queue";
import { probeUrl, YtDlpError } from "@/lib/yt-dlp";
import { cacheProbeFormats, isAllowedFormatId } from "@/lib/probe-cache";

export type QueueDownloadInput = {
  userId: string;
  url: string;
  formatId: string;
  type: "video" | "audio";
  formatLabel?: string | null;
  title?: string | null;
  ipHash: string;
};

export async function queueUserDownload(
  input: QueueDownloadInput
): Promise<{ jobId: string }> {
  const running = await countRunningJobs(input.userId);
  if (running >= config.maxConcurrentJobsPerUser) {
    throw new Error("tooManyJobs");
  }

  const pending = await countPendingJobs(input.userId);
  if (pending >= config.maxPendingJobsPerUser) {
    throw new Error("tooManyPending");
  }

  const url = (await validatePublicUrl(input.url)).toString();

  await checkRateLimit({
    action: "download",
    userId: input.userId,
    ipHash: input.ipHash,
  });

  void cleanupExpiredJobs();

  const probe = await probeUrl(url);
  if (probe.duration > config.maxVideoDurationSeconds) {
    throw new Error("videoTooLong");
  }

  const formatIds = probe.formats.map((f) => f.formatId);
  formatIds.push("bestvideo+bestaudio/best");
  cacheProbeFormats(input.userId, url, formatIds);

  if (!isAllowedFormatId(input.userId, url, input.formatId)) {
    throw new Error("invalidFormat");
  }

  const selected = probe.formats.find((f) => f.formatId === input.formatId);
  if (!selected || selected.type !== input.type) {
    throw new Error("invalidFormat");
  }

  const job = await prisma.downloadJob.create({
    data: {
      userId: input.userId,
      url,
      formatId: input.formatId,
      type: input.type,
      title: input.title ?? probe.title,
      formatLabel: input.formatLabel ?? selected.label,
      status: "queued",
      phase: "queued",
      expiresAt: getJobExpiry(),
    },
  });

  await scheduleJob(job.id);
  return { jobId: job.id };
}

export async function queueRedownloadFromJob(
  userId: string,
  sourceJobId: string,
  ipHash: string
): Promise<{ jobId: string }> {
  const source = await prisma.downloadJob.findFirst({
    where: { id: sourceJobId, userId },
  });
  if (!source?.formatId) {
    throw new Error("notFound");
  }
  if (source.status === "queued" || source.status === "running") {
    throw new Error("jobActive");
  }

  return queueUserDownload({
    userId,
    url: source.url,
    formatId: source.formatId,
    type: source.type as "video" | "audio",
    formatLabel: source.formatLabel,
    title: source.title,
    ipHash,
  });
}

export { YtDlpError };
