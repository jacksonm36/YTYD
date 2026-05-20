/**
 * Hostnames allowed for download (yt-dlp extractors).
 * SSRF checks still apply in validatePublicUrl.
 */
export type PlatformId =
  | "youtube"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "twitter"
  | "vimeo"
  | "reddit"
  | "twitch"
  | "dailymotion"
  | "pinterest"
  | "linkedin"
  | "soundcloud"
  | "other";

export type PlatformInfo = {
  id: PlatformId;
  label: string;
  hosts: string[];
};

export const SUPPORTED_PLATFORMS: PlatformInfo[] = [
  {
    id: "youtube",
    label: "YouTube",
    hosts: [
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "music.youtube.com",
      "youtu.be",
    ],
  },
  {
    id: "facebook",
    label: "Facebook",
    hosts: ["facebook.com", "www.facebook.com", "m.facebook.com", "fb.watch", "fb.com"],
  },
  {
    id: "instagram",
    label: "Instagram",
    hosts: ["instagram.com", "www.instagram.com"],
  },
  {
    id: "tiktok",
    label: "TikTok",
    hosts: ["tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"],
  },
  {
    id: "twitter",
    label: "X (Twitter)",
    hosts: ["twitter.com", "www.twitter.com", "mobile.twitter.com", "x.com", "www.x.com"],
  },
  {
    id: "vimeo",
    label: "Vimeo",
    hosts: ["vimeo.com", "www.vimeo.com", "player.vimeo.com"],
  },
  {
    id: "reddit",
    label: "Reddit",
    hosts: ["reddit.com", "www.reddit.com", "old.reddit.com", "v.redd.it"],
  },
  {
    id: "twitch",
    label: "Twitch",
    hosts: ["twitch.tv", "www.twitch.tv", "clips.twitch.tv", "m.twitch.tv"],
  },
  {
    id: "dailymotion",
    label: "Dailymotion",
    hosts: ["dailymotion.com", "www.dailymotion.com"],
  },
  {
    id: "pinterest",
    label: "Pinterest",
    hosts: ["pinterest.com", "www.pinterest.com", "pin.it"],
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    hosts: ["linkedin.com", "www.linkedin.com"],
  },
  {
    id: "soundcloud",
    label: "SoundCloud",
    hosts: ["soundcloud.com", "www.soundcloud.com"],
  },
];

const HOST_TO_PLATFORM = new Map<string, PlatformInfo>();

for (const platform of SUPPORTED_PLATFORMS) {
  for (const host of platform.hosts) {
    HOST_TO_PLATFORM.set(host, platform);
  }
}

export function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "");
}

export function detectPlatformFromHostname(hostname: string): PlatformInfo | null {
  const host = normalizeHostname(hostname);
  if (HOST_TO_PLATFORM.has(host)) {
    return HOST_TO_PLATFORM.get(host)!;
  }
  if (host.endsWith(".youtube.com") || host.endsWith(".youtu.be")) {
    return HOST_TO_PLATFORM.get("youtube.com") ?? SUPPORTED_PLATFORMS[0];
  }
  if (host.endsWith(".facebook.com") || host.endsWith(".fb.com")) {
    return HOST_TO_PLATFORM.get("facebook.com")!;
  }
  if (host.endsWith(".instagram.com")) {
    return HOST_TO_PLATFORM.get("instagram.com")!;
  }
  if (host.endsWith(".tiktok.com")) {
    return HOST_TO_PLATFORM.get("tiktok.com")!;
  }
  return null;
}

export function detectPlatformFromUrl(url: string): PlatformInfo | null {
  try {
    return detectPlatformFromHostname(new URL(url).hostname);
  } catch {
    return null;
  }
}

export function isSupportedMediaHost(hostname: string): boolean {
  return detectPlatformFromHostname(hostname) !== null;
}

/** Map yt-dlp extractor key to our platform id */
export function platformFromExtractor(extractor?: string): PlatformId {
  if (!extractor) return "other";
  const key = extractor.toLowerCase();
  if (key.includes("youtube")) return "youtube";
  if (key.includes("facebook")) return "facebook";
  if (key.includes("instagram")) return "instagram";
  if (key.includes("tiktok")) return "tiktok";
  if (key.includes("twitter") || key === "x") return "twitter";
  if (key.includes("vimeo")) return "vimeo";
  if (key.includes("reddit")) return "reddit";
  if (key.includes("twitch")) return "twitch";
  if (key.includes("dailymotion")) return "dailymotion";
  if (key.includes("pinterest")) return "pinterest";
  if (key.includes("linkedin")) return "linkedin";
  if (key.includes("soundcloud")) return "soundcloud";
  return "other";
}

export function getPlatformLabel(id: PlatformId, locale: string): string {
  const found = SUPPORTED_PLATFORMS.find((p) => p.id === id);
  if (found) return found.label;
  return locale === "hu" ? "Egyéb" : "Other";
}
