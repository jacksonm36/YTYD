import { getToken } from "next-auth/jwt";
import type { Session } from "next-auth";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/security";
import { config } from "@/lib/config";
import { getAllowedOrigins } from "@/lib/app-origin";

import { isPublicApiPath } from "@/lib/public-api";

export { isPublicApiPath };

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Require same-origin for public mutation routes (e.g. register). */
export function requireMutationOrigin(request: Request): void {
  if (!validateRequestOrigin(request)) {
    throw new ApiAuthError("forbidden", 403);
  }
}

export function validateRequestOrigin(request: Request): boolean {
  const allowed = getAllowedOrigins();
  if (allowed.length === 0) {
    return config.nodeEnv !== "production";
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (origin) {
    try {
      return allowed.includes(new URL(origin).origin);
    } catch {
      return false;
    }
  }

  if (referer) {
    try {
      return allowed.includes(new URL(referer).origin);
    } catch {
      return false;
    }
  }

  return config.nodeEnv === "development";
}

async function validateSessionNotRevoked(
  request: Request,
  userId: string
): Promise<boolean> {
  const jwt = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: config.nodeEnv === "production",
  });

  if (!jwt?.sub && !jwt?.id) return false;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tokenVersion: true, accountStatus: true, role: true },
  });

  if (!user) return false;
  const jwtVersion = (jwt.tokenVersion as number | undefined) ?? 0;
  if (jwtVersion !== user.tokenVersion) return false;
  if (user.role === "admin") return true;
  return user.accountStatus === "approved";
}

/**
 * Require valid JWT session cookie + non-revoked token + same-origin for mutations.
 */
export async function requireApiSession(
  request: Request
): Promise<Session> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new ApiAuthError("unauthorized", 401);
  }

  const valid = await validateSessionNotRevoked(request, session.user.id);
  if (!valid) {
    throw new ApiAuthError("sessionExpired", 401);
  }

  if (MUTATION_METHODS.has(request.method) && !validateRequestOrigin(request)) {
    throw new ApiAuthError("forbidden", 403);
  }

  return session;
}

export class ApiAuthError extends Error {
  constructor(
    public code: string,
    public status: number
  ) {
    super(code);
  }
}

export function handleApiAuthError(err: unknown): Response | null {
  if (err instanceof ApiAuthError) {
    const code =
      err.code === "sessionExpired"
        ? "sessionExpired"
        : err.code === "unauthorized"
          ? "unauthorized"
          : err.code === "forbidden"
            ? "unauthorized"
            : "generic";
    return apiError(code, err.status);
  }
  return null;
}

export async function invalidateUserSessions(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
}
