"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import {
  ApiClientError,
  apiGet,
  apiPost,
  triggerSecureDownload,
} from "@/lib/api-client";
import { ProgressBars } from "./ProgressBars";
import {
  pickDefaultAudioFormat,
  pickDefaultVideoFormat,
} from "@/lib/format-defaults";

interface FormatOption {
  formatId: string;
  type: "video" | "audio";
  label: string;
  ext: string;
  resolution?: string;
  filesize?: number;
}

interface ProbeResult {
  title: string;
  thumbnail?: string;
  duration: number;
  formats: FormatOption[];
  platform?: string;
  platformLabel?: string;
}

interface JobStatus {
  status: string;
  phase: string;
  progress: number;
  downloadProgress: number;
  convertProgress: number;
  errorCode?: string;
}

function formatDuration(seconds: number, locale: string): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatBytes(bytes?: number, locale = "hu"): string {
  if (!bytes) return "";
  const units = locale === "hu" ? ["B", "KB", "MB", "GB"] : ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `~${v.toFixed(1)} ${units[i]}`;
}

export function DownloadForm() {
  const t = useTranslations("download");
  const tErrors = useTranslations("errors");
  const locale = useLocale();

  const [url, setUrl] = useState("");
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string>("");
  const [selectedType, setSelectedType] = useState<"video" | "audio">("video");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [savingToDevice, setSavingToDevice] = useState(false);
  const deliveredToDevice = useRef<Set<string>>(new Set());

  const handleAnalyze = async () => {
    setError(null);
    setProbe(null);
    setJobId(null);
    setJob(null);
    setAnalyzing(true);
    setLoading(true);
    try {
      const data = await apiPost<ProbeResult>("/api/download/probe", { url });
      setProbe(data);
      const defaultVideo = pickDefaultVideoFormat(data.formats);
      const defaultAudio = pickDefaultAudioFormat(data.formats);
      const pick = defaultVideo ?? defaultAudio ?? data.formats[0];
      if (pick) {
        setSelectedFormat(pick.formatId);
        setSelectedType(pick.type);
      }
    } catch (err) {
      setError(
        tErrors(err instanceof ApiClientError ? err.code : "generic")
      );
    } finally {
      setLoading(false);
      setAnalyzing(false);
    }
  };

  const handleStart = async () => {
    if (!probe || !selectedFormat || !acceptTerms) {
      if (!acceptTerms) setError(tErrors("termsRequired"));
      return;
    }
    const format = probe.formats.find((f) => f.formatId === selectedFormat);
    if (!format || format.type !== selectedType) {
      setError(tErrors("invalidFormat"));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await apiPost<{ jobId: string }>("/api/download/start", {
        url,
        formatId: selectedFormat,
        type: selectedType,
        formatLabel: format.label,
        acceptTerms: true,
      });
      setJobId(data.jobId);
      setJob({
        status: "queued",
        phase: "queued",
        progress: 0,
        downloadProgress: 0,
        convertProgress: 0,
      });
    } catch (err) {
      setError(
        tErrors(err instanceof ApiClientError ? err.code : "generic")
      );
    } finally {
      setLoading(false);
    }
  };

  const pollStatus = useCallback(async () => {
    if (!jobId) return;
    try {
      const data = await apiGet<JobStatus & { errorCode?: string }>(
        `/api/download/${jobId}`
      );
    setJob({
      status: data.status,
      phase: data.phase ?? data.status,
      progress: data.progress ?? 0,
      downloadProgress: data.downloadProgress ?? 0,
      convertProgress: data.convertProgress ?? 0,
      errorCode: data.errorCode,
    });
      if (data.errorCode) setError(tErrors(data.errorCode));
    } catch {
      /* session redirect handled by api-client */
    }
  }, [jobId, tErrors]);

  useEffect(() => {
    if (
      !jobId ||
      !job ||
      job.status === "ready" ||
      job.status === "delivered" ||
      job.status === "failed" ||
      job.status === "expired"
    ) {
      return;
    }
    const interval = setInterval(() => void pollStatus(), 1500);
    void pollStatus();
    return () => clearInterval(interval);
  }, [jobId, job?.status, pollStatus]);

  const saveToDevice = useCallback(
    async (id: string) => {
      setSavingToDevice(true);
      setError(null);
      setJob((prev) =>
        prev ? { ...prev, phase: "savingToDevice" } : prev
      );
      try {
        await triggerSecureDownload(id);
        deliveredToDevice.current.add(id);
        setJob((prev) =>
          prev
            ? {
                ...prev,
                status: "delivered",
                phase: "delivered",
                progress: 100,
                downloadProgress: 100,
                convertProgress: 100,
              }
            : prev
        );
      } catch (err) {
        deliveredToDevice.current.delete(id);
        setError(
          tErrors(err instanceof ApiClientError ? err.code : "generic")
        );
        void pollStatus();
      } finally {
        setSavingToDevice(false);
      }
    },
    [pollStatus, tErrors]
  );

  const handleDownloadFile = () => {
    if (!jobId) return;
    void saveToDevice(jobId);
  };

  useEffect(() => {
    if (
      !jobId ||
      !job ||
      job.status !== "ready" ||
      job.phase === "savingToDevice" ||
      savingToDevice ||
      deliveredToDevice.current.has(jobId)
    ) {
      return;
    }
    void saveToDevice(jobId);
  }, [jobId, job, job?.status, job?.phase, saveToDevice, savingToDevice]);

  const filteredFormats =
    probe?.formats.filter((f) => f.type === selectedType) ?? [];

  const showConvertBar =
    selectedType === "audio" ||
    job?.phase === "converting" ||
    job?.phase === "merging" ||
    (job?.convertProgress ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t("pasteUrl")}
          className="flex-1 px-4 py-3 rounded-xl bg-[var(--card)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
        <button
          type="button"
          onClick={() => void handleAnalyze()}
          disabled={loading || !url.trim()}
          className="px-6 py-3 rounded-xl bg-[var(--accent)] text-white font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {analyzing ? t("analyzing") : t("analyze")}
        </button>
      </div>

      {analyzing && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="text-sm text-[var(--muted)] mb-2">{t("analyzing")}</p>
          <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden">
            <div className="h-full w-2/5 bg-[var(--accent)] animate-pulse rounded-full" />
          </div>
        </div>
      )}

      {error && (
        <p className="text-red-400 text-sm px-1" role="alert">
          {error}
        </p>
      )}

      {probe && !analyzing && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
          <div className="flex gap-4 items-start">
            {probe.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={probe.thumbnail}
                alt=""
                loading="lazy"
                decoding="async"
                className="w-32 h-20 object-cover rounded-lg shrink-0"
              />
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-lg">{probe.title}</h2>
                {probe.platformLabel && (
                  <span className="text-xs px-2 py-0.5 rounded bg-[var(--border)] text-[var(--muted)]">
                    {probe.platformLabel}
                  </span>
                )}
              </div>
              <p className="text-[var(--muted)] text-sm mt-1">
                {t("duration")}: {formatDuration(probe.duration, locale)}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedType("video");
                const first = probe.formats.find((f) => f.type === "video");
                if (first) setSelectedFormat(first.formatId);
              }}
              className={`px-4 py-2 rounded-lg text-sm ${
                selectedType === "video"
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--border)]"
              }`}
            >
              {t("video")}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedType("audio");
                const first = probe.formats.find((f) => f.type === "audio");
                if (first) setSelectedFormat(first.formatId);
              }}
              className={`px-4 py-2 rounded-lg text-sm ${
                selectedType === "audio"
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--border)]"
              }`}
            >
              {t("audio")}
            </button>
          </div>

          <p className="text-sm font-medium">{t("selectFormat")}</p>
          {filteredFormats.length === 0 ? (
            <p className="text-[var(--muted)] text-sm">{t("noFormats")}</p>
          ) : (
            <div className="grid gap-2 max-h-64 overflow-y-auto">
              {filteredFormats.map((f) => (
                <label
                  key={`${f.type}-${f.formatId}`}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedFormat === f.formatId
                      ? "border-[var(--accent)] bg-[var(--accent)]/10"
                      : "border-[var(--border)] hover:border-[var(--muted)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="format"
                    checked={selectedFormat === f.formatId}
                    onChange={() => {
                      setSelectedFormat(f.formatId);
                      setSelectedType(f.type);
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

          <p className="text-xs text-[var(--muted)]">{t("serverStagingNote")}</p>

          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="mt-1 accent-[var(--accent)]"
            />
            <span className="text-[var(--muted)]">{t("termsLabel")}</span>
          </label>

          {!jobId && (
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={loading || !selectedFormat || !acceptTerms}
              className="w-full py-3 rounded-xl bg-[var(--accent)] text-white font-medium disabled:opacity-50 hover:opacity-90"
            >
              {t("startDownload")}
            </button>
          )}
        </div>
      )}

      {jobId && job && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
          <ProgressBars
            phase={job.phase}
            status={job.status}
            progress={job.progress}
            downloadProgress={job.downloadProgress}
            convertProgress={job.convertProgress}
            showConvert={showConvertBar}
          />
          {job.status === "delivered" && !savingToDevice && (
              <p className="text-sm text-emerald-400" role="status">
                {t("savedToDevice")}
              </p>
            )}
          {job.status === "ready" && !savingToDevice && (
              <button
                type="button"
                onClick={handleDownloadFile}
                className="w-full py-3 rounded-xl bg-green-600 text-white font-medium hover:opacity-90"
              >
                {t("downloadToDevice")}
              </button>
            )}
        </div>
      )}
    </div>
  );
}
