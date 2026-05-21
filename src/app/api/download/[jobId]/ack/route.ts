import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/security";
import { handleApiAuthError, requireApiSession } from "@/lib/api-auth";
import { deleteJobFiles } from "@/lib/jobs";

/** Client finished saving the file — remove the temporary copy on the server. */
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
    if (job.status !== "ready" || !job.filePath) {
      return apiError("notFound", 404);
    }

    await deleteJobFiles(jobId, job.filePath);

    await prisma.downloadJob.update({
      where: { id: jobId },
      data: {
        status: "delivered",
        phase: "delivered",
        filePath: null,
        progress: 100,
        downloadProgress: 100,
        convertProgress: 100,
      },
    });

    return Response.json({ ok: true });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    return apiError("generic", 500);
  }
}
