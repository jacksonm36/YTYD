export interface FormatPickerOption {
  formatId: string;
  type: "video" | "audio";
  label: string;
}

const YAYTD_PREFIX = "yaytd:";

/** Prefer fastest formats for default selection in the UI. */
export function pickDefaultVideoFormat(
  formats: FormatPickerOption[]
): FormatPickerOption | undefined {
  const videos = formats.filter((f) => f.type === "video");
  return (
    videos.find(
      (f) => f.label.startsWith("⚡") && f.label.includes("combined")
    ) ??
    videos.find(
      (f) => f.label.startsWith("⚡") && /480|720/.test(f.label)
    ) ??
    videos.find((f) => f.label.startsWith("⚡")) ??
    videos.find(
      (f) => f.formatId.startsWith(YAYTD_PREFIX) && f.label.includes("480")
    ) ??
    videos[0]
  );
}

export function pickDefaultAudioFormat(
  formats: FormatPickerOption[]
): FormatPickerOption | undefined {
  const audios = formats.filter((f) => f.type === "audio");
  return (
    audios.find((f) => f.label.startsWith("⚡")) ??
    audios.find((f) => f.formatId.includes(":m4a:")) ??
    audios.find((f) => f.formatId.includes(":aac:")) ??
    audios[0]
  );
}
