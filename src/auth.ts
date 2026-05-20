import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyPassword, rehashPasswordIfNeeded } from "@/lib/crypto";
import { getClientIp } from "@/lib/client-ip";
import { checkRateLimit, hashIp } from "@/lib/security";
import { findUserByLogin } from "@/lib/users";
import { canUserSignIn } from "@/lib/invites";
import {
  PendingApprovalError,
  RejectedAccountError,
} from "@/lib/auth-errors";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { getConfiguredAppUrls } from "@/lib/app-origin";

const useSecureCookies = config.nodeEnv === "production";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: "jwt",
    maxAge: config.sessionMaxAgeSeconds,
    updateAge: config.sessionUpdateAgeSeconds,
  },
  jwt: {
    maxAge: config.sessionMaxAgeSeconds,
  },
  cookies: {
    sessionToken: {
      name: useSecureCookies
        ? "__Secure-authjs.session-token"
        : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    csrfToken: {
      name: useSecureCookies
        ? "__Host-authjs.csrf-token"
        : "authjs.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    callbackUrl: {
      name: useSecureCookies
        ? "__Secure-authjs.callback-url"
        : "authjs.callback-url",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        login: { label: "Login", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const login = credentials?.login as string | undefined;
        const password = credentials?.password as string | undefined;
        const ipAddress = request ? getClientIp(request) : "unknown";
        const userAgent = request?.headers.get("user-agent") ?? undefined;

        const { recordLoginEvent } = await import("@/lib/login-history-record");

        try {
          await checkRateLimit({
            action: "login",
            ipHash: hashIp(ipAddress),
          });
        } catch {
          return null;
        }

        const recordFailure = async (
          loginId: string | null,
          userId?: string | null
        ) => {
          try {
            await recordLoginEvent({
              success: false,
              loginId,
              userId: userId ?? null,
              ipAddress,
              userAgent,
            });
          } catch (err) {
            console.warn("[auth] login history record failed:", err);
          }
        };

        if (!login || !password) {
          await recordFailure(login ?? null);
          return null;
        }

        const user = await findUserByLogin(login);
        if (!user?.passwordHash) {
          await recordFailure(login);
          return null;
        }

        const { valid } = await verifyPassword(password, user.passwordHash);
        if (!valid) {
          await recordFailure(login, user.id);
          return null;
        }

        if (!canUserSignIn(user)) {
          await recordFailure(login, user.id);
          if (user.accountStatus === "rejected") {
            throw new RejectedAccountError();
          }
          throw new PendingApprovalError();
        }

        try {
          await recordLoginEvent({
            success: true,
            loginId: login,
            userId: user.id,
            ipAddress,
            userAgent,
          });
        } catch (err) {
          console.warn("[auth] login history record failed:", err);
        }

        void rehashPasswordIfNeeded(user.id, password, user.passwordHash);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          locale: user.locale,
          username: user.username ?? undefined,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user?.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { tokenVersion: true, role: true, locale: true },
        });
        token.id = user.id;
        token.role = dbUser?.role ?? "user";
        token.locale = dbUser?.locale ?? "hu";
        token.username = (user as { username?: string }).username;
        token.name = user.name;
        token.tokenVersion = dbUser?.tokenVersion ?? 0;
        token.authTime = Date.now();
      }

      if (trigger === "update" && session) {
        if (session.name !== undefined) token.name = session.name;
        if (session.username !== undefined) token.username = session.username;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        session.user.name = (token.name as string) ?? session.user.name;
        (session.user as { locale?: string }).locale =
          (token.locale as string) ?? "hu";
        (session.user as { username?: string }).username =
          token.username as string | undefined;
        (session.user as { role?: string }).role =
          (token.role as string) ?? "user";
      }
      return session;
    },
  },
  pages: {
    signIn: "/hu/login",
  },
  trustHost: !getConfiguredAppUrls().length && config.nodeEnv !== "production",
});
