import { unlink, rm } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { validatePublicUrl } from "@/lib/security";
import { downloadMedia } from "@/lib/yt-dlp";
import type { ProgressUpdate } from "@/lib/download-progress";

const STALE_RUNNING_MS = 15 * 60 * 1000;
const STALE_QUEUED_MS = 45 * 60 * 1000;

export function getJobExpiry(): Date {
  return new Date(Date.now() + config.jobTtlHours * 60 * 60 * 1000);
}

async function persistProgress(jobId: string, update: ProgressUpdate) {
  await prisma.downloadJob.update({
    where: { id: jobId },
    data: {
      phase: update.phase,
      progress: update.progress,
      downloadProgress: update.downloadProgress,
      convertProgress: update.convertProgress,
    },
  });
}

export async function cleanupExpiredJobs(): Promise<void> {
  const expired = await prisma.downloadJob.findMany({
    where: { expiresAt: { lt: new Date() } },
    take: 50,
  });

  for (const job of expired) {
    await deleteJobFiles(job.id, job.filePath);
    await prisma.downloadJob.update({
      where: { id: job.id },
      data: { status: "expired", phase: "expired", filePath: null },
    });
  }
}

/** Mark stuck jobs failed so workers do not spin forever. */
export async function recoverStaleJobs(): Promise<void> {
  const runningCutoff = new Date(Date.now() - STALE_RUNNING_MS);
  const queuedCutoff = new Date(Date.now() - STALE_QUEUED_MS);

  const staleRunning = await prisma.downloadJob.findMany({
    where: { status: "running", updatedAt: { lt: runningCutoff } },
    select: { id: true, filePath: true },
  });

  for (const job of staleRunning) {
    await deleteJobFiles(job.id, job.filePath);
  }

  await prisma.downloadJob.updateMany({
    where: { status: "running", updatedAt: { lt: runningCutoff } },
    data: { status: "failed", phase: "failed", errorCode: "timeout" },
  });

  await prisma.downloadJob.updateMany({
    where: { status: "queued", updatedAt: { lt: queuedCutoff } },
    data: { status: "failed", phase: "failed", errorCode: "stale" },
  });
}

export async function deleteJobFiles(
  jobId: string,
  filePath?: string | null
): Promise<void> {
  if (filePath) {
    try {
      await unlink(filePath);
    } catch {
      /* ignore */
    }
  }
  const dir = path.join(config.tempDownloadDir, jobId);
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/** Process one download job (called by Redis worker or in-process fallback). */
export async function runDownloadJob(jobId: string): Promise<void> {
  const claimed = await prisma.downloadJob.updateMany({
    where: { id: jobId, status: "queued" },
    data: {
      status: "running",
      phase: "downloading",
      progress: 0,
      downloadProgress: 0,
      convertProgress: 0,
    },
  });

  if (claimed.count === 0) return;

  const job = await prisma.downloadJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  try {
    await validatePublicUrl(job.url);

    const outputDir = path.join(config.tempDownloadDir, jobId);
    const needsConvert = job.type === "audio";

    const result = await downloadMedia({
      url: job.url,
      formatId: job.formatId ?? "bestvideo+bestaudio/best",
      type: job.type as "video" | "audio",
      outputDir,
      title: job.title ?? "download",
      onProgress: async (update) => {
        let phase = update.phase;
        if (
          phase === "downloading" &&
          needsConvert &&
          update.downloadProgress >= 99
        ) {
          phase = "converting";
        }
        await persistProgress(jobId, { ...update, phase });
      },
    });

    const resolved = path.resolve(result.filePath);
    const base = path.resolve(outputDir);
    if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
      throw new Error("invalidOutputPath");
    }

    await prisma.downloadJob.update({
      where: { id: jobId },
      data: {
        status: "ready",
        phase: "ready",
        progress: 100,
        downloadProgress: 100,
        convertProgress: 100,
        filePath: result.filePath,
        fileName: result.fileName,
        fileSize: BigInt(result.fileSize),
        completedAt: new Date(),
      },
    });
  } catch (err) {
    const code =
      err instanceof Error && err.message === "fileTooLarge"
        ? "fileTooLarge"
        : err instanceof Error && err.message === "invalidUrl"
          ? "invalidUrl"
          : "generic";
    await prisma.downloadJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        phase: "failed",
        errorCode: code,
        progress: 0,
      },
    });
    await deleteJobFiles(jobId);
    throw err;
  }
}
