import { config } from "@/lib/config";

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT 100.64.0.0/10
  /^0\./,
  /^::1$/i,
  /^::$/,
  /^fc00:/i,
  /^fe80:/i,
  /^::ffff:0?:?127\./i,
  /^::ffff:10\./i,
  /^::ffff:192\.168\./i,
  /^::ffff:172\.(1[6-9]|2\d|3[0-1])\./i,
  /^::ffff:169\.254\./i,
];

export function isPrivateIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();
  if (
    normalized === "localhost" ||
    normalized === "0.0.0.0" ||
    normalized === "::" ||
    normalized === "0000:0000:0000:0000:0000:0000:0000:0000"
  ) {
    return true;
  }
  return PRIVATE_IP_PATTERNS.some((p) => p.test(normalized));
}

const IP_V4 =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)$/;
const IP_V6 =
  /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i;

export function isValidIp(ip: string): boolean {
  const trimmed = ip.trim();
  if (!trimmed || trimmed === "unknown") return false;
  return IP_V4.test(trimmed) || IP_V6.test(trimmed);
}

/** Parse RFC 7239 Forwarded header; returns first `for=` client IP. */
function parseForwardedFor(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const match = part.match(/for=(?:"\[?([^";\]]+)\]?"|([^;,\s]+))/i);
    if (!match) continue;
    const raw = (match[1] ?? match[2] ?? "").replace(/^\[|\]$/g, "");
    const ip = raw.split(":")[0]?.trim();
    if (ip && isValidIp(ip)) return ip;
  }
  return null;
}

function pickFromXForwardedFor(header: string): string | null {
  const chain = header
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (chain.length === 0) return null;

  if (config.trustProxy) {
    const hops = Math.max(1, config.trustedProxyHops);
    if (chain.length >= hops) {
      const idx = chain.length - hops;
      const candidate = chain[idx];
      if (candidate && isValidIp(candidate) && !isPrivateIp(candidate)) {
        return candidate;
      }
    }
    for (const ip of chain) {
      if (isValidIp(ip) && !isPrivateIp(ip)) return ip;
    }
    return null;
  }

  for (const ip of chain) {
    if (isValidIp(ip) && !isPrivateIp(ip)) return ip;
  }
  return null;
}

/**
 * Resolve the client IP behind reverse proxies (Nginx, Caddy, Cloudflare, etc.).
 * Set TRUST_PROXY=true when TLS terminates at a reverse proxy (X-Forwarded-For).
 */
export function getClientIpFromHeaders(headers: Headers): string {
  const direct = [
    headers.get("cf-connecting-ip"),
    headers.get("true-client-ip"),
    headers.get("x-real-ip"),
    headers.get("x-client-ip"),
  ];

  for (const value of direct) {
    if (!value) continue;
    const ip = value.trim();
    if (isValidIp(ip)) return ip;
  }

  const forwarded = parseForwardedFor(headers.get("forwarded"));
  if (forwarded) return forwarded;

  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const picked = pickFromXForwardedFor(xff);
    if (picked) return picked;
  }

  return "unknown";
}

export function getClientIp(request: Request): string {
  return getClientIpFromHeaders(request.headers);
}
