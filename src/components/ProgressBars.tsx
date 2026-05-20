"use client";

import { useTranslations } from "next-intl";

interface ProgressBarsProps {
  phase: string;
  status: string;
  progress: number;
  downloadProgress: number;
  convertProgress: number;
  showConvert?: boolean;
}

export function ProgressBars({
  phase,
  status,
  progress,
  downloadProgress,
  convertProgress,
  showConvert = true,
}: ProgressBarsProps) {
  const t = useTranslations("download");

  const isActive = status === "running" || status === "queued";
  const showDownloadBar =
    isActive || phase === "downloading" || downloadProgress > 0 || status === "ready";
  const showConvertBar =
    showConvert &&
    (phase === "converting" ||
      phase === "merging" ||
      convertProgress > 0 ||
      (status === "ready" && showConvert));

  const convertIndeterminate =
    (phase === "converting" || phase === "merging") && convertProgress === 0;

  const phaseLabel = () => {
    if (status === "queued" || phase === "queued") return t("jobQueued");
    if (phase === "downloading") return t("phaseDownloading");
    if (phase === "converting") return t("phaseConverting");
    if (phase === "merging") return t("phaseMerging");
    if (status === "ready" || phase === "ready") return t("ready");
    if (status === "failed") return t("failed");
    if (status === "expired" || phase === "expired") return t("expired");
    return t("jobRunning");
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center text-sm">
        <span className="font-medium">{t("progress")}</span>
        <span className="text-[var(--muted)]">{phaseLabel()}</span>
      </div>

      {showDownloadBar && (
        <ProgressRow
          label={t("progressDownload")}
          value={status === "ready" ? 100 : downloadProgress}
          indeterminate={status === "queued"}
          accent="bg-[var(--accent)]"
        />
      )}

      {showConvertBar && (
        <ProgressRow
          label={t("progressConvert")}
          value={status === "ready" ? 100 : convertProgress}
          indeterminate={convertIndeterminate}
          accent="bg-emerald-500"
        />
      )}

      <div className="flex justify-between text-xs text-[var(--muted)]">
        <span>{t("overallProgress")}</span>
        <span>{progress}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-[var(--border)] overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[var(--accent)] to-emerald-500 transition-all duration-300 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}

function ProgressRow({
  label,
  value,
  indeterminate,
  accent,
}: {
  label: string;
  value: number;
  indeterminate?: boolean;
  accent: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-[var(--muted)]">{label}</span>
        <span className="text-[var(--foreground)]">
          {indeterminate ? "…" : `${value}%`}
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden">
        {indeterminate ? (
          <div
            className={`h-full w-1/3 ${accent} rounded-full`}
            style={{ animation: "indeterminate 1.2s ease-in-out infinite" }}
          />
        ) : (
          <div
            className={`h-full ${accent} transition-all duration-300 ease-out`}
            style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
            role="progressbar"
            aria-valuenow={value}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        )}
      </div>
    </div>
  );
}
