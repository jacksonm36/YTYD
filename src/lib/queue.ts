import { Queue } from "bullmq";
import { config } from "@/lib/config";
import { createRedisConnection, isRedisEnabled } from "@/lib/redis";
import { runDownloadJob } from "@/lib/jobs";

let inProcessActive = 0;

export const DOWNLOAD_QUEUE_NAME = "yaytd-downloads";

export type DownloadJobPayload = {
  jobId: string;
};

let downloadQueue: Queue<DownloadJobPayload> | null = null;

export function getDownloadQueue(): Queue<DownloadJobPayload> | null {
  if (!isRedisEnabled()) return null;

  if (!downloadQueue) {
    downloadQueue = new Queue<DownloadJobPayload>(DOWNLOAD_QUEUE_NAME, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { age: 3600, count: 500 },
        removeOnFail: { age: 86400, count: 200 },
      },
    });
  }

  return downloadQueue;
}

/** Enqueue job in Redis, or run in-process when Redis is unavailable. */
export async function scheduleJob(jobId: string): Promise<void> {
  const queue = getDownloadQueue();

  if (!queue) {
    const max = config.maxConcurrentJobsPerUser * 4;
    if (inProcessActive >= max) {
      throw new Error("queueBusy");
    }
    inProcessActive += 1;
    setImmediate(() => {
      void runDownloadJob(jobId).finally(() => {
        inProcessActive = Math.max(0, inProcessActive - 1);
      });
    });
    return;
  }

  // Job runtime limit is enforced by the worker lockDuration and yt-dlp kill timeout in jobs.ts.
  await queue.add("process", { jobId }, { jobId });
}

export async function closeDownloadQueue(): Promise<void> {
  if (downloadQueue) {
    await downloadQueue.close();
    downloadQueue = null;
  }
}
