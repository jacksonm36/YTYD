import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { apiError } from "@/lib/security";
import {
  handleApiAuthError,
  invalidateUserSessions,
  requireApiSession,
} from "@/lib/api-auth";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export async function PATCH(request: Request) {
  try {
    const session = await requireApiSession(request);
    const data = schema.parse(await request.json());
    const user = await prisma.user.findUnique({
      where: { id: session.user!.id },
    });

    if (!user?.passwordHash) return apiError("unauthorized", 401);

    const { valid } = await verifyPassword(
      data.currentPassword,
      user.passwordHash
    );
    if (!valid) return apiError("generic", 400);

    const passwordHash = await hashPassword(data.newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    await invalidateUserSessions(user.id);

    return Response.json({ success: true, relogin: true });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    return apiError("generic", 400);
  }
}
