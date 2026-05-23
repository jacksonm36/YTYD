"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  ApiClientError,
  apiDelete,
  apiGet,
  apiPost,
  triggerSecureDownload,
} from "@/lib/api-client";
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

function canRedownload(status: string): boolean {
  return ["ready", "delivered", "failed", "expired"].includes(status);
}

export function DownloadHistory({ initialJobs }: { initialJobs: HistoryJob[] }) {
  const t = useTranslations("download");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const [jobs, setJobs] = useState(initialJobs);
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

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

  const handleDelete = async (jobId: string) => {
    if (!confirm(t("historyDeleteConfirm"))) return;
    setBusy(jobId);
    try {
      await apiDelete(`/api/download/${jobId}`);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    } catch (err) {
      console.error(err instanceof ApiClientError ? err.code : "delete failed");
    } finally {
      setBusy(null);
    }
  };

  const handleRedownload = async (jobId: string) => {
    setBusy(jobId);
    try {
      await apiPost(`/api/download/${jobId}/redownload`, {});
      await fetchHistory();
    } catch (err) {
      const code = err instanceof ApiClientError ? err.code : "generic";
      alert(tErrors(code));
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm(t("historyDeleteAllConfirm"))) return;
    setBulkBusy(true);
    try {
      await apiDelete("/api/download/history");
      setJobs([]);
    } catch (err) {
      console.error(err instanceof ApiClientError ? err.code : "delete all failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const handleRedownloadAll = async () => {
    if (!confirm(t("historyRedownloadAllConfirm"))) return;
    setBulkBusy(true);
    try {
      const data = await apiPost<{
        queued: number;
        errors: { id: string; code: string }[];
      }>("/api/download/history", { all: true });
      await fetchHistory();
      if (data.queued === 0 && data.errors.length === 0) {
        alert(t("historyNothingToRedownload"));
      }
    } catch (err) {
      const code = err instanceof ApiClientError ? err.code : "generic";
      alert(tErrors(code));
    } finally {
      setBulkBusy(false);
    }
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

  const hasRedownloadable = jobs.some((j) => canRedownload(j.status));
  const toolbarDisabled = bulkBusy || busy !== null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={toolbarDisabled}
          onClick={() => void handleRedownloadAll()}
          className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm font-medium hover:bg-[var(--border)] disabled:opacity-50"
        >
          {t("historyRedownloadAll")}
        </button>
        <button
          type="button"
          disabled={toolbarDisabled}
          onClick={() => void handleDeleteAll()}
          className="px-4 py-2 rounded-lg border border-red-800/60 text-red-300 text-sm font-medium hover:bg-red-950/40 disabled:opacity-50"
        >
          {t("historyDeleteAll")}
        </button>
      </div>

      <ul className="space-y-4">
        {jobs.map((job) => {
          const isActive = job.status === "queued" || job.status === "running";
          const showConvert =
            job.type === "audio" ||
            job.phase === "converting" ||
            job.phase === "merging" ||
            job.convertProgress > 0;
          const rowBusy = busy === job.id || bulkBusy;

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

              <div className="flex flex-wrap gap-2">
                {job.canDownload && (
                  <button
                    type="button"
                    disabled={rowBusy}
                    onClick={() => handleDownload(job.id)}
                    className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {t("downloadToDevice")}
                  </button>
                )}
                {canRedownload(job.status) && (
                  <button
                    type="button"
                    disabled={rowBusy}
                    onClick={() => void handleRedownload(job.id)}
                    className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm font-medium hover:bg-[var(--border)] disabled:opacity-50"
                  >
                    {t("historyRedownload")}
                  </button>
                )}
                <button
                  type="button"
                  disabled={rowBusy}
                  onClick={() => void handleDelete(job.id)}
                  className="px-4 py-2 rounded-lg border border-red-800/60 text-red-300 text-sm font-medium hover:bg-red-950/40 disabled:opacity-50"
                >
                  {t("historyDelete")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
