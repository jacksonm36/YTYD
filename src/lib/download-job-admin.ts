import { prisma } from "@/lib/prisma";
import { deleteJobFiles } from "@/lib/jobs";
import { cancelQueuedJob } from "@/lib/queue";

const REDOWNLOADABLE_STATUSES = new Set([
  "ready",
  "delivered",
  "failed",
  "expired",
]);

export function isRedownloadableStatus(status: string): boolean {
  return REDOWNLOADABLE_STATUSES.has(status);
}

export async function removeDownloadJobForUser(
  userId: string,
  jobId: string
): Promise<boolean> {
  const job = await prisma.downloadJob.findFirst({
    where: { id: jobId, userId },
  });
  if (!job) return false;

  if (job.status === "queued") {
    await cancelQueuedJob(jobId);
  }

  await deleteJobFiles(jobId, job.filePath);
  await prisma.downloadJob.delete({ where: { id: jobId } });
  return true;
}

export async function removeAllDownloadJobsForUser(
  userId: string
): Promise<number> {
  const jobs = await prisma.downloadJob.findMany({
    where: { userId },
    select: { id: true, status: true, filePath: true },
  });

  for (const job of jobs) {
    if (job.status === "queued") {
      await cancelQueuedJob(job.id);
    }
    await deleteJobFiles(job.id, job.filePath);
  }

  const result = await prisma.downloadJob.deleteMany({ where: { userId } });
  return result.count;
}
