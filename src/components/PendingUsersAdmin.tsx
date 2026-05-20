"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiGet, apiPatch } from "@/lib/api-client";

type PendingUser = {
  id: string;
  email: string;
  username: string | null;
  name: string | null;
  locale: string;
  createdAt: string;
};

export function PendingUsersAdmin() {
  const t = useTranslations("settings");
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<{ users: PendingUser[] }>(
        "/api/admin/pending-users"
      );
      setUsers(res.users);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (
    userId: string,
    accountStatus: "approved" | "rejected"
  ) => {
    setActingId(userId);
    try {
      await apiPatch(`/api/admin/users/${userId}`, { accountStatus });
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } finally {
      setActingId(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-[var(--muted)]">{t("pendingLoading")}</p>;
  }

  if (users.length === 0) {
    return <p className="text-sm text-[var(--muted)]">{t("pendingEmpty")}</p>;
  }

  return (
    <ul className="space-y-3">
      {users.map((user) => (
        <li
          key={user.id}
          className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] flex flex-wrap items-center justify-between gap-3"
        >
          <div className="min-w-0">
            <p className="font-medium truncate">
              {user.name ?? user.username ?? user.email}
            </p>
            <p className="text-xs text-[var(--muted)] truncate">{user.email}</p>
            {user.username && (
              <p className="text-xs text-[var(--muted)]">@{user.username}</p>
            )}
            <p className="text-xs text-[var(--muted)] mt-1">
              {new Date(user.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              disabled={actingId === user.id}
              onClick={() => void setStatus(user.id, "approved")}
              className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm hover:opacity-90 disabled:opacity-50"
            >
              {t("approveUser")}
            </button>
            <button
              type="button"
              disabled={actingId === user.id}
              onClick={() => void setStatus(user.id, "rejected")}
              className="px-3 py-1.5 rounded-lg border border-red-500/50 text-red-400 text-sm hover:bg-red-900/20 disabled:opacity-50"
            >
              {t("rejectUser")}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
