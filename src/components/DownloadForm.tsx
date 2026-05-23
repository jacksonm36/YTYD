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
  FormatSelector,
  type FormatOption,
} from "./FormatSelector";
import {
  pickDefaultAudioFormat,
  pickDefaultVideoFormat,
} from "@/lib/format-defaults";
import {
  resolveFormatFromPreset,
  type FormatPresetId,
  type MediaType,
} from "@/lib/format-preset";

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

type DownloadMode = "single" | "batch";

type BatchItem = {
  id: string;
  url: string;
  status: "idle" | "analyzing" | "ready" | "error";
  errorCode?: string;
  probe?: ProbeResult;
  format?: FormatOption;
};

type ActiveJob = {
  jobId: string;
  title: string;
  job: JobStatus;
};

const MAX_BATCH_URLS = 10;

function parseUrlLines(text: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    urls.push(trimmed);
  }
  return urls.slice(0, MAX_BATCH_URLS);
}

function formatDuration(seconds: number, locale: string): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function applyPresetToFormats(
  formats: FormatOption[],
  mediaType: MediaType,
  preset: FormatPresetId,
  customFormatId: string
): FormatOption | undefined {
  const resolved = resolveFormatFromPreset(
    formats,
    mediaType,
    preset,
    customFormatId
  );
  if (resolved && "ext" in resolved && resolved.ext) {
    return resolved as FormatOption;
  }
  if (resolved) {
    const full = formats.find((f) => f.formatId === resolved.formatId);
    if (full) return full;
  }
  const fallback =
    mediaType === "video"
      ? pickDefaultVideoFormat(formats)
      : pickDefaultAudioFormat(formats);
  if (!fallback) return undefined;
  return formats.find((f) => f.formatId === fallback.formatId);
}

export function DownloadForm() {
  const t = useTranslations("download");
  const tErrors = useTranslations("errors");
  const locale = useLocale();

  const [mode, setMode] = useState<DownloadMode>("single");
  const [url, setUrl] = useState("");
  const [batchText, setBatchText] = useState("");
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>("video");
  const [formatPreset, setFormatPreset] = useState<FormatPresetId>("video_fast");
  const [selectedFormat, setSelectedFormat] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([]);
  const [savingToDevice, setSavingToDevice] = useState(false);
  const deliveredToDevice = useRef<Set<string>>(new Set());

  const allFormats = probe?.formats ?? [];
  const batchReadyCount = batchItems.filter((i) => i.status === "ready").length;

  const syncFormatSelection = useCallback(
    (formats: FormatOption[], type: MediaType, preset: FormatPresetId) => {
      const pick = applyPresetToFormats(formats, type, preset, selectedFormat);
      if (pick) {
        setSelectedFormat(pick.formatId);
        setMediaType(pick.type);
      }
    },
    [selectedFormat]
  );

  useEffect(() => {
    if (mediaType === "video" && formatPreset.startsWith("audio_")) {
      setFormatPreset("video_fast");
    }
    if (mediaType === "audio" && formatPreset.startsWith("video_")) {
      setFormatPreset("audio_best");
    }
  }, [mediaType, formatPreset]);

  useEffect(() => {
    if (probe && mode === "single") {
      syncFormatSelection(probe.formats, mediaType, formatPreset);
    }
  }, [probe, mode, mediaType, formatPreset, syncFormatSelection]);

  useEffect(() => {
    if (mode !== "batch" || batchItems.length === 0) return;
    setBatchItems((prev) =>
      prev.map((item) => {
        if (item.status !== "ready" || !item.probe) return item;
        const format = applyPresetToFormats(
          item.probe.formats,
          mediaType,
          formatPreset,
          selectedFormat
        );
        if (!format) {
          return { ...item, status: "error", errorCode: "noFormats", format: undefined };
        }
        return { ...item, format };
      })
    );
  }, [formatPreset, mediaType, selectedFormat, mode, batchItems.length]);

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
      const pick =
        applyPresetToFormats(
          data.formats,
          mediaType,
          formatPreset,
          selectedFormat
        ) ??
        defaultVideo ??
        defaultAudio ??
        data.formats[0];
      if (pick) {
        setSelectedFormat(pick.formatId);
        setMediaType(pick.type);
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

  const handleBatchAnalyze = async () => {
    const urls = parseUrlLines(batchText);
    if (urls.length === 0) {
      setError(tErrors("invalidUrl"));
      return;
    }
    setError(null);
    setBatchItems([]);
    setActiveJobs([]);
    setAnalyzing(true);
    setLoading(true);
    setBatchProgress({ done: 0, total: urls.length });

    const items: BatchItem[] = urls.map((u) => ({
      id: crypto.randomUUID(),
      url: u,
      status: "idle" as const,
    }));
    setBatchItems(items);

    const next = [...items];
    for (let i = 0; i < next.length; i++) {
      next[i] = { ...next[i], status: "analyzing" };
      setBatchItems([...next]);
      try {
        const data = await apiPost<ProbeResult>("/api/download/probe", {
          url: next[i].url,
        });
        const format = applyPresetToFormats(
          data.formats,
          mediaType,
          formatPreset,
          selectedFormat
        );
        if (!format) {
          next[i] = { ...next[i], status: "error", errorCode: "noFormats" };
        } else {
          next[i] = {
            ...next[i],
            status: "ready",
            probe: data,
            format,
          };
        }
      } catch (err) {
        next[i] = {
          ...next[i],
          status: "error",
          errorCode:
            err instanceof ApiClientError ? err.code : "generic",
        };
      }
      setBatchProgress({ done: i + 1, total: urls.length });
      setBatchItems([...next]);
    }

    setAnalyzing(false);
    setLoading(false);
  };

  const handleStart = async () => {
    if (!probe || !selectedFormat || !acceptTerms) {
      if (!acceptTerms) setError(tErrors("termsRequired"));
      return;
    }
    const format = applyPresetToFormats(
      probe.formats,
      mediaType,
      formatPreset,
      selectedFormat
    );
    if (!format || format.type !== mediaType) {
      setError(tErrors("invalidFormat"));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await apiPost<{ jobId: string }>("/api/download/start", {
        url,
        formatId: format.formatId,
        type: format.type,
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

  const handleBatchStart = async () => {
    if (!acceptTerms) {
      setError(tErrors("termsRequired"));
      return;
    }
    const ready = batchItems.filter(
      (i): i is BatchItem & { format: FormatOption; probe: ProbeResult } =>
        i.status === "ready" && !!i.format && !!i.probe
    );
    if (ready.length === 0) {
      setError(t("batchNoneReady"));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await apiPost<{
        jobIds: string[];
        errors: { url: string; code: string }[];
        queued: number;
      }>("/api/download/batch", {
        acceptTerms: true,
        items: ready.map((i) => ({
          url: i.url,
          formatId: i.format!.formatId,
          type: i.format!.type,
          formatLabel: i.format!.label,
          title: i.probe!.title,
        })),
      });

      const jobs: ActiveJob[] = data.jobIds.map((id, idx) => ({
        jobId: id,
        title: ready[idx]?.probe?.title ?? ready[idx]?.url ?? id,
        job: {
          status: "queued",
          phase: "queued",
          progress: 0,
          downloadProgress: 0,
          convertProgress: 0,
        },
      }));
      setActiveJobs(jobs);
      setJobId(null);
      setJob(null);

      if (data.errors.length > 0) {
        setError(
          t("batchPartialErrors", { count: data.errors.length })
        );
      }
    } catch (err) {
      setError(
        tErrors(err instanceof ApiClientError ? err.code : "generic")
      );
    } finally {
      setLoading(false);
    }
  };

  const pollStatus = useCallback(
    async (targetJobId: string) => {
      try {
        const data = await apiGet<JobStatus & { errorCode?: string }>(
          `/api/download/${targetJobId}`
        );
        return data;
      } catch {
        return null;
      }
    },
    []
  );

  useEffect(() => {
    if (!jobId || !job) return;
    if (
      job.status === "ready" ||
      job.status === "delivered" ||
      job.status === "failed" ||
      job.status === "expired"
    ) {
      return;
    }
    const interval = setInterval(() => {
      void pollStatus(jobId).then((data) => {
        if (!data) return;
        setJob({
          status: data.status,
          phase: data.phase ?? data.status,
          progress: data.progress ?? 0,
          downloadProgress: data.downloadProgress ?? 0,
          convertProgress: data.convertProgress ?? 0,
          errorCode: data.errorCode,
        });
        if (data.errorCode) setError(tErrors(data.errorCode));
      });
    }, 1500);
    void pollStatus(jobId).then((data) => {
      if (!data) return;
      setJob({
        status: data.status,
        phase: data.phase ?? data.status,
        progress: data.progress ?? 0,
        downloadProgress: data.downloadProgress ?? 0,
        convertProgress: data.convertProgress ?? 0,
        errorCode: data.errorCode,
      });
    });
    return () => clearInterval(interval);
  }, [jobId, job, pollStatus, tErrors]);

  useEffect(() => {
    if (activeJobs.length === 0) return;
    const interval = setInterval(() => {
      void Promise.all(
        activeJobs.map(async (aj) => {
          const data = await pollStatus(aj.jobId);
          return { jobId: aj.jobId, data };
        })
      ).then((results) => {
        setActiveJobs((prev) =>
          prev.map((aj) => {
            const hit = results.find((r) => r.jobId === aj.jobId);
            if (!hit?.data) return aj;
            return {
              ...aj,
              job: {
                status: hit.data.status,
                phase: hit.data.phase ?? hit.data.status,
                progress: hit.data.progress ?? 0,
                downloadProgress: hit.data.downloadProgress ?? 0,
                convertProgress: hit.data.convertProgress ?? 0,
                errorCode: hit.data.errorCode,
              },
            };
          })
        );
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [activeJobs, pollStatus]);

  const saveToDevice = useCallback(
    async (id: string) => {
      setSavingToDevice(true);
      setError(null);
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
        setActiveJobs((prev) =>
          prev.map((aj) =>
            aj.jobId === id
              ? {
                  ...aj,
                  job: {
                    ...aj.job,
                    status: "delivered",
                    phase: "delivered",
                    progress: 100,
                    downloadProgress: 100,
                    convertProgress: 100,
                  },
                }
              : aj
          )
        );
      } catch (err) {
        deliveredToDevice.current.delete(id);
        setError(
          tErrors(err instanceof ApiClientError ? err.code : "generic")
        );
      } finally {
        setSavingToDevice(false);
      }
    },
    [tErrors]
  );

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

  useEffect(() => {
    for (const aj of activeJobs) {
      if (
        aj.job.status === "ready" &&
        !savingToDevice &&
        !deliveredToDevice.current.has(aj.jobId)
      ) {
        void saveToDevice(aj.jobId);
      }
    }
  }, [activeJobs, saveToDevice, savingToDevice]);

  const showConvertBar =
    mediaType === "audio" ||
    job?.phase === "converting" ||
    job?.phase === "merging" ||
    (job?.convertProgress ?? 0) > 0;

  const resetMode = (next: DownloadMode) => {
    setMode(next);
    setError(null);
    setProbe(null);
    setJobId(null);
    setJob(null);
    setBatchItems([]);
    setActiveJobs([]);
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2 p-1 rounded-xl bg-[var(--card)] border border-[var(--border)] w-fit">
        <button
          type="button"
          onClick={() => resetMode("single")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === "single"
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          {t("modeSingle")}
        </button>
        <button
          type="button"
          onClick={() => resetMode("batch")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === "batch"
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          {t("modeBatch")}
        </button>
      </div>

      <FormatSelector
        formats={
          mode === "single" && probe
            ? probe.formats
            : batchItems.find((i) => i.probe)?.probe?.formats ?? []
        }
        mediaType={mediaType}
        onMediaTypeChange={(type) => {
          setMediaType(type);
          setFormatPreset(
            type === "video" ? "video_fast" : "audio_best"
          );
        }}
        preset={formatPreset}
        onPresetChange={(preset) => {
          setFormatPreset(preset);
          if (probe) {
            syncFormatSelection(probe.formats, mediaType, preset);
          }
        }}
        selectedFormatId={selectedFormat}
        onFormatIdChange={(formatId, type) => {
          setSelectedFormat(formatId);
          setMediaType(type);
          setFormatPreset("custom");
        }}
        showDetailedList={mode === "single" ? !!probe : batchReadyCount > 0}
        disabled={analyzing || loading}
      />

      {mode === "single" ? (
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
      ) : (
        <div className="space-y-3">
          <textarea
            value={batchText}
            onChange={(e) => setBatchText(e.target.value)}
            placeholder={t("batchPlaceholder")}
            rows={5}
            className="w-full px-4 py-3 rounded-xl bg-[var(--card)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-y min-h-[120px] font-mono text-sm"
          />
          <p className="text-xs text-[var(--muted)]">
            {t("batchLimit", { max: MAX_BATCH_URLS })}
          </p>
          <button
            type="button"
            onClick={() => void handleBatchAnalyze()}
            disabled={loading || !batchText.trim()}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[var(--accent)] text-white font-medium disabled:opacity-50 hover:opacity-90"
          >
            {analyzing
              ? t("batchAnalyzing", {
                  done: batchProgress.done,
                  total: batchProgress.total,
                })
              : t("batchAnalyze")}
          </button>
        </div>
      )}

      {analyzing && mode === "single" && (
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

      {mode === "batch" && batchItems.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
          <h3 className="font-medium">
            {t("batchQueueTitle")} ({batchReadyCount}/{batchItems.length})
          </h3>
          <ul className="space-y-2 max-h-72 overflow-y-auto">
            {batchItems.map((item) => (
              <li
                key={item.id}
                className="flex gap-3 items-start p-3 rounded-lg border border-[var(--border)]"
              >
                {item.probe?.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.probe.thumbnail}
                    alt=""
                    className="w-20 h-12 object-cover rounded shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {item.probe?.title ?? item.url}
                  </p>
                  {item.status === "ready" && item.format && (
                    <p className="text-xs text-[var(--muted)] mt-1">
                      {item.format.label}
                      {item.probe
                        ? ` · ${formatDuration(item.probe.duration, locale)}`
                        : ""}
                    </p>
                  )}
                  {item.status === "analyzing" && (
                    <p className="text-xs text-[var(--accent)] mt-1">
                      {t("analyzing")}
                    </p>
                  )}
                  {item.status === "error" && (
                    <p className="text-xs text-red-400 mt-1">
                      {tErrors(item.errorCode ?? "generic")}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mode === "single" && probe && !analyzing && (
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

      {mode === "batch" && batchReadyCount > 0 && !analyzing && (
        <div className="space-y-4">
          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="mt-1 accent-[var(--accent)]"
            />
            <span className="text-[var(--muted)]">{t("termsLabel")}</span>
          </label>
          <button
            type="button"
            onClick={() => void handleBatchStart()}
            disabled={loading || !acceptTerms || activeJobs.length > 0}
            className="w-full py-3 rounded-xl bg-[var(--accent)] text-white font-medium disabled:opacity-50 hover:opacity-90"
          >
            {t("batchStart", { count: batchReadyCount })}
          </button>
        </div>
      )}

      {jobId && job && mode === "single" && (
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
              onClick={() => void saveToDevice(jobId)}
              className="w-full py-3 rounded-xl bg-green-600 text-white font-medium hover:opacity-90"
            >
              {t("downloadToDevice")}
            </button>
          )}
        </div>
      )}

      {activeJobs.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-medium">{t("batchActiveJobs")}</h3>
          {activeJobs.map((aj) => (
            <div
              key={aj.jobId}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3"
            >
              <p className="text-sm font-medium truncate">{aj.title}</p>
              <ProgressBars
                phase={aj.job.phase}
                status={aj.job.status}
                progress={aj.job.progress}
                downloadProgress={aj.job.downloadProgress}
                convertProgress={aj.job.convertProgress}
                showConvert={mediaType === "audio"}
              />
              {aj.job.status === "delivered" && (
                <p className="text-xs text-emerald-400">{t("savedToDevice")}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
