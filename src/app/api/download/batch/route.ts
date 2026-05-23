import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleApiAuthError, requireApiSession } from "@/lib/api-auth";
import { config } from "@/lib/config";
import {
  apiError,
  checkRateLimit,
  countPendingJobs,
  countRunningJobs,
  getClientIp,
  hashIp,
  validatePublicUrl,
} from "@/lib/security";
import { getJobExpiry, cleanupExpiredJobs } from "@/lib/jobs";
import { scheduleJob } from "@/lib/queue";
import { probeUrl, YtDlpError } from "@/lib/yt-dlp";
import { isAllowedFormatId } from "@/lib/probe-cache";

const itemSchema = z.object({
  url: z.string().url().max(2048),
  formatId: z.string().min(1).max(256),
  type: z.enum(["video", "audio"]),
  formatLabel: z.string().max(200).optional(),
  title: z.string().max(500).optional(),
});

const schema = z.object({
  acceptTerms: z.literal(true),
  items: z.array(itemSchema).min(1).max(10),
});

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    const body = schema.parse(await request.json());

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        termsAcceptedAt: true,
        accountStatus: true,
        role: true,
      },
    });
    if (!user) return apiError("unauthorized", 401);
    if (user.role !== "admin" && user.accountStatus !== "approved") {
      return apiError("unauthorized", 401);
    }

    if (!user.termsAcceptedAt) {
      await prisma.user.update({
        where: { id: user.id },
        data: { termsAcceptedAt: new Date() },
      });
    }

    const ip = getClientIp(request);
    const [pending, running] = await Promise.all([
      countPendingJobs(session.user.id),
      countRunningJobs(session.user.id),
    ]);
    if (pending + body.items.length > config.maxPendingJobsPerUser) {
      return apiError("tooManyPending", 429);
    }
    if (running >= config.maxConcurrentJobsPerUser) {
      return apiError("tooManyJobs", 429);
    }

    void cleanupExpiredJobs();

    const jobIds: string[] = [];
    const errors: { url: string; code: string }[] = [];

    for (const item of body.items) {
      try {
        const url = (await validatePublicUrl(item.url)).toString();

        if (!isAllowedFormatId(session.user.id, url, item.formatId)) {
          errors.push({ url, code: "invalidFormat" });
          continue;
        }

        const probe = await probeUrl(url);
        if (probe.duration > config.maxVideoDurationSeconds) {
          errors.push({ url, code: "videoTooLong" });
          continue;
        }

        const selected = probe.formats.find((f) => f.formatId === item.formatId);
        if (!selected || selected.type !== item.type) {
          errors.push({ url, code: "invalidFormat" });
          continue;
        }

        await checkRateLimit({
          action: "download",
          userId: session.user.id,
          ipHash: hashIp(ip),
        });

        const job = await prisma.downloadJob.create({
          data: {
            userId: session.user.id,
            url,
            formatId: item.formatId,
            type: item.type,
            title: item.title ?? probe.title,
            formatLabel: item.formatLabel ?? selected.label,
            status: "queued",
            phase: "queued",
            expiresAt: getJobExpiry(),
          },
        });

        await scheduleJob(job.id);
        jobIds.push(job.id);
      } catch (err) {
        if (err instanceof YtDlpError) {
          errors.push({ url: item.url, code: err.code });
        } else if (err instanceof Error && err.message === "rateLimited") {
          errors.push({ url: item.url, code: "rateLimited" });
          break;
        } else if (err instanceof Error && err.message === "invalidUrl") {
          errors.push({ url: item.url, code: "invalidUrl" });
        } else {
          errors.push({ url: item.url, code: "generic" });
        }
      }
    }

    if (jobIds.length === 0 && errors.length > 0) {
      return Response.json(
        { jobIds: [], errors, queued: 0 },
        { status: 400 }
      );
    }

    return Response.json({
      jobIds,
      errors,
      queued: jobIds.length,
    });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    if (err instanceof z.ZodError) {
      const terms = err.errors.find((e) => e.path[0] === "acceptTerms");
      if (terms) return apiError("termsRequired", 400);
      return apiError("invalidUrl", 400);
    }
    return apiError("generic", 500);
  }
}
