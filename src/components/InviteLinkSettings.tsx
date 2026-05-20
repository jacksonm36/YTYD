"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiGet, apiPost } from "@/lib/api-client";

type InviteData = {
  inviteUrl: string;
  inviteUrlHu: string;
  inviteUrlEn: string;
};

export function InviteLinkSettings() {
  const t = useTranslations("settings");
  const [data, setData] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<InviteData>("/api/settings/invite");
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async (url: string, key: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  };

  const regenerate = async () => {
    if (!confirm(t("inviteRegenerateConfirm"))) return;
    setRegenerating(true);
    try {
      const res = await apiPost<InviteData>("/api/settings/invite", {});
      setData(res);
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-[var(--muted)]">{t("inviteLoading")}</p>;
  }

  if (!data) {
    return <p className="text-sm text-red-400">{t("inviteLoadError")}</p>;
  }

  const rows = [
    { key: "hu", label: t("inviteLinkHu"), url: data.inviteUrlHu },
    { key: "en", label: t("inviteLinkEn"), url: data.inviteUrlEn },
  ];

  return (
    <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <p className="text-sm text-[var(--muted)]">{t("inviteHint")}</p>
      {rows.map((row) => (
        <div key={row.key} className="space-y-2">
          <label className="text-xs font-medium text-[var(--muted)]">
            {row.label}
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              readOnly
              value={row.url}
              className="flex-1 px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-xs font-mono"
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              onClick={() => void copy(row.url, row.key)}
              className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm hover:bg-[var(--border)] shrink-0"
            >
              {copied === row.key ? t("inviteCopied") : t("inviteCopy")}
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => void regenerate()}
        disabled={regenerating}
        className="text-sm px-4 py-2 rounded-lg border border-amber-600/50 text-amber-400 hover:bg-amber-900/20 disabled:opacity-50"
      >
        {regenerating ? t("inviteRegenerating") : t("inviteRegenerate")}
      </button>
    </div>
  );
}
