import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/security";
import { handleApiAuthError, requireApiSession } from "@/lib/api-auth";
import { requireAdminRole } from "@/lib/require-admin";

export async function GET(request: Request) {
  try {
    const session = await requireApiSession(request);
    await requireAdminRole(session);

    const url = new URL(request.url);
    const limit = Math.min(
      500,
      Math.max(10, Number(url.searchParams.get("limit") ?? "150"))
    );
    const jobId = url.searchParams.get("jobId")?.trim() || undefined;

    const logs = await prisma.systemLog.findMany({
      where: jobId ? { jobId } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return Response.json({
      logs: logs.map((l) => ({
        id: l.id,
        level: l.level,
        source: l.source,
        jobId: l.jobId,
        message: l.message,
        meta: l.meta,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    return apiError("generic", 500);
  }
}
