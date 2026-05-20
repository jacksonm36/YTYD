import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { apiError } from "@/lib/security";
import { handleApiAuthError, requireApiSession } from "@/lib/api-auth";
import { serializeLoginEvent } from "@/lib/login-history";

export async function GET(request: Request) {
  try {
    const session = await requireApiSession(request);
    const role = (session.user as { role?: string }).role ?? "user";
    const isAdmin = role === "admin";

    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      200,
      Math.max(1, Number(searchParams.get("limit") ?? config.loginHistoryLimit))
    );

    const events = await prisma.loginEvent.findMany({
      where: isAdmin ? {} : { userId: session.user!.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: isAdmin
        ? {
            user: {
              select: { username: true, email: true, name: true },
            },
          }
        : undefined,
    });

    return Response.json({
      events: events.map((e) => serializeLoginEvent(e)),
      isAdmin,
    });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    return apiError("generic", 500);
  }
}
