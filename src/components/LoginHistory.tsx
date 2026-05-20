"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useSession } from "next-auth/react";
import { apiGet } from "@/lib/api-client";

type LoginEventRow = {
  id: string;
  success: boolean;
  ipAddress: string;
  location: string | null;
  countryCode: string | null;
  timezone: string | null;
  userAgent: string | null;
  loginId: string | null;
  userLabel: string | null;
  createdAt: string;
};

export function LoginHistory() {
  const t = useTranslations("settings");
  const locale = useLocale();
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  const [events, setEvents] = useState<LoginEventRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void apiGet<{ events: LoginEventRow[] }>("/api/settings/login-history")
      .then((data) => setEvents(data.events))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  const dateFmt = new Intl.DateTimeFormat(locale === "hu" ? "hu-HU" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  if (loading) {
    return <p className="text-[var(--muted)] text-sm">{t("loginHistoryLoading")}</p>;
  }

  if (events.length === 0) {
    return <p className="text-[var(--muted)] text-sm">{t("loginHistoryEmpty")}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--card)] text-left text-[var(--muted)]">
            <th className="px-3 py-2 font-medium">{t("loginHistoryWhen")}</th>
            {isAdmin && (
              <th className="px-3 py-2 font-medium">{t("loginHistoryUser")}</th>
            )}
            <th className="px-3 py-2 font-medium">{t("loginHistoryStatus")}</th>
            <th className="px-3 py-2 font-medium">{t("loginHistoryIp")}</th>
            <th className="px-3 py-2 font-medium">{t("loginHistoryLocation")}</th>
            <th className="px-3 py-2 font-medium hidden md:table-cell">
              {t("loginHistoryAgent")}
            </th>
          </tr>
        </thead>
        <tbody>
          {events.map((ev) => (
            <tr
              key={ev.id}
              className="border-b border-[var(--border)] last:border-0"
            >
              <td className="px-3 py-2 whitespace-nowrap">
                {dateFmt.format(new Date(ev.createdAt))}
              </td>
              {isAdmin && (
                <td className="px-3 py-2 max-w-[8rem] truncate">
                  {ev.userLabel ?? ev.loginId ?? "—"}
                </td>
              )}
              <td className="px-3 py-2">
                <span
                  className={
                    ev.success
                      ? "text-green-400"
                      : "text-red-400"
                  }
                >
                  {ev.success ? t("loginSuccess") : t("loginFailed")}
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-xs">{ev.ipAddress}</td>
              <td className="px-3 py-2 text-[var(--muted)]">
                {ev.location ?? "—"}
                {ev.timezone && (
                  <span className="block text-xs opacity-70">{ev.timezone}</span>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-[var(--muted)] hidden md:table-cell max-w-[12rem] truncate">
                {ev.userAgent ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
