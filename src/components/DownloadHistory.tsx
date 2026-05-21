"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { ApiClientError, apiGet, triggerSecureDownload } from "@/lib/api-client";
import { ProgressBars } from "./ProgressBars";

export interface HistoryJob {
  id: string;
  title: string | null;
  url: string;
  type: string;
  formatLabel: string | null;
  status: string;
  phase: string;
  progress: number;
  downloadProgress: number;
  convertProgress: number;
  errorCode: string | null;
  fileName: string | null;
  fileSize: string | null;
  createdAt: string;
  completedAt: string | null;
  canDownload: boolean;
}

function statusLabel(
  status: string,
  t: (key: string) => string
): string {
  const labels: Record<string, string> = {
    queued: "status_queued",
    running: "status_running",
    ready: "status_ready",
    delivered: "status_delivered",
    failed: "status_failed",
    expired: "status_expired",
  };
  const key = labels[status];
  return key ? t(key) : status;
}

function formatBytes(size: string | null, locale: string): string {
  if (!size) return "—";
  const bytes = Number(size);
  if (Number.isNaN(bytes)) return "—";
  const units =
    locale === "hu"
      ? ["B", "KB", "MB", "GB"]
      : ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

export function DownloadHistory({ initialJobs }: { initialJobs: HistoryJob[] }) {
  const t = useTranslations("download");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const [jobs, setJobs] = useState(initialJobs);

  const fetchHistory = useCallback(async () => {
    try {
      const data = await apiGet<{ jobs: HistoryJob[] }>(
        "/api/download/history?limit=50"
      );
      setJobs(data.jobs);
    } catch {
      /* ignore — 401 redirects via api-client */
    }
  }, []);

  const handleDownload = (jobId: string) => {
    void triggerSecureDownload(jobId).catch((err) => {
      console.error(
        err instanceof ApiClientError ? err.code : "download failed"
      );
    });
  };

  useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  useEffect(() => {
    const hasActive = jobs.some(
      (j) => j.status === "queued" || j.status === "running"
    );
    if (!hasActive) return;
    void fetchHistory();
    const interval = setInterval(() => void fetchHistory(), 3000);
    return () => clearInterval(interval);
  }, [jobs, fetchHistory]);

  if (jobs.length === 0) {
    return <p className="text-[var(--muted)]">{t("historyEmpty")}</p>;
  }

  return (
    <ul className="space-y-4">
      {jobs.map((job) => {
        const isActive = job.status === "queued" || job.status === "running";
        const showConvert =
          job.type === "audio" ||
          job.phase === "converting" ||
          job.phase === "merging" ||
          job.convertProgress > 0;

        return (
          <li
            key={job.id}
            className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] space-y-3"
          >
            <div className="flex flex-wrap justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{job.title ?? job.url}</p>
                <p className="text-xs text-[var(--muted)] mt-1 truncate">
                  {job.url}
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="text-xs px-2 py-0.5 rounded bg-[var(--border)]">
                    {job.type === "audio" ? t("audio") : t("video")}
                  </span>
                  {job.formatLabel && (
                    <span className="text-xs px-2 py-0.5 rounded bg-[var(--border)] text-[var(--muted)]">
                      {job.formatLabel}
                    </span>
                  )}
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      job.status === "ready" || job.status === "delivered"
                        ? "bg-green-900/50 text-green-300"
                        : job.status === "failed"
                          ? "bg-red-900/50 text-red-300"
                          : isActive
                            ? "bg-blue-900/50 text-blue-300"
                            : "bg-[var(--border)] text-[var(--muted)]"
                    }`}
                  >
                    {statusLabel(job.status, t)}
                  </span>
                </div>
              </div>
              <div className="text-right text-xs text-[var(--muted)] shrink-0">
                <p>
                  {new Intl.DateTimeFormat(locale === "hu" ? "hu-HU" : "en-US", {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(job.createdAt))}
                </p>
                {job.fileSize && (
                  <p className="mt-1">{formatBytes(job.fileSize, locale)}</p>
                )}
              </div>
            </div>

            {isActive && (
              <ProgressBars
                phase={job.phase}
                status={job.status}
                progress={job.progress}
                downloadProgress={job.downloadProgress}
                convertProgress={job.convertProgress}
                showConvert={showConvert}
              />
            )}

            {job.status === "failed" && job.errorCode && (
              <p className="text-red-400 text-sm">
                {tErrors(job.errorCode)}
              </p>
            )}

            {job.canDownload && (
              <button
                type="button"
                onClick={() => handleDownload(job.id)}
                className="inline-block w-full sm:w-auto text-center px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:opacity-90"
              >
                {t("downloadToDevice")}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
