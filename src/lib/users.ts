import { prisma } from "@/lib/prisma";

export const RESERVED_USERNAMES = new Set(["admin", "root", "system", "administrator"]);

export function normalizeLogin(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidUsername(username: string): boolean {
  return /^[a-z0-9_]{3,32}$/.test(username);
}

export async function findUserByLogin(login: string) {
  const normalized = normalizeLogin(login);
  return prisma.user.findFirst({
    where: {
      OR: [{ email: normalized }, { username: normalized }],
    },
  });
}
