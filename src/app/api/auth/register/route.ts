import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/crypto";
import { checkRateLimit, getClientIp, hashIp } from "@/lib/security";
import { handleApiAuthError, requireMutationOrigin } from "@/lib/api-auth";
import {
  isValidUsername,
  normalizeUsername,
  RESERVED_USERNAMES,
} from "@/lib/users";
import { ACCOUNT_STATUS, isValidInviteToken } from "@/lib/invites";

const schema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100).optional(),
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/)
    .optional(),
  locale: z.enum(["hu", "en"]).optional(),
  invite: z.string().min(16).max(128),
});

export async function POST(request: Request) {
  try {
    requireMutationOrigin(request);
    const ip = getClientIp(request);
    await checkRateLimit({ action: "login", ipHash: hashIp(ip) });

    const body = await request.json();
    const data = schema.parse(body);

    if (!(await isValidInviteToken(data.invite))) {
      return Response.json({ error: "invalidInvite" }, { status: 403 });
    }

    const email = data.email.toLowerCase().trim();

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      return Response.json({ error: "generic" }, { status: 400 });
    }

    let username: string | undefined;
    if (data.username) {
      username = normalizeUsername(data.username);
      if (!isValidUsername(username) || RESERVED_USERNAMES.has(username)) {
        return Response.json({ error: "invalidUsername" }, { status: 400 });
      }
      const existingUser = await prisma.user.findUnique({ where: { username } });
      if (existingUser) {
        return Response.json({ error: "usernameTaken" }, { status: 400 });
      }
    }

    const passwordHash = await hashPassword(data.password);

    await prisma.user.create({
      data: {
        email,
        username,
        name: data.name?.trim(),
        passwordHash,
        locale: data.locale ?? "hu",
        role: "user",
        accountStatus: ACCOUNT_STATUS.PENDING,
      },
    });

    return Response.json({ success: true, pendingApproval: true });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    if (err instanceof z.ZodError) {
      return Response.json({ error: "passwordMin" }, { status: 400 });
    }
    if (err instanceof Error && err.message === "rateLimited") {
      return Response.json({ error: "rateLimited" }, { status: 429 });
    }
    return Response.json({ error: "generic" }, { status: 500 });
  }
}
