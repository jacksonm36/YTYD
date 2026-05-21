import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/crypto";
import { getSiteInviteToken } from "@/lib/invites";

const ADMIN_USERNAME = "admin";
const ADMIN_EMAIL = "admin@localhost";

/**
 * Ensure admin user exists.
 * IMPORTANT: ADMIN_DEFAULT_PASSWORD must be set in production or via install script.
 * If not set, the admin user is created WITHOUT a password (must be reset via secure mechanism).
 */
export async function ensureAdminUser(): Promise<void> {
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

  // Require explicit password via environment variable (no fallback default)
  const password = process.env.ADMIN_DEFAULT_PASSWORD;
  if (!password) {
    throw new Error(
      "ADMIN_DEFAULT_PASSWORD must be set via environment variable. " +
        "Use install script (scripts/install.sh) or set manually to a strong password."
    );
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
