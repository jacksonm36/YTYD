import createIntlMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { routing } from "@/i18n/routing";
import { isPublicApiPath } from "@/lib/public-api";
import { getAllowedHosts } from "@/lib/app-origin";
import { corsPreflightResponse, applyCorsHeaders } from "@/lib/cors";

const intlMiddleware = createIntlMiddleware(routing);

const protectedPages = ["/dashboard", "/history", "/settings"];

const useSecureCookies = process.env.NODE_ENV === "production";

async function isAuthenticated(request: NextRequest): Promise<boolean> {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: useSecureCookies,
  });
  return !!(token?.id ?? token?.sub);
}

function validateHost(request: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV !== "production") return null;

  const hostHeader = request.headers.get("host");
  if (!hostHeader) return null;

  const hostname = hostHeader.split(":")[0]?.toLowerCase();
  const allowed = getAllowedHosts();

  if (hostname && !allowed.includes(hostname)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hostBlock = validateHost(request);
  if (hostBlock) return hostBlock;

  if (pathname.startsWith("/api")) {
    const preflight = corsPreflightResponse(request);
    if (preflight) return preflight;

    const authed = await isAuthenticated(request);
    let response: NextResponse;
    if (isPublicApiPath(pathname)) {
      response = NextResponse.next();
    } else if (!authed) {
      response = NextResponse.json({ error: "unauthorized" }, { status: 401 });
    } else {
      response = NextResponse.next();
    }

    return applyCorsHeaders(request, response) as NextResponse;
  }

  if (pathname === "/" || pathname === "") {
    return NextResponse.redirect(new URL("/hu", request.url));
  }

  const localeMatch = pathname.match(/^\/(hu|en)(\/|$)/);
  const locale = localeMatch?.[1] ?? "hu";
  const pathWithoutLocale = pathname.replace(/^\/(hu|en)/, "") || "/";

  const needsAuth = protectedPages.some(
    (p) => pathWithoutLocale === p || pathWithoutLocale.startsWith(`${p}/`)
  );

  if (needsAuth && !(await isAuthenticated(request))) {
    const loginUrl = new URL(`/${locale}/login`, request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
