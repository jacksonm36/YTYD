import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/security";
import { handleApiAuthError, requireApiSession } from "@/lib/api-auth";
import { requireAdminRole } from "@/lib/require-admin";
import { ACCOUNT_STATUS } from "@/lib/invites";

export async function GET(request: Request) {
  try {
    const session = await requireApiSession(request);
    await requireAdminRole(session);

    const users = await prisma.user.findMany({
      where: { accountStatus: ACCOUNT_STATUS.PENDING },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        locale: true,
        createdAt: true,
      },
    });

    return Response.json({
      users: users.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    return apiError("generic", 500);
  }
}
