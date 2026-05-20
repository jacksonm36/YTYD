/**
 * One-time migration: rehash all bcrypt password hashes to Argon2id.
 * Requires knowing passwords — only upgrades users who log in (see rehashPasswordIfNeeded).
 *
 * To force-reset admin after switching algorithms:
 *   ADMIN_DEFAULT_PASSWORD=admin npm run db:seed-admin
 * (delete admin row first if hash format changed and login fails)
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const bcryptUsers = await prisma.user.findMany({
    where: { passwordHash: { startsWith: "$2" } },
    select: { id: true, email: true, username: true },
  });

  console.log(
    `Found ${bcryptUsers.length} user(s) with bcrypt hashes.`
  );
  console.log(
    "They will auto-upgrade to Argon2id on next successful login."
  );
  console.log(
    "Or reset admin: delete user and run npm run db:seed-admin"
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
