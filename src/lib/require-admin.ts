import type { Session } from "next-auth";
import { ApiAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/** Admin check from database (not stale JWT role). */
export async function requireAdminRole(session: Session): Promise<void> {
  const userId = session.user?.id;
  if (!userId) {
    throw new ApiAuthError("forbidden", 403);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (user?.role !== "admin") {
    throw new ApiAuthError("forbidden", 403);
  }
}
