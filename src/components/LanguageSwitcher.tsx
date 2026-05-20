"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/routing";
import { useSession } from "next-auth/react";
import { apiPatch } from "@/lib/api-client";

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();

  const switchLocale = async (newLocale: "hu" | "en") => {
    router.replace(pathname, { locale: newLocale });
    if (session?.user) {
      await apiPatch("/api/settings/locale", { locale: newLocale }).catch(
        () => undefined
      );
    }
  };

  return (
    <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-sm">
      <button
        type="button"
        onClick={() => switchLocale("hu")}
        className={`px-2.5 py-1.5 ${
          locale === "hu" ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--border)]"
        }`}
        aria-pressed={locale === "hu"}
      >
        HU
      </button>
      <button
        type="button"
        onClick={() => switchLocale("en")}
        className={`px-2.5 py-1.5 ${
          locale === "en" ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--border)]"
        }`}
        aria-pressed={locale === "en"}
      >
        EN
      </button>
    </div>
  );
}
