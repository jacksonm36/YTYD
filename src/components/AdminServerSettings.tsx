"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ApiClientError, apiGet, apiPatch } from "@/lib/api-client";

type SettingDef = {
  key: string;
  type: "number" | "boolean" | "string";
  min?: number;
  max?: number;
  description: string;
};

type EffectiveEntry = { value: string; source: "db" | "env" };

export function AdminServerSettings() {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const [definitions, setDefinitions] = useState<SettingDef[]>([]);
  const [effective, setEffective] = useState<Record<string, EffectiveEntry>>(
    {}
  );
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{
        definitions: SettingDef[];
        effective: Record<string, EffectiveEntry>;
      }>("/api/admin/server-settings");
      setDefinitions(data.definitions);
      setEffective(data.effective);
      const initial: Record<string, string> = {};
      for (const def of data.definitions) {
        initial[def.key] = data.effective[def.key]?.value ?? "";
      }
      setDraft(initial);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.code : "generic"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const settings: Record<string, string> = {};
      for (const def of definitions) {
        const current = effective[def.key];
        const next = draft[def.key];
        if (next !== undefined && next !== current?.value) {
          settings[def.key] = next;
        }
      }
      const data = await apiPatch<{
        effective: Record<string, EffectiveEntry>;
      }>("/api/admin/server-settings", { settings });
      setEffective(data.effective);
      setMessage(t("serverSettingsSaved"));
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.code : "generic"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (key: string) => {
    setSaving(true);
    setError(null);
    try {
      const data = await apiPatch<{
        effective: Record<string, EffectiveEntry>;
      }>("/api/admin/server-settings", { resetKeys: [key] });
      setEffective(data.effective);
      setDraft((d) => ({
        ...d,
        [key]: data.effective[key]?.value ?? "",
      }));
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.code : "generic"
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-[var(--muted)]">{t("loading")}</p>;
  }

  return (
    <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <p className="text-xs text-[var(--muted)]">{t("serverSettingsHint")}</p>
      <div className="space-y-4 max-h-[32rem] overflow-y-auto pr-1">
        {definitions.map((def) => {
          const src = effective[def.key]?.source ?? "env";
          return (
            <div
              key={def.key}
              className="border-b border-[var(--border)] pb-4 last:border-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <label className="text-sm font-medium font-mono">{def.key}</label>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    src === "db"
                      ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                      : "bg-[var(--border)] text-[var(--muted)]"
                  }`}
                >
                  {src === "db" ? t("sourceDb") : t("sourceEnv")}
                </span>
              </div>
              <p className="text-xs text-[var(--muted)] mb-2">{def.description}</p>
              {def.type === "boolean" ? (
                <select
                  value={draft[def.key] ?? "true"}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [def.key]: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm"
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  type="number"
                  min={def.min}
                  max={def.max}
                  value={draft[def.key] ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [def.key]: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm font-mono"
                />
              )}
              {src === "db" && (
                <button
                  type="button"
                  onClick={() => void handleReset(def.key)}
                  className="mt-2 text-xs text-[var(--muted)] hover:text-[var(--foreground)] underline"
                >
                  {t("resetToEnv")}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {message && <p className="text-sm text-green-400">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="button"
        disabled={saving}
        onClick={() => void handleSave()}
        className="px-6 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-50"
      >
        {saving ? tCommon("loading") : tCommon("save")}
      </button>
    </div>
  );
}
