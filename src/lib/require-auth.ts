import type { Session } from "next-auth";
import { auth } from "@/auth";
import { redirect } from "@/i18n/routing";

export async function requireAuth(locale: string): Promise<Session> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect({ href: "/login", locale });
    throw new Error("redirect");
  }
  return session;
}
