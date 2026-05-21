import { spawn } from "child_process";
import { mkdir, readdir, stat } from "fs/promises";
import path from "path";
import { config } from "@/lib/config";
import { sanitizeFileName } from "@/lib/security";
import {
  detectPlatformFromUrl,
  getPlatformLabel,
  platformFromExtractor,
  type PlatformId,
} from "@/lib/supported-sites";
import {
  INITIAL_PROGRESS,
  mergeProgress,
  parseYtDlpProgressLine,
  type ProgressUpdate,
} from "@/lib/download-progress";
import type { ApiErrorCode } from "@/lib/security";
import { getYtDlpAntiBotArgs } from "@/lib/ytdlp-anti-bot";

export class YtDlpError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, detail: string) {
    super(detail);
    this.name = "YtDlpError";
    this.code = code;
  }
}

function classifyYtDlpStderr(stderr: string): ApiErrorCode {
  const s = stderr.toLowerCase();
  if (
    s.includes("sign in to confirm") ||
    s.includes("not a bot") ||
    s.includes("confirm you're not a bot") ||
    s.includes("cookies are no longer valid") ||
    s.includes("http error 403") ||
    (s.includes("403") && s.includes("forbidden")) ||
    (s.includes("tiktok") &&
      (s.includes("login") || s.includes("captcha") || s.includes("blocked")))
  ) {
    return "ytdlpBotCheck";
  }
  if (
    s.includes("video unavailable") ||
    s.includes("private video") ||
    s.includes("this video is private") ||
    s.includes("this content isn't available")
  ) {
    return "ytdlpVideoUnavailable";
  }
  return "ytdlpExtractFailed";
}

export interface FormatOption {
  formatId: string;
  type: "video" | "audio";
  label: string;
  ext: string;
  resolution?: string;
  filesize?: number;
}

export interface ProbeResult {
  title: string;
  thumbnail?: string;
  duration: number;
  formats: FormatOption[];
  platform: string;
  platformLabel: string;
  extractor?: string;
}

interface YtFormat {
  format_id: string;
  ext?: string;
  resolution?: string;
  height?: number;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  filesize_approx?: number;
  format_note?: string;
}

/** Harden yt-dlp network behavior (SSRF mitigation — not a full fix for DNS rebinding). */
const YTDLP_SAFE_PREFIX = [
  "--no-playlist",
  "--socket-timeout",
  "30",
  "--force-ipv4",
  "--no-config",
] as const;

function getYtDlpPerformanceArgs(includeProgress = false): string[] {
  const args = [
    "--retries",
    "3",
    "--fragment-retries",
    "3",
    "--no-mtime",
  ];
  if (includeProgress) args.push("--newline", "--progress");
  const frags = config.ytdlpConcurrentFragments;
  if (Number.isFinite(frags) && frags > 0) {
    args.push("--concurrent-fragments", String(Math.min(16, frags)));
  }
  return args;
}

function ffmpegCopyMergeArgs(): string[] {
  if (!config.ytdlpFfmpegCopyMerge) return [];
  return ["--postprocessor-args", "ffmpeg:-c copy -movflags +faststart"];
}

async function buildYtDlpArgv(
  userArgs: string[],
  includeProgress: boolean
): Promise<string[]> {
  const perf = getYtDlpPerformanceArgs(includeProgress);
  const antiBot = await getYtDlpAntiBotArgs();
  const skip = new Set([...YTDLP_SAFE_PREFIX, ...perf, ...antiBot]);
  return [
    ...YTDLP_SAFE_PREFIX,
    ...perf,
    ...antiBot,
    ...userArgs.filter((a) => !skip.has(a)),
  ];
}

function runYtDlp(args: string[], timeoutMs = 120000): Promise<string> {
  return buildYtDlpArgv(args, false).then((argv) =>
    new Promise((resolve, reject) => {
    const proc = spawn(config.ytdlpPath, argv, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("timeout"));
    }, timeoutMs);

    proc.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else {
        const detail = stderr || `yt-dlp exited ${code}`;
        reject(new YtDlpError(classifyYtDlpStderr(detail), detail));
      }
    });
    })
  );
}

/** Encoded preset ids: yaytd:v:{container}:{height} | yaytd:a:{codec}:{quality} */
export const YAYTD_FORMAT_PREFIX = "yaytd:";

const VIDEO_CONTAINERS = ["mp4", "mkv", "webm", "mov"] as const;
type VideoContainer = (typeof VIDEO_CONTAINERS)[number];

const AUDIO_CODECS = ["mp3", "m4a", "aac", "flac", "opus", "ogg", "wav"] as const;
type AudioCodec = (typeof AUDIO_CODECS)[number];

/** Most-used resolution + container combos (shown first). */
const POPULAR_VIDEO_HEIGHTS = [1080, 720, 480] as const;
const VIDEO_PRESET_HEIGHTS = [2160, 1440, 1080, 720, 480, 360, 240] as const;

const MP3_BITRATES = [
  { key: "best", label: "best quality" },
  { key: "320", label: "320 kbps" },
  { key: "192", label: "192 kbps" },
  { key: "128", label: "128 kbps" },
  { key: "96", label: "96 kbps" },
] as const;

export function encodeVideoPreset(
  container: VideoContainer,
  height: number
): string {
  return `${YAYTD_FORMAT_PREFIX}v:${container}:${height}`;
}

export function encodeAudioPreset(
  codec: AudioCodec,
  quality = "best"
): string {
  return `${YAYTD_FORMAT_PREFIX}a:${codec}:${quality}`;
}

function mergedVideoSelector(height: number, container: VideoContainer): string {
  if (container === "mp4") {
    return `bv*[height<=${height}][ext=mp4]+ba[ext=m4a]/bv*[height<=${height}]+ba/b[height<=${height}]`;
  }
  if (container === "webm") {
    return `bv*[height<=${height}][ext=webm]+ba[ext=webm]/bv*[height<=${height}]+ba/b`;
  }
  return `bv*[height<=${height}]+ba/b[height<=${height}]`;
}

function buildYtDlpFormatArgs(
  formatId: string,
  type: "video" | "audio"
): string[] {
  if (!formatId.startsWith(YAYTD_FORMAT_PREFIX)) {
    if (type === "audio") {
      const isMp3Preset =
        formatId === "bestaudio" ||
        formatId.startsWith("ba[") ||
        formatId.includes("ba*");
      if (isMp3Preset) {
        const args = [
          "-f",
          formatId === "bestaudio" ? "bestaudio" : formatId,
          "-x",
          "--audio-format",
          "mp3",
        ];
        if (formatId === "bestaudio") args.push("--audio-quality", "0");
        return args;
      }
      return ["-f", formatId];
    }
    const mergeExt = formatId.includes("webm")
      ? "webm"
      : formatId.includes("mkv")
        ? "mkv"
        : formatId.includes("mov")
          ? "mov"
          : "mp4";
    return [
      "-f",
      formatId,
      "--merge-output-format",
      mergeExt,
      ...ffmpegCopyMergeArgs(),
    ];
  }

  const parts = formatId.split(":");
  if (parts[1] === "v" && parts.length >= 4) {
    const container = parts[2] as VideoContainer;
    const height = Number(parts[3]);
    if (
      !VIDEO_CONTAINERS.includes(container) ||
      !Number.isFinite(height) ||
      height < 144 ||
      height > 8640
    ) {
      throw new Error("invalidFormat");
    }
    return [
      "-f",
      mergedVideoSelector(height, container),
      "--merge-output-format",
      container,
      ...ffmpegCopyMergeArgs(),
    ];
  }

  if (parts[1] === "a" && parts.length >= 3) {
    const codec = parts[2] as AudioCodec;
    const quality = parts[3] ?? "best";
    if (!AUDIO_CODECS.includes(codec)) {
      throw new Error("invalidFormat");
    }
    if (codec === "mp3") {
      const selector =
        quality === "best" ? "bestaudio" : `ba[abr<=${quality}]/ba/b`;
      const args = ["-f", selector, "-x", "--audio-format", "mp3"];
      if (quality === "best") args.push("--audio-quality", "0");
      return args;
    }
    if (codec === "m4a" || codec === "aac") {
      return ["-f", `ba[ext=${codec}]/bestaudio/b`];
    }
    const ytCodec = codec === "ogg" ? "vorbis" : codec;
    return [
      "-f",
      "bestaudio",
      "-x",
      "--audio-format",
      ytCodec,
      "--audio-quality",
      "0",
    ];
  }

  return ["-f", formatId];
}

function estimatePresetSize(
  formats: YtFormat[],
  height: number,
  ext: string
): number | undefined {
  const match = formats
    .filter(
      (f) =>
        f.vcodec &&
        f.vcodec !== "none" &&
        (f.height ?? 0) <= height &&
        (f.ext === ext || !ext)
    )
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
  return match?.filesize ?? match?.filesize_approx;
}

/** Single-file formats (video+audio combined) — no ffmpeg merge step. */
function pickProgressiveFormats(formats: YtFormat[]): FormatOption[] {
  const candidates = formats.filter(
    (f) =>
      f.format_id &&
      !f.format_id.includes("+") &&
      f.vcodec &&
      f.vcodec !== "none" &&
      f.acodec &&
      f.acodec !== "none" &&
      f.height &&
      f.height >= 144
  );

  const byHeight = new Map<number, YtFormat>();
  for (const f of candidates) {
    const h = f.height!;
    const prev = byHeight.get(h);
    const score =
      (f.ext === "mp4" ? 10 : 0) +
      (f.filesize ?? f.filesize_approx ?? 0) / 1e9;
    const prevScore = prev
      ? (prev.ext === "mp4" ? 10 : 0) +
        (prev.filesize ?? prev.filesize_approx ?? 0) / 1e9
      : -1;
    if (!prev || score > prevScore) byHeight.set(h, f);
  }

  return [...byHeight.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, f]) => {
      const res = f.resolution ?? `${f.height}p`;
      return {
        formatId: f.format_id,
        type: "video" as const,
        label: `⚡ ${res} combined (${f.ext ?? "mp4"}) — fastest`,
        ext: f.ext ?? "mp4",
        resolution: res,
        filesize: f.filesize ?? f.filesize_approx,
      };
    });
}

function pickStreamFormats(formats: YtFormat[]): FormatOption[] {
  const videoFormats = formats.filter(
    (f) =>
      f.vcodec &&
      f.vcodec !== "none" &&
      f.format_id &&
      !f.format_id.includes("+") &&
      f.height
  );

  const byHeight = new Map<number, YtFormat>();
  for (const f of videoFormats) {
    const h = f.height!;
    const prev = byHeight.get(h);
    if (!prev) {
      byHeight.set(h, f);
      continue;
    }
    const preferMp4 =
      (f.ext === "mp4" && prev.ext !== "mp4") ||
      ((f.filesize ?? f.filesize_approx ?? 0) >
        (prev.filesize ?? prev.filesize_approx ?? 0) &&
        f.ext === prev.ext);
    if (preferMp4) byHeight.set(h, f);
  }

  return [...byHeight.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, f]) => {
      const res = f.resolution ?? `${f.height}p`;
      return {
        formatId: f.format_id,
        type: "video" as const,
        label: `⚡ ${res} stream (${f.ext ?? "mp4"})`,
        ext: f.ext ?? "mp4",
        resolution: res,
        filesize: f.filesize ?? f.filesize_approx,
      };
    });
}

const CONTAINER_LABELS: Record<VideoContainer, string> = {
  mp4: "MP4 (H.264/AAC)",
  mkv: "MKV",
  webm: "WebM (VP9/Opus)",
  mov: "MOV (QuickTime)",
};

const AUDIO_LABELS: Record<AudioCodec, string> = {
  mp3: "MP3",
  m4a: "M4A (AAC)",
  aac: "AAC",
  flac: "FLAC (lossless)",
  opus: "Opus",
  ogg: "OGG (Vorbis)",
  wav: "WAV",
};

function buildVideoPresets(formats: YtFormat[]): FormatOption[] {
  const maxHeight = Math.max(
    0,
    ...formats
      .filter((f) => f.vcodec && f.vcodec !== "none")
      .map((f) => f.height ?? 0)
  );
  if (maxHeight === 0) return [];

  const options: FormatOption[] = [];
  const seen = new Set<string>();

  const add = (opt: FormatOption) => {
    if (seen.has(opt.formatId)) return;
    seen.add(opt.formatId);
    options.push(opt);
  };

  const addVideo = (container: VideoContainer, height: number) => {
    if (height > maxHeight + 120) return;
    const ext = container === "mov" ? "mov" : container;
    add({
      formatId: encodeVideoPreset(container, height),
      type: "video",
      label: `${height}p ${CONTAINER_LABELS[container]}`,
      ext,
      resolution: `${height}p`,
      filesize: estimatePresetSize(formats, height, ext === "mov" ? "mp4" : ext),
    });
  };

  // Fewer merge presets = faster probe UI; merging is slower than progressive/stream.
  for (const h of [720, 480] as const) {
    addVideo("mp4", h);
  }
  if (maxHeight >= 1080) addVideo("mp4", 1080);

  add({
    formatId: "bestvideo+bestaudio/best",
    type: "video",
    label: "Best quality (auto merge)",
    ext: "mp4",
    resolution: maxHeight ? `${maxHeight}p` : undefined,
  });

  return options;
}

function buildAudioPresets(formats: YtFormat[]): FormatOption[] {
  const audioOnly = formats.filter(
    (f) =>
      f.acodec &&
      f.acodec !== "none" &&
      (!f.vcodec || f.vcodec === "none") &&
      f.format_id
  );

  const best = audioOnly.sort(
    (a, b) =>
      (b.filesize ?? b.filesize_approx ?? 0) -
      (a.filesize ?? a.filesize_approx ?? 0)
  )[0];

  const options: FormatOption[] = [];

  if (best) {
    options.push({
      formatId: best.format_id,
      type: "audio",
      label: `⚡ Source (${best.ext ?? "m4a"}, no convert)`,
      ext: best.ext ?? "m4a",
      filesize: best.filesize ?? best.filesize_approx,
    });
  }

  for (const codec of ["m4a", "aac", "opus"] as const) {
    options.push({
      formatId: encodeAudioPreset(codec, "best"),
      type: "audio",
      label: AUDIO_LABELS[codec],
      ext: codec,
      filesize: best?.filesize ?? best?.filesize_approx,
    });
  }

  for (const { key, label } of MP3_BITRATES) {
    options.push({
      formatId: encodeAudioPreset("mp3", key),
      type: "audio",
      label: `${AUDIO_LABELS.mp3} (${label}, converts)`,
      ext: "mp3",
      filesize: key === "best" ? best?.filesize ?? best?.filesize_approx : undefined,
    });
  }

  for (const codec of ["flac", "ogg", "wav"] as const) {
    options.push({
      formatId: encodeAudioPreset(codec, "best"),
      type: "audio",
      label: AUDIO_LABELS[codec],
      ext: codec === "ogg" ? "ogg" : codec,
      filesize: best?.filesize ?? best?.filesize_approx,
    });
  }

  return options;
}

function normalizeFormats(info: {
  formats?: YtFormat[];
  duration?: number;
}): FormatOption[] {
  const formats = info.formats ?? [];
  const progressive = pickProgressiveFormats(formats);
  const streamFormats = pickStreamFormats(formats);
  const videoPresets = buildVideoPresets(formats);
  const audioPresets = buildAudioPresets(formats);

  const seen = new Set<string>();
  const merged: FormatOption[] = [];

  for (const opt of [
    ...progressive,
    ...streamFormats,
    ...videoPresets,
    ...audioPresets,
  ]) {
    const key = `${opt.type}:${opt.formatId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(opt);
  }

  return merged;
}

export async function probeUrl(url: string): Promise<ProbeResult> {
  const output = await runYtDlp(
    ["--dump-single-json", "--no-download", "--no-playlist", url],
    90000
  );

  const info = JSON.parse(output) as {
    title?: string;
    thumbnail?: string;
    duration?: number;
    formats?: YtFormat[];
    extractor?: string;
    extractor_key?: string;
  };

  const extractor = info.extractor_key ?? info.extractor;
  const fromUrl = detectPlatformFromUrl(url);
  const platformId: PlatformId = fromUrl?.id ?? platformFromExtractor(extractor);
  const platformLabel =
    fromUrl?.label ?? getPlatformLabel(platformId, "en");

  return {
    title: info.title ?? "Unknown",
    thumbnail: info.thumbnail,
    duration: info.duration ?? 0,
    formats: normalizeFormats(info),
    platform: platformId,
    platformLabel,
    extractor,
  };
}

export async function downloadMedia(params: {
  url: string;
  formatId: string;
  type: "video" | "audio";
  outputDir: string;
  title: string;
  jobId?: string;
  onProgress?: (update: ProgressUpdate) => void;
}): Promise<{ filePath: string; fileName: string; fileSize: number }> {
  await mkdir(params.outputDir, { recursive: true });

  const safeTitle = sanitizeFileName(params.title);
  const outputTemplate = path.join(params.outputDir, `${safeTitle}.%(ext)s`);

  const userArgs = [
    "--restrict-filenames",
    "-o",
    outputTemplate,
    ...buildYtDlpFormatArgs(params.formatId, params.type),
    params.url,
  ];

  const argv = await buildYtDlpArgv(userArgs, true);

  const { logServerEventAsync } = await import("@/lib/server-log");
  logServerEventAsync({
    source: "ytdlp",
    jobId: params.jobId,
    message: `Starting: ${config.ytdlpPath} ${argv.join(" ")}`,
    meta: { formatId: params.formatId, type: params.type },
  });

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(config.ytdlpPath, argv, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let state: ProgressUpdate = { ...INITIAL_PROGRESS, phase: "downloading" };

    const emit = (patch: Partial<ProgressUpdate>) => {
      state = mergeProgress(state, patch);
      params.onProgress?.(state);
    };

    const handleOutput = (chunk: Buffer, stream: "stdout" | "stderr") => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parsed = parseYtDlpProgressLine(trimmed);
        if (parsed) {
          emit(parsed);
        } else if (
          /\[Merger\]|\[ffmpeg\]|ERROR|WARNING/i.test(trimmed) &&
          !/\[download\]/i.test(trimmed)
        ) {
          logServerEventAsync({
            source: "ytdlp",
            jobId: params.jobId,
            level: /error/i.test(trimmed) ? "error" : "info",
            message: trimmed.slice(0, 500),
            meta: { stream },
          });
        }
      }
    };

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("timeout"));
    }, config.ytdlpTimeoutMs);

    proc.stdout.on("data", (d) => handleOutput(d, "stdout"));
    proc.stderr.on("data", (d) => handleOutput(d, "stderr"));

    emit({ phase: "downloading", downloadProgress: 0, convertProgress: 0, progress: 0 });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        logServerEventAsync({
          source: "ytdlp",
          jobId: params.jobId,
          message: "yt-dlp finished successfully",
        });
        emit({
          phase: "ready",
          progress: 100,
          downloadProgress: 100,
          convertProgress: 100,
        });
        resolve();
      } else {
        logServerEventAsync({
          source: "ytdlp",
          jobId: params.jobId,
          level: "error",
          message: `yt-dlp exited with code ${code}`,
        });
        reject(new Error(`yt-dlp failed with code ${code}`));
      }
    });
  });

  const files = await readdir(params.outputDir);
  const mediaFiles = (
    await Promise.all(
      files.map(async (f) => {
        const fp = path.join(params.outputDir, f);
        const s = await stat(fp);
        return { fp, f, mtime: s.mtimeMs, size: s.size };
      })
    )
  ).sort((a, b) => b.mtime - a.mtime);

  const latest = mediaFiles[0];
  if (!latest) throw new Error("No output file");

  if (latest.size > config.maxOutputBytes) {
    throw new Error("fileTooLarge");
  }

  return {
    filePath: latest.fp,
    fileName: latest.f,
    fileSize: latest.size,
  };
}
