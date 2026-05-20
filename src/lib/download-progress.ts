export type JobPhase =
  | "queued"
  | "downloading"
  | "converting"
  | "merging"
  | "ready"
  | "failed"
  | "expired";

export interface ProgressUpdate {
  phase: JobPhase;
  progress: number;
  downloadProgress: number;
  convertProgress: number;
}

export function parseYtDlpProgressLine(line: string): Partial<ProgressUpdate> | null {
  const lower = line.toLowerCase();

  if (/\[merger\]|merging formats/i.test(line)) {
    return {
      phase: "merging",
      downloadProgress: 100,
      convertProgress: Math.max(50, extractPercent(line) ?? 90),
      progress: 92,
    };
  }

  if (
    /\[extractaudio\]|\[ffmpeg\].*extract|\[postconvert\]|converting|extracting audio/i.test(
      line
    )
  ) {
    const pct = extractPercent(line);
    const convertProgress = pct ?? undefined;
    return {
      phase: "converting",
      downloadProgress: 100,
      convertProgress: convertProgress ?? undefined,
      progress: convertProgress != null ? 80 + Math.round(convertProgress * 0.19) : 85,
    };
  }

  if (/\[download\]/i.test(line) || /\bdownload\b.*%/i.test(line)) {
    const pct = extractPercent(line);
    if (pct == null) return { phase: "downloading" };
    return {
      phase: "downloading",
      downloadProgress: pct,
      convertProgress: 0,
      progress: Math.min(80, Math.round(pct * 0.8)),
    };
  }

  const generic = extractPercent(line);
  if (generic != null && !/\[metadata\]/i.test(line)) {
    return {
      downloadProgress: generic,
      progress: Math.min(80, Math.round(generic * 0.8)),
    };
  }

  return null;
}

function extractPercent(line: string): number | null {
  const match = line.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) return null;
  return Math.min(100, Math.round(parseFloat(match[1])));
}

export function mergeProgress(
  current: ProgressUpdate,
  patch: Partial<ProgressUpdate>
): ProgressUpdate {
  return {
    phase: patch.phase ?? current.phase,
    progress: patch.progress ?? current.progress,
    downloadProgress: patch.downloadProgress ?? current.downloadProgress,
    convertProgress: patch.convertProgress ?? current.convertProgress,
  };
}

export const INITIAL_PROGRESS: ProgressUpdate = {
  phase: "queued",
  progress: 0,
  downloadProgress: 0,
  convertProgress: 0,
};
