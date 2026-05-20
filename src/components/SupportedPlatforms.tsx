"use client";

import { useTranslations } from "next-intl";
import { SUPPORTED_PLATFORMS } from "@/lib/supported-sites";

export function SupportedPlatforms() {
  const t = useTranslations("home");

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-[var(--muted)]">
        {t("supportedSitesTitle")}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {SUPPORTED_PLATFORMS.map((p) => (
          <li
            key={p.id}
            className="px-3 py-1.5 rounded-lg text-xs border border-[var(--border)] bg-[var(--card)]"
          >
            {p.label}
          </li>
        ))}
      </ul>
      <p className="text-xs text-[var(--muted)]">{t("supportedSitesNote")}</p>
    </div>
  );
}
