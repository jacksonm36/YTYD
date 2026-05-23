"use client";

import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import type { FormatPresetId, MediaType } from "@/lib/format-preset";

export interface FormatOption {
  formatId: string;
  type: MediaType;
  label: string;
  ext: string;
  resolution?: string;
  filesize?: number;
}

function formatBytes(bytes?: number, locale = "hu"): string {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `~${v.toFixed(1)} ${units[i]}`;
}

const VIDEO_PRESETS: FormatPresetId[] = [
  "video_fast",
  "video_720",
  "video_best",
];

const AUDIO_PRESETS: FormatPresetId[] = [
  "audio_best",
  "audio_mp3",
  "audio_m4a",
];

type Props = {
  formats: FormatOption[];
  mediaType: MediaType;
  onMediaTypeChange: (type: MediaType) => void;
  preset: FormatPresetId;
  onPresetChange: (preset: FormatPresetId) => void;
  selectedFormatId: string;
  onFormatIdChange: (formatId: string, type: MediaType) => void;
  showDetailedList?: boolean;
  disabled?: boolean;
};

export function FormatSelector({
  formats,
  mediaType,
  onMediaTypeChange,
  preset,
  onPresetChange,
  selectedFormatId,
  onFormatIdChange,
  showDetailedList = true,
  disabled = false,
}: Props) {
  const t = useTranslations("download");
  const locale = useLocale();

  const filteredFormats = formats.filter((f) => f.type === mediaType);
  const activePresets = mediaType === "video" ? VIDEO_PRESETS : AUDIO_PRESETS;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/60 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-wide uppercase text-[var(--muted)]">
          {t("formatSelectorTitle")}
        </h3>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onMediaTypeChange("video")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mediaType === "video"
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--border)] hover:border-[var(--muted)]"
            }`}
          >
            {t("video")}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onMediaTypeChange("audio")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mediaType === "audio"
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--border)] hover:border-[var(--muted)]"
            }`}
          >
            {t("audio")}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-[var(--muted)]">{t("formatPresetHint")}</p>
        <div className="flex flex-wrap gap-2">
          {activePresets.map((id) => (
            <button
              key={id}
              type="button"
              disabled={disabled}
              onClick={() => onPresetChange(id)}
              className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                preset === id
                  ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--foreground)]"
                  : "border-[var(--border)] hover:border-[var(--muted)]"
              }`}
            >
              {t(`preset_${id}`)}
            </button>
          ))}
          {showDetailedList && filteredFormats.length > 0 && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPresetChange("custom")}
              className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                preset === "custom"
                  ? "border-[var(--accent)] bg-[var(--accent)]/15"
                  : "border-[var(--border)] hover:border-[var(--muted)]"
              }`}
            >
              {t("preset_custom")}
            </button>
          )}
        </div>
      </div>

      {showDetailedList && preset === "custom" && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("selectFormat")}</p>
          {filteredFormats.length === 0 ? (
            <p className="text-[var(--muted)] text-sm">{t("noFormats")}</p>
          ) : (
            <div className="grid gap-2 max-h-56 overflow-y-auto pr-1">
              {filteredFormats.map((f) => (
                <label
                  key={`${f.type}-${f.formatId}`}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedFormatId === f.formatId
                      ? "border-[var(--accent)] bg-[var(--accent)]/10"
                      : "border-[var(--border)] hover:border-[var(--muted)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="format-detail"
                    disabled={disabled}
                    checked={selectedFormatId === f.formatId}
                    onChange={() => {
                      onFormatIdChange(f.formatId, f.type);
                      onPresetChange("custom");
                    }}
                    className="accent-[var(--accent)]"
                  />
                  <span className="flex-1 text-sm">{f.label}</span>
                  <span className="text-xs text-[var(--muted)]">
                    {formatBytes(f.filesize, locale)}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
