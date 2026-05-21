import { prisma } from "@/lib/prisma";

export type LogLevel = "info" | "warn" | "error";
export type LogSource = "worker" | "ytdlp" | "job" | "system";

const MAX_MESSAGE = 4000;

export async function logServerEvent(params: {
  level?: LogLevel;
  source: LogSource;
  message: string;
  jobId?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const level = params.level ?? "info";
  const message = params.message.slice(0, MAX_MESSAGE);
  const meta =
    params.meta && Object.keys(params.meta).length > 0
      ? JSON.stringify(params.meta).slice(0, MAX_MESSAGE)
      : null;

  try {
    await prisma.systemLog.create({
      data: {
        level,
        source: params.source,
        jobId: params.jobId ?? null,
        message,
        meta,
      },
    });
  } catch (err) {
    console.error("[server-log] failed to persist:", err);
    console.error(`[${params.source}] ${message}`);
  }
}

/** Fire-and-forget variant for hot paths (yt-dlp line logging). */
export function logServerEventAsync(
  params: Parameters<typeof logServerEvent>[0]
): void {
  void logServerEvent(params);
}
