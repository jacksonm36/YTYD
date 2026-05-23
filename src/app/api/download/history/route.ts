import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  apiError,
  countPendingJobs,
  getClientIp,
  hashIp,
} from "@/lib/security";
import { handleApiAuthError, requireApiSession } from "@/lib/api-auth";
import {
  isRedownloadableStatus,
  removeAllDownloadJobsForUser,
} from "@/lib/download-job-admin";
import { queueRedownloadFromJob, YtDlpError } from "@/lib/queue-download";
import { config } from "@/lib/config";

const REDOWNLOAD_ALL_LIMIT = 10;

export async function GET(request: Request) {
  try {
    const session = await requireApiSession(request);
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "50")));

    const jobs = await prisma.downloadJob.findMany({
      where: { userId: session.user!.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const now = new Date();

    return Response.json({
      jobs: jobs.map((job) => {
        const expired = job.expiresAt < now && job.status === "ready";
        return {
          id: job.id,
          title: job.title,
          url: job.url,
          type: job.type,
          formatLabel: job.formatLabel,
          formatId: job.formatId,
          status: expired ? "expired" : job.status,
          phase: expired ? "expired" : job.phase,
          progress: job.progress,
          downloadProgress: job.downloadProgress,
          convertProgress: job.convertProgress,
          errorCode: job.errorCode,
          fileName: job.fileName,
          fileSize: job.fileSize?.toString() ?? null,
          createdAt: job.createdAt.toISOString(),
          completedAt: job.completedAt?.toISOString() ?? null,
          expiresAt: job.expiresAt.toISOString(),
          canDownload: !expired && job.status === "ready" && !!job.fileName,
        };
      }),
    });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    return apiError("unauthorized", 401);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireApiSession(request);
    const deleted = await removeAllDownloadJobsForUser(session.user!.id!);
    return Response.json({ deleted });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    return apiError("generic", 500);
  }
}

const redownloadSchema = z.object({
  all: z.literal(true).optional(),
  jobIds: z.array(z.string().min(1).max(64)).max(REDOWNLOAD_ALL_LIMIT).optional(),
});

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    const body = redownloadSchema.parse(await request.json());
    const userId = session.user!.id!;
    const ipHash = hashIp(getClientIp(request));

    let sources: { id: string; status: string }[] = [];

    if (body.all) {
      sources = await prisma.downloadJob.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: REDOWNLOAD_ALL_LIMIT,
        select: { id: true, status: true },
      });
      sources = sources.filter((j) => isRedownloadableStatus(j.status));
    } else if (body.jobIds?.length) {
      const rows = await prisma.downloadJob.findMany({
        where: { id: { in: body.jobIds }, userId },
        select: { id: true, status: true },
      });
      sources = rows.filter((j) => isRedownloadableStatus(j.status));
    } else {
      return apiError("generic", 400);
    }

    if (sources.length === 0) {
      return Response.json({ jobIds: [], queued: 0, errors: [] });
    }

    const pending = await countPendingJobs(userId);
    const slots = Math.max(
      0,
      config.maxPendingJobsPerUser - pending
    );
    const toQueue = sources.slice(0, Math.min(slots, REDOWNLOAD_ALL_LIMIT));

    const jobIds: string[] = [];
    const errors: { id: string; code: string }[] = [];

    for (const src of toQueue) {
      try {
        const { jobId } = await queueRedownloadFromJob(userId, src.id, ipHash);
        jobIds.push(jobId);
      } catch (err) {
        if (err instanceof YtDlpError) {
          errors.push({ id: src.id, code: err.code });
        } else if (err instanceof Error) {
          errors.push({
            id: src.id,
            code:
              err.message === "rateLimited"
                ? "rateLimited"
                : err.message === "tooManyJobs"
                  ? "tooManyJobs"
                  : err.message === "tooManyPending"
                    ? "tooManyPending"
                    : "generic",
          });
          if (
            err.message === "rateLimited" ||
            err.message === "tooManyPending"
          ) {
            break;
          }
        }
      }
    }

    return Response.json({
      jobIds,
      queued: jobIds.length,
      errors,
      skipped: sources.length - toQueue.length,
    });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    if (err instanceof z.ZodError) return apiError("generic", 400);
    return apiError("generic", 500);
  }
}
