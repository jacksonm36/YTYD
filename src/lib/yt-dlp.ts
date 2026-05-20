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
  "--no-progress",
] as const;

function runYtDlp(args: string[], timeoutMs = 120000): Promise<string> {
  const skip = new Set<string>(YTDLP_SAFE_PREFIX);
  const argv = [...YTDLP_SAFE_PREFIX, ...args.filter((a) => !skip.has(a))];
  return new Promise((resolve, reject) => {
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
      else reject(new Error(stderr || `yt-dlp exited ${code}`));
    });
  });
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
    return ["-f", formatId, "--merge-output-format", mergeExt];
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
        label: `${res} stream (${f.ext ?? "mp4"})`,
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

  for (const h of POPULAR_VIDEO_HEIGHTS) {
    for (const container of VIDEO_CONTAINERS) {
      addVideo(container, h);
    }
  }

  for (const h of VIDEO_PRESET_HEIGHTS) {
    addVideo("mp4", h);
  }

  for (const h of [2160, 1440, 1080, 720, 480, 360] as const) {
    addVideo("mkv", h);
  }

  for (const h of [2160, 1440, 1080, 720, 480] as const) {
    addVideo("webm", h);
  }

  for (const h of [1080, 720] as const) {
    addVideo("mov", h);
  }

  add({
    formatId: "bestvideo+bestaudio/best",
    type: "video",
    label: "Best quality (auto)",
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

  for (const { key, label } of MP3_BITRATES) {
    options.push({
      formatId: encodeAudioPreset("mp3", key),
      type: "audio",
      label: `${AUDIO_LABELS.mp3} (${label})`,
      ext: "mp3",
      filesize: key === "best" ? best?.filesize ?? best?.filesize_approx : undefined,
    });
  }

  for (const codec of ["m4a", "aac", "opus", "flac", "ogg", "wav"] as const) {
    options.push({
      formatId: encodeAudioPreset(codec, "best"),
      type: "audio",
      label: AUDIO_LABELS[codec],
      ext: codec === "ogg" ? "ogg" : codec,
      filesize: best?.filesize ?? best?.filesize_approx,
    });
  }

  if (best) {
    options.push({
      formatId: best.format_id,
      type: "audio",
      label: `Source stream (${best.ext ?? "m4a"}, no convert)`,
      ext: best.ext ?? "m4a",
      filesize: best.filesize ?? best.filesize_approx,
    });
  }

  return options;
}

function normalizeFormats(info: {
  formats?: YtFormat[];
  duration?: number;
}): FormatOption[] {
  const formats = info.formats ?? [];
  const videoPresets = buildVideoPresets(formats);
  const streamFormats = pickStreamFormats(formats);
  const audioPresets = buildAudioPresets(formats);

  const seen = new Set<string>();
  const merged: FormatOption[] = [];

  for (const opt of [...videoPresets, ...streamFormats, ...audioPresets]) {
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
  onProgress?: (update: ProgressUpdate) => void;
}): Promise<{ filePath: string; fileName: string; fileSize: number }> {
  await mkdir(params.outputDir, { recursive: true });

  const safeTitle = sanitizeFileName(params.title);
  const outputTemplate = path.join(params.outputDir, `${safeTitle}.%(ext)s`);

  const args = [
    "--restrict-filenames",
    "-o",
    outputTemplate,
    "--newline",
    "--progress",
  ];

  args.push(...buildYtDlpFormatArgs(params.formatId, params.type));

  args.push(params.url);

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(config.ytdlpPath, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let state: ProgressUpdate = { ...INITIAL_PROGRESS, phase: "downloading" };

    const emit = (patch: Partial<ProgressUpdate>) => {
      state = mergeProgress(state, patch);
      params.onProgress?.(state);
    };

    const handleOutput = (chunk: Buffer) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        if (!line.trim()) continue;
        const parsed = parseYtDlpProgressLine(line);
        if (parsed) emit(parsed);
      }
    };

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("timeout"));
    }, config.ytdlpTimeoutMs);

    proc.stdout.on("data", handleOutput);
    proc.stderr.on("data", handleOutput);

    emit({ phase: "downloading", downloadProgress: 0, convertProgress: 0, progress: 0 });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        emit({
          phase: "ready",
          progress: 100,
          downloadProgress: 100,
          convertProgress: 100,
        });
        resolve();
      } else reject(new Error(`yt-dlp failed with code ${code}`));
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
