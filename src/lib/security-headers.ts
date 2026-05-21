import { buildContentSecurityPolicy } from "./app-origin";

/** HTTP response headers for browser security (see securityheaders.com). */
export function buildSecurityHeaders(): { key: string; value: string }[] {
  const isProduction = (process.env.NODE_ENV ?? "development") === "production";

  const headers: { key: string; value: string }[] = [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy(),
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    /**
     * credentialless: cross-origin images/media (e.g. thumbnails) still load;
     * stricter require-corp would break most external embeds.
     */
    { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
  ];

  if (isProduction) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  }

  return headers;
}

/** Nginx `add_header` lines (same policy as the app). */
export function nginxSecurityHeaderLines(): string[] {
  return buildSecurityHeaders().map(
    (h) => `add_header ${h.key} "${h.value}" always;`
  );
}

/** Hide nginx version; pair with proxy_hide_header in nginxProxyHideHeaderLines(). */
export const NGINX_SERVER_TOKENS_OFF = "server_tokens off;";
