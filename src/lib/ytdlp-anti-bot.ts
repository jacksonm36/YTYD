import { access } from "fs/promises";
import path from "path";
import { config } from "@/lib/config";

/**
 * yt-dlp flags that reduce bot-check / 403 errors on YouTube, TikTok, etc.
 * @see docs/YTDLP_ANTI_BOT.md
 */

const DEFAULT_YOUTUBE_CLIENTS =
  "youtube:player_client=android_vr,web_safari,tv_embedded";

let cookiesPathCache: string | null | undefined;

async function resolveCookiesPath(): Promise<string | null> {
  if (cookiesPathCache !== undefined) return cookiesPathCache;
  const raw = config.ytdlpCookiesFile.trim();
  if (!raw) {
    cookiesPathCache = null;
    return null;
  }
  const resolved = path.isAbsolute(raw)
    ? path.normalize(raw)
    : path.normalize(path.join(process.cwd(), raw));
  if (resolved.includes("..")) {
    cookiesPathCache = null;
    return null;
  }
  try {
    await access(resolved);
    cookiesPathCache = resolved;
    return resolved;
  } catch {
    cookiesPathCache = null;
    return null;
  }
}

function parseJsRuntimes(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (!t) continue;
    if (t.includes(":")) {
      out.push(t);
      continue;
    }
    out.push(t);
  }
  return out;
}

function parseRemoteComponents(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildExtractorArgs(): string[] {
  const parts: string[] = [];
  const custom = config.ytdlpExtractorArgs.trim();
  if (custom) {
    parts.push(custom);
  } else if (config.ytdlpDefaultYoutubeClients) {
    parts.push(DEFAULT_YOUTUBE_CLIENTS);
  }

  const po = config.ytdlpYoutubePoToken.trim();
  if (po) {
    const poArg = po.includes("=") ? po : `mweb.gvs+${po}`;
    const existing = parts.find((p) => p.startsWith("youtube:"));
    if (existing) {
      parts[parts.indexOf(existing)] = `${existing},po_token=${poArg}`;
    } else {
      parts.push(`youtube:po_token=${poArg}`);
    }
  }

  if (parts.length === 0) return [];
  return ["--extractor-args", parts.join(";")];
}

/** Synchronous anti-bot argv (cookies path must be pre-resolved). */
export function getYtDlpAntiBotArgsSync(cookiesPath: string | null): string[] {
  const args: string[] = [];

  if (cookiesPath) {
    args.push("--cookies", cookiesPath);
  }

  const runtimes = parseJsRuntimes(config.ytdlpJsRuntimes);
  for (const rt of runtimes) {
    args.push("--js-runtimes", rt);
  }

  const remote = parseRemoteComponents(config.ytdlpRemoteComponents);
  for (const component of remote) {
    args.push("--remote-components", component);
  }

  if (config.ytdlpUserAgent) {
    args.push("--user-agent", config.ytdlpUserAgent);
  }

  const sleep = config.ytdlpSleepRequests;
  if (Number.isFinite(sleep) && sleep > 0) {
    args.push("--sleep-requests", String(sleep));
  }

  args.push(...buildExtractorArgs());
  return args;
}

let antiBotArgsCache: string[] | null = null;

/** Resolved once per process; call invalidateYtDlpAntiBotCache() after env/cookie changes. */
export async function getYtDlpAntiBotArgs(): Promise<string[]> {
  if (antiBotArgsCache) return antiBotArgsCache;
  const cookiesPath = await resolveCookiesPath();
  antiBotArgsCache = getYtDlpAntiBotArgsSync(cookiesPath);
  return antiBotArgsCache;
}

export function invalidateYtDlpAntiBotCache(): void {
  antiBotArgsCache = null;
  cookiesPathCache = undefined;
}

/** Summary for admin logs / worker startup (no secrets). */
export async function getYtDlpAntiBotStatus(): Promise<Record<string, unknown>> {
  const cookiesPath = await resolveCookiesPath();
  return {
    cookies: cookiesPath ? "configured" : "none",
    jsRuntimes: parseJsRuntimes(config.ytdlpJsRuntimes),
    remoteComponents: parseRemoteComponents(config.ytdlpRemoteComponents),
    youtubeClients: config.ytdlpExtractorArgs.trim() || DEFAULT_YOUTUBE_CLIENTS,
    poToken: config.ytdlpYoutubePoToken.trim() ? "configured" : "none",
    sleepRequests: config.ytdlpSleepRequests,
  };
}
