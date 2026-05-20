import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/security";
import { handleApiAuthError, requireApiSession } from "@/lib/api-auth";
import { requireAdminRole } from "@/lib/require-admin";
import { invalidateUserSessions } from "@/lib/api-auth";
import { ACCOUNT_STATUS } from "@/lib/invites";

const schema = z.object({
  accountStatus: z.enum([
    ACCOUNT_STATUS.APPROVED,
    ACCOUNT_STATUS.REJECTED,
  ]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await requireApiSession(request);
    await requireAdminRole(session);
    const { userId } = await params;
    const { accountStatus } = schema.parse(await request.json());

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return apiError("notFound", 404);
    if (user.role === "admin") {
      return apiError("forbidden", 403);
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { accountStatus },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        accountStatus: true,
      },
    });

    if (accountStatus === ACCOUNT_STATUS.REJECTED) {
      await invalidateUserSessions(userId);
    }

    return Response.json({ user: updated });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    if (err instanceof z.ZodError) return apiError("generic", 400);
    return apiError("generic", 500);
  }
}
