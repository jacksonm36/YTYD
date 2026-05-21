"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiGet } from "@/lib/api-client";

interface ActiveJob {
  id: string;
  status: string;
  phase: string;
  progress: number;
  downloadProgress: number;
  convertProgress: number;
  title: string | null;
  formatLabel: string | null;
  url: string;
  user: string;
  runningForMs: number;
  updatedAt: string;
}

interface SystemLogEntry {
  id: string;
  level: string;
  source: string;
  jobId: string | null;
  message: string;
  createdAt: string;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export function AdminServerMonitor() {
  const t = useTranslations("admin");
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [filterJobId, setFilterJobId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [jobsRes, logsRes] = await Promise.all([
      apiGet<{ jobs: ActiveJob[] }>("/api/admin/jobs"),
      apiGet<{ logs: SystemLogEntry[] }>(
        `/api/admin/system-logs?limit=200${filterJobId ? `&jobId=${encodeURIComponent(filterJobId)}` : ""}`
      ),
    ]);
    setJobs(jobsRes.jobs);
    setLogs(logsRes.logs);
  }, [filterJobId]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 4000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--muted)]">{t("serverMonitorHint")}</p>

      <div>
        <h3 className="text-sm font-medium mb-2">{t("activeJobs")}</h3>
        {jobs.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">{t("noActiveJobs")}</p>
        ) : (
          <ul className="space-y-2">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="p-3 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium truncate">
                    {job.title ?? job.url}
                  </span>
                  <span className="text-[var(--muted)]">
                    {job.status} / {job.phase} — {formatDuration(job.runningForMs)}
                  </span>
                </div>
                <p className="text-xs text-[var(--muted)] mt-1">
                  {job.user} · {job.formatLabel ?? "—"} · {job.progress}% (dl{" "}
                  {job.downloadProgress}% / conv {job.convertProgress}%)
                </p>
                <button
                  type="button"
                  className="text-xs text-[var(--accent)] mt-2 hover:underline"
                  onClick={() =>
                    setFilterJobId(filterJobId === job.id ? null : job.id)
                  }
                >
                  {filterJobId === job.id ? t("clearLogFilter") : t("filterLogs")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-medium">{t("serverLogs")}</h3>
          {filterJobId && (
            <button
              type="button"
              className="text-xs text-[var(--accent)]"
              onClick={() => setFilterJobId(null)}
            >
              {t("clearLogFilter")}
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto rounded-lg border border-[var(--border)] bg-black/30 font-mono text-xs">
          {logs.map((log) => (
            <div
              key={log.id}
              className={`px-3 py-1.5 border-b border-[var(--border)]/50 ${
                log.level === "error"
                  ? "text-red-400"
                  : log.level === "warn"
                    ? "text-amber-400"
                    : "text-[var(--foreground)]"
              }`}
            >
              <span className="text-[var(--muted)]">
                {new Date(log.createdAt).toLocaleTimeString()}{" "}
                [{log.source}]
                {log.jobId ? ` ${log.jobId.slice(0, 8)}` : ""}
              </span>{" "}
              {log.message}
            </div>
          ))}
          {logs.length === 0 && (
            <p className="p-4 text-[var(--muted)]">{t("noLogs")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
