import { NextResponse } from "next/server";

/** Response headers that reveal framework or infrastructure. */
const EXACT_HEADERS_TO_REMOVE = new Set([
  "x-powered-by",
  "x-matched-path",
  "x-vercel-cache",
  "x-vercel-id",
]);

const PREFIX_HEADERS_TO_REMOVE = ["x-nextjs-", "x-vercel-"];

/** Vary tokens that fingerprint Next.js App Router. */
const VARY_FINGERPRINTS = new Set([
  "rsc",
  "next-router-state-tree",
  "next-router-prefetch",
  "next-router-segment-prefetch",
]);

export function shouldRemoveFingerprintHeader(name: string): boolean {
  const lower = name.toLowerCase();
  if (EXACT_HEADERS_TO_REMOVE.has(lower)) return true;
  return PREFIX_HEADERS_TO_REMOVE.some((prefix) => lower.startsWith(prefix));
}

function sanitizeVaryHeader(value: string): string | null {
  const kept = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !VARY_FINGERPRINTS.has(part));
  return kept.length > 0 ? kept.join(", ") : null;
}

/** Remove framework/proxy fingerprints from an outgoing response when possible. */
export function stripResponseFingerprint<T extends NextResponse>(response: T): T {
  for (const [name] of [...response.headers.entries()]) {
    if (shouldRemoveFingerprintHeader(name)) {
      response.headers.delete(name);
    }
  }

  const vary = response.headers.get("vary");
  if (vary) {
    const sanitized = sanitizeVaryHeader(vary);
    if (sanitized) {
      response.headers.set("vary", sanitized);
    } else {
      response.headers.delete("vary");
    }
  }

  return response;
}

/** Nginx `proxy_hide_header` directives (upstream fingerprints). */
export const NGINX_PROXY_HIDE_HEADERS = [
  "X-Powered-By",
  "Server",
  "X-Nextjs-Cache",
  "X-Nextjs-Prerender",
  "X-Nextjs-Stale-Time",
  "X-Nextjs-Postponed",
  "X-Nextjs-Rewritten-Path",
  "X-Nextjs-Rewritten-Query",
  "X-Nextjs-Request-Id",
  "X-Nextjs-Html-Request-Id",
  "X-Nextjs-Deployment-Id",
  "X-Nextjs-Action-Not-Found",
  "X-Matched-Path",
  "X-Vercel-Id",
  "X-Vercel-Cache",
] as const;

export function nginxProxyHideHeaderLines(): string[] {
  return NGINX_PROXY_HIDE_HEADERS.map(
    (h) => `    proxy_hide_header ${h};`
  );
}
