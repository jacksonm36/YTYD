import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/security";
import { handleApiAuthError, requireApiSession } from "@/lib/api-auth";
import {
  isValidUsername,
  normalizeUsername,
  RESERVED_USERNAMES,
} from "@/lib/users";

const schema = z.object({
  name: z.string().min(1).max(100).optional(),
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/)
    .optional(),
});

export async function PATCH(request: Request) {
  try {
    const session = await requireApiSession(request);
    const data = schema.parse(await request.json());
    const user = await prisma.user.findUnique({
      where: { id: session.user!.id },
    });
    if (!user) return apiError("unauthorized", 401);

    const updates: { name?: string; username?: string } = {};

    if (data.name !== undefined) {
      updates.name = data.name.trim();
    }

    if (data.username !== undefined) {
      const username = normalizeUsername(data.username);
      if (!isValidUsername(username)) {
        return Response.json({ error: "invalidUsername" }, { status: 400 });
      }
      if (
        RESERVED_USERNAMES.has(username) &&
        user.role !== "admin"
      ) {
        return Response.json({ error: "usernameTaken" }, { status: 400 });
      }
      if (username === "admin" && user.role !== "admin") {
        return Response.json({ error: "usernameTaken" }, { status: 400 });
      }

      const taken = await prisma.user.findFirst({
        where: { username, NOT: { id: user.id } },
      });
      if (taken) {
        return Response.json({ error: "usernameTaken" }, { status: 400 });
      }
      updates.username = username;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: updates,
    });

    return Response.json({
      success: true,
      name: updated.name,
      username: updated.username,
    });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    return apiError("generic", 400);
  }
}
