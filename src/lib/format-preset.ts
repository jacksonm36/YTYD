import {
  pickDefaultAudioFormat,
  pickDefaultVideoFormat,
  type FormatPickerOption,
} from "@/lib/format-defaults";

export type FormatLike = FormatPickerOption & { ext?: string };

export type MediaType = "video" | "audio";

export type FormatPresetId =
  | "video_fast"
  | "video_720"
  | "video_best"
  | "audio_best"
  | "audio_mp3"
  | "audio_m4a"
  | "custom";

export function resolveFormatFromPreset(
  formats: FormatLike[],
  type: MediaType,
  preset: FormatPresetId,
  customFormatId?: string
): FormatLike | undefined {
  if (preset === "custom" && customFormatId) {
    return formats.find(
      (f) => f.formatId === customFormatId && f.type === type
    );
  }

  const ofType = formats.filter((f) => f.type === type);

  if (type === "video") {
    switch (preset) {
      case "video_fast":
        return (
          ofType.find((f) => f.label.includes("combined")) ??
          pickDefaultVideoFormat(formats)
        );
      case "video_720":
        return (
          ofType.find((f) => /720/.test(f.label)) ??
          ofType.find((f) => /480/.test(f.label)) ??
          pickDefaultVideoFormat(formats)
        );
      case "video_best":
        return ofType[0] ?? pickDefaultVideoFormat(formats);
      default:
        return pickDefaultVideoFormat(formats);
    }
  }

  switch (preset) {
    case "audio_mp3":
      return (
        ofType.find((f) => /mp3/i.test(f.label) || f.formatId.includes(":mp3:")) ??
        pickDefaultAudioFormat(formats)
      );
    case "audio_m4a":
      return (
        ofType.find((f) => /m4a/i.test(f.label) || f.formatId.includes(":m4a:")) ??
        pickDefaultAudioFormat(formats)
      );
    case "audio_best":
    default:
      return pickDefaultAudioFormat(formats);
  }
}
