import { randomBytes } from "crypto";
import { safeEqualHex } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { getCanonicalAppBaseUrl } from "@/lib/app-origin";

export const ACCOUNT_STATUS = {
  APPROVED: "approved",
  PENDING: "pending",
  REJECTED: "rejected",
} as const;

export type AccountStatus =
  (typeof ACCOUNT_STATUS)[keyof typeof ACCOUNT_STATUS];

export function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export async function getSiteInviteToken(): Promise<string> {
  const row = await prisma.siteConfig.findUnique({
    where: { id: "default" },
  });
  if (row) return row.inviteToken;

  const token = generateInviteToken();
  await prisma.siteConfig.create({
    data: { id: "default", inviteToken: token },
  });
  return token;
}

export async function regenerateInviteToken(): Promise<string> {
  const token = generateInviteToken();
  await prisma.siteConfig.upsert({
    where: { id: "default" },
    create: { id: "default", inviteToken: token },
    update: { inviteToken: token },
  });
  return token;
}

export async function isValidInviteToken(token: string | null | undefined): Promise<boolean> {
  if (!token || token.length < 16) return false;
  const row = await prisma.siteConfig.findUnique({
    where: { id: "default" },
    select: { inviteToken: true },
  });
  if (!row) return false;
  const expected = row.inviteToken.trim();
  const provided = token.trim();
  if (expected.length !== provided.length || !/^[a-f0-9]+$/i.test(provided)) {
    return false;
  }
  return safeEqualHex(expected.toLowerCase(), provided.toLowerCase());
}

export function getAppBaseUrl(): string {
  return getCanonicalAppBaseUrl();
}

export function buildInviteRegisterUrl(
  locale: string,
  token: string
): string {
  const base = getAppBaseUrl();
  const path = `/${locale}/register`;
  const params = new URLSearchParams({ invite: token });
  return `${base}${path}?${params.toString()}`;
}

export function canUserSignIn(user: {
  role: string;
  accountStatus: string;
}): boolean {
  if (user.role === "admin") return true;
  return user.accountStatus === ACCOUNT_STATUS.APPROVED;
}
