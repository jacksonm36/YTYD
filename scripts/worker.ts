/**
 * Redis/BullMQ worker — run alongside the Next.js app.
 * Usage: npm run worker  (requires REDIS_URL in .env)
 */
import "../src/lib/load-env";
import { logServerEvent } from "../src/lib/server-log";
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
import { getYtDlpAntiBotStatus } from "../src/lib/ytdlp-anti-bot";

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
      await logServerEvent({ source: "worker", jobId, message: "Worker picked job" });
      await runDownloadJob(jobId);
      console.log(`[worker] done ${jobId}`);
      await logServerEvent({ source: "worker", jobId, message: "Worker finished job" });
    },
    {
      connection,
      concurrency: config.queueConcurrency,
      lockDuration: config.ytdlpTimeoutMs + 120_000,
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`[worker] failed ${job?.id}:`, err.message);
    void logServerEvent({
      source: "worker",
      jobId: job?.id,
      level: "error",
      message: err.message,
    });
  });

  const antiBot = await getYtDlpAntiBotStatus();
  await logServerEvent({
    source: "worker",
    message: "Worker started",
    meta: { antiBot, ytdlpPath: config.ytdlpPath },
  });

  console.log(
    `Download worker running (concurrency=${config.queueConcurrency}, redis=${config.redisUrl})`
  );
  console.log("yt-dlp anti-bot:", JSON.stringify(antiBot));

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
