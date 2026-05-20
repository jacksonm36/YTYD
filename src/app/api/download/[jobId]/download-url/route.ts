import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/security";
import {
  handleApiAuthError,
  requireApiSession,
} from "@/lib/api-auth";
import { createDownloadToken } from "@/lib/jwt-tokens";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const session = await requireApiSession(request);
    const { jobId } = await params;

    const job = await prisma.downloadJob.findFirst({
      where: { id: jobId, userId: session.user!.id },
    });

    if (!job) return apiError("notFound", 404);
    if (job.status !== "ready" || !job.fileName) {
      return apiError("notFound", 404);
    }
    if (job.expiresAt < new Date()) {
      return apiError("jobExpired", 410);
    }

    const token = await createDownloadToken({
      jobId: job.id,
      userId: session.user!.id,
    });

    return Response.json({
      token,
      fileName: job.fileName,
      expiresInSeconds: 900,
    });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    return apiError("generic", 500);
  }
}
