import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/crypto";
import { getSiteInviteToken } from "@/lib/invites";

const ADMIN_USERNAME = "admin";
const ADMIN_EMAIL = "admin@localhost";

export async function ensureAdminUser(): Promise<void> {
  const password = process.env.ADMIN_DEFAULT_PASSWORD ?? "admin";

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ username: ADMIN_USERNAME }, { email: ADMIN_EMAIL }],
    },
  });

  if (existing) {
    if (!existing.username) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          username: ADMIN_USERNAME,
          role: "admin",
          accountStatus: "approved",
        },
      });
    }
    return;
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: {
      username: ADMIN_USERNAME,
      email: ADMIN_EMAIL,
      name: "Admin",
      passwordHash,
      role: "admin",
      accountStatus: "approved",
      locale: "hu",
    },
  });

  await getSiteInviteToken();
}
