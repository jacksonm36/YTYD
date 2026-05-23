import { handleApiAuthError, requireApiSession } from "@/lib/api-auth";
import { getClientIp, hashIp, apiError } from "@/lib/security";
import { queueRedownloadFromJob, YtDlpError } from "@/lib/queue-download";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const session = await requireApiSession(request);
    const { jobId } = await params;
    const ip = getClientIp(request);

    const { jobId: newJobId } = await queueRedownloadFromJob(
      session.user!.id!,
      jobId,
      hashIp(ip)
    );

    return Response.json({ jobId: newJobId, queued: true });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    if (err instanceof YtDlpError) return apiError(err.code, 502);
    if (err instanceof Error) {
      if (err.message === "notFound") return apiError("notFound", 404);
      if (err.message === "jobActive") return apiError("tooManyJobs", 409);
      if (err.message === "invalidUrl") return apiError("invalidUrl", 400);
      if (err.message === "invalidFormat") return apiError("invalidFormat", 400);
      if (err.message === "videoTooLong") return apiError("videoTooLong", 400);
      if (err.message === "rateLimited") return apiError("rateLimited", 429);
      if (err.message === "tooManyJobs") return apiError("tooManyJobs", 429);
      if (err.message === "tooManyPending") return apiError("tooManyPending", 429);
    }
    return apiError("generic", 500);
  }
}
