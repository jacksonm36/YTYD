import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/security";
import { handleApiAuthError, requireApiSession } from "@/lib/api-auth";
import { removeDownloadJobForUser } from "@/lib/download-job-admin";

function serializeJob(job: {
  id: string;
  status: string;
  phase: string;
  progress: number;
  downloadProgress: number;
  convertProgress: number;
  errorCode: string | null;
  title: string | null;
  fileName: string | null;
  filePath: string | null;
  fileSize: bigint | null;
  type: string;
  formatLabel: string | null;
  formatId: string | null;
  url: string;
  completedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
}) {
  const expired =
    job.expiresAt < new Date() && (job.status === "ready" || job.status === "running");

  return {
    id: job.id,
    status: expired && job.status === "ready" ? "expired" : job.status,
    phase: expired ? "expired" : job.phase,
    progress: job.progress,
    downloadProgress: job.downloadProgress,
    convertProgress: job.convertProgress,
    errorCode: expired ? "jobExpired" : job.errorCode,
    title: job.title,
    fileName: job.fileName,
    fileSize: job.fileSize?.toString(),
    type: job.type,
    formatLabel: job.formatLabel,
    formatId: job.formatId,
    url: job.url,
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    expiresAt: job.expiresAt.toISOString(),
    canDownload:
      !expired && job.status === "ready" && !!job.fileName && !!job.filePath,
  };
}

export async function GET(
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

    return Response.json(serializeJob(job));
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    return apiError("notFound", 404);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const session = await requireApiSession(request);
    const { jobId } = await params;
    const removed = await removeDownloadJobForUser(session.user!.id!, jobId);
    if (!removed) return apiError("notFound", 404);
    return Response.json({ ok: true });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    return apiError("generic", 500);
  }
}
