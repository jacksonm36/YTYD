import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/security";
import { handleApiAuthError, requireApiSession } from "@/lib/api-auth";

const schema = z.object({
  locale: z.enum(["hu", "en"]),
});

export async function PATCH(request: Request) {
  try {
    const session = await requireApiSession(request);
    const { locale } = schema.parse(await request.json());
    await prisma.user.update({
      where: { id: session.user!.id },
      data: { locale },
    });
    return Response.json({ success: true, locale });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    return apiError("generic", 400);
  }
}
