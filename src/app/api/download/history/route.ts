import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/security";
import { handleApiAuthError, requireApiSession } from "@/lib/api-auth";

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
