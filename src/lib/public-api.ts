/** Edge-safe public API paths (no Prisma / Node imports). */
const PUBLIC_API_PREFIXES = ["/api/auth"];

/** Token-authenticated file download (auth handled in route handler). */
const PUBLIC_FILE_ROUTE = /^\/api\/download\/[^/]+\/file$/;

export function isPublicApiPath(pathname: string): boolean {
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    return true;
  }
  return PUBLIC_FILE_ROUTE.test(pathname);
}
