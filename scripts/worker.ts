/**
 * Redis/BullMQ worker — run alongside the Next.js app.
 * Usage: npm run worker  (requires REDIS_URL in .env)
 */
import "../src/lib/load-env";
import { Worker } from "bullmq";
import { config } from "../src/lib/config";
import {
  cleanupExpiredJobs,
  recoverStaleJobs,
  runDownloadJob,
} from "../src/lib/jobs";
import {
  DOWNLOAD_QUEUE_NAME,
  type DownloadJobPayload,
} from "../src/lib/queue";
import { createRedisConnection, isRedisEnabled } from "../src/lib/redis";

async function main() {
  if (!isRedisEnabled()) {
    console.error("REDIS_URL is not set. Add REDIS_URL=redis://127.0.0.1:6379 to .env");
    process.exit(1);
  }

  const connection = createRedisConnection();

  await recoverStaleJobs();
  await cleanupExpiredJobs();

  const maintenance = setInterval(() => {
    void recoverStaleJobs();
    void cleanupExpiredJobs();
  }, 10 * 60 * 1000);

  const worker = new Worker<DownloadJobPayload>(
    DOWNLOAD_QUEUE_NAME,
    async (job) => {
      const { jobId } = job.data;
      console.log(`[worker] start ${jobId}`);
      await runDownloadJob(jobId);
      console.log(`[worker] done ${jobId}`);
    },
    {
      connection,
      concurrency: config.queueConcurrency,
      lockDuration: config.ytdlpTimeoutMs + 120_000,
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`[worker] failed ${job?.id}:`, err.message);
  });

  console.log(
    `Download worker running (concurrency=${config.queueConcurrency}, redis=${config.redisUrl})`
  );

  const shutdown = async () => {
    console.log("Shutting down worker…");
    clearInterval(maintenance);
    await worker.close();
    await connection.quit();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
