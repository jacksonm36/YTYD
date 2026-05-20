/** Canonical production hostname (override with env if needed). */
export const DEFAULT_PRODUCTION_HOST = "letolto.gamedns.hu";

export const DEFAULT_PRODUCTION_ORIGIN = `https://${DEFAULT_PRODUCTION_HOST}`;

function parseOrigin(value: string): string | null {
  try {
    const normalized = value.startsWith("http")
      ? value
      : `https://${value}`;
    return new URL(normalized).origin;
  } catch {
    return null;
  }
}

function parseHost(value: string): string | null {
  try {
    const normalized = value.startsWith("http")
      ? value
      : `https://${value}`;
    return new URL(normalized).hostname;
  } catch {
    if (/^[a-z0-9.-]+$/i.test(value)) return value.toLowerCase();
    return null;
  }
}

/** Public base URLs from environment (no trailing slash). */
export function getConfiguredAppUrls(): string[] {
  const raw = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.AUTH_URL,
    process.env.NEXTAUTH_URL,
  ].filter(Boolean) as string[];

  return [...new Set(raw.map((u) => u.replace(/\/$/, "")))];
}

/** Origins allowed for API mutation CSRF checks and optional CORS. */
export function getAllowedOrigins(): string[] {
  const origins = new Set<string>();

  for (const url of getConfiguredAppUrls()) {
    const origin = parseOrigin(url);
    if (origin) origins.add(origin);
  }

  const extra = process.env.ALLOWED_ORIGINS?.split(",") ?? [];
  for (const entry of extra) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const origin = parseOrigin(trimmed);
    if (origin) origins.add(origin);
  }

  const nodeEnv = process.env.NODE_ENV ?? "development";

  if (origins.size === 0 && nodeEnv === "production") {
    origins.add(DEFAULT_PRODUCTION_ORIGIN);
  }

  if (nodeEnv === "development") {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }

  return [...origins];
}

/** Hostnames accepted on incoming requests (production hardening). */
export function getAllowedHosts(): string[] {
  const hosts = new Set<string>();

  for (const url of getConfiguredAppUrls()) {
    const host = parseHost(url);
    if (host) hosts.add(host);
  }

  const extra = process.env.ALLOWED_HOSTS?.split(",") ?? [];
  for (const entry of extra) {
    const host = parseHost(entry.trim());
    if (host) hosts.add(host);
  }

  const nodeEnv = process.env.NODE_ENV ?? "development";

  if (hosts.size === 0 && nodeEnv === "production") {
    hosts.add(DEFAULT_PRODUCTION_HOST);
  }

  if (nodeEnv === "development") {
    hosts.add("localhost");
    hosts.add("127.0.0.1");
  }

  // Reverse proxy health checks on loopback
  hosts.add("127.0.0.1");

  return [...hosts];
}

/** Canonical HTTPS base URL for invite links and redirects. */
export function getCanonicalAppBaseUrl(): string {
  const configured = getConfiguredAppUrls();
  if (configured.length > 0) return configured[0];

  if ((process.env.NODE_ENV ?? "development") === "production") {
    return DEFAULT_PRODUCTION_ORIGIN;
  }

  return "http://localhost:3000";
}

export function buildContentSecurityPolicy(): string {
  const origins = getAllowedOrigins();
  const connectSrc = ["'self'", ...origins].join(" ");
  const formAction = ["'self'", ...origins].join(" ");

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data:",
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    `form-action ${formAction}`,
  ].join("; ");
}
