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



const schema = z.object({

  url: z.string().url().max(2048),

  formatId: z.string().min(1).max(256),

  type: z.enum(["video", "audio"]),

  formatLabel: z.string().max(200).optional(),

  acceptTerms: z.literal(true),

});



export async function POST(request: Request) {

  try {

    const session = await requireApiSession(request);

    const body = schema.parse(await request.json());



    if (!body.acceptTerms) return apiError("termsRequired", 400);



    const user = await prisma.user.findUnique({

      where: { id: session.user.id },

      select: { id: true, termsAcceptedAt: true, accountStatus: true, role: true },

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

    const url = (await validatePublicUrl(body.url)).toString();



    if (!isAllowedFormatId(session.user.id, url, body.formatId)) {

      return apiError("invalidFormat", 400);

    }



    const running = await countRunningJobs(session.user.id);

    if (running >= config.maxConcurrentJobsPerUser) {

      return apiError("tooManyJobs", 429);

    }



    const pending = await countPendingJobs(session.user.id);

    if (pending >= config.maxPendingJobsPerUser) {

      return apiError("tooManyPending", 429);

    }



    const probe = await probeUrl(url);

    if (probe.duration > config.maxVideoDurationSeconds) {

      return apiError("videoTooLong", 400);

    }



    const selected = probe.formats.find((f) => f.formatId === body.formatId);

    if (!selected || selected.type !== body.type) {

      return apiError("invalidFormat", 400);

    }



    await checkRateLimit({

      action: "download",

      userId: session.user.id,

      ipHash: hashIp(ip),

    });



    void cleanupExpiredJobs();



    const job = await prisma.downloadJob.create({

      data: {

        userId: session.user.id,

        url,

        formatId: body.formatId,

        type: body.type,

        title: probe.title,

        formatLabel: body.formatLabel ?? selected.label,

        status: "queued",

        phase: "queued",

        expiresAt: getJobExpiry(),

      },

    });



    await scheduleJob(job.id);



    return Response.json({ jobId: job.id, queued: true });

  } catch (err) {

    const authRes = handleApiAuthError(err);

    if (authRes) return authRes;

    if (err instanceof YtDlpError) return apiError(err.code, 502);

    if (err instanceof z.ZodError) {

      const terms = err.errors.find((e) => e.path[0] === "acceptTerms");

      if (terms) return apiError("termsRequired", 400);

      return apiError("invalidUrl", 400);

    }

    if (err instanceof Error) {

      if (err.message === "invalidUrl") return apiError("invalidUrl", 400);

      if (err.message === "rateLimited") return apiError("rateLimited", 429);

    }

    return apiError("generic", 500);

  }

}


