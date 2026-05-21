import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/security";
import { handleApiAuthError, requireApiSession } from "@/lib/api-auth";
import { requireAdminRole } from "@/lib/require-admin";

export async function GET(request: Request) {
  try {
    const session = await requireApiSession(request);
    await requireAdminRole(session);

    const jobs = await prisma.downloadJob.findMany({
      where: {
        status: { in: ["queued", "running", "ready"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 30,
      include: {
        user: { select: { username: true, email: true } },
      },
    });

    const now = Date.now();

    return Response.json({
      jobs: jobs.map((j) => ({
        id: j.id,
        status: j.status,
        phase: j.phase,
        progress: j.progress,
        downloadProgress: j.downloadProgress,
        convertProgress: j.convertProgress,
        title: j.title,
        formatLabel: j.formatLabel,
        url: j.url,
        errorCode: j.errorCode,
        user: j.user.username ?? j.user.email,
        runningForMs: now - j.updatedAt.getTime(),
        createdAt: j.createdAt.toISOString(),
        updatedAt: j.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    return apiError("generic", 500);
  }
}
