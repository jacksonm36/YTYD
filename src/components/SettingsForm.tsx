"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { ApiClientError, apiPatch } from "@/lib/api-client";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { LoginHistory } from "./LoginHistory";
import { InviteLinkSettings } from "./InviteLinkSettings";
import { PendingUsersAdmin } from "./PendingUsersAdmin";
import { AdminServerMonitor } from "./AdminServerMonitor";
import { AdminServerSettings } from "./AdminServerSettings";
import { AdminDatabaseConsole } from "./AdminDatabaseConsole";

export function SettingsForm() {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const tAuth = useTranslations("auth");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const { data: session, update } = useSession();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    setName(session?.user?.name ?? "");
    setUsername(
      (session?.user as { username?: string })?.username ?? ""
    );
  }, [session]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setProfileMessage(null);
    setProfileLoading(true);
    try {
      const data = await apiPatch<{
        name: string;
        username: string | null;
      }>("/api/settings/profile", {
        name: name.trim(),
        username: username.trim() || undefined,
      });
      await update({ name: data.name, username: data.username });
      setProfileMessage(t("saved"));
    } catch (err) {
      setError(
        tErrors(err instanceof ApiClientError ? err.code : "generic")
      );
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPasswordMessage(null);
    if (newPassword.length < 8) {
      setError(tAuth("passwordMin"));
      return;
    }
    setPasswordLoading(true);
    try {
      const data = await apiPatch<{ relogin?: boolean }>(
        "/api/settings/password",
        { currentPassword, newPassword }
      );
      setPasswordMessage(t("passwordSaved"));
      setCurrentPassword("");
      setNewPassword("");
      if (data.relogin) {
        await signOut({ callbackUrl: `/${locale}/login?expired=1` });
      }
    } catch (err) {
      setError(
        tErrors(err instanceof ApiClientError ? err.code : "generic")
      );
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className={`space-y-8 ${isAdmin ? "max-w-5xl" : "max-w-md"}`}>
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-[var(--muted)]">{t("language")}</h2>
        <LanguageSwitcher />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-[var(--muted)]">{t("profile")}</h2>
        <form onSubmit={(e) => void handleProfileSave(e)} className="space-y-4">
          <div>
            <label className="block text-sm mb-1 text-[var(--muted)]">
              {tAuth("name")}
            </label>
            <input
              type="text"
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-[var(--card)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          <div>
            <label className="block text-sm mb-1 text-[var(--muted)]">
              {t("username")}
            </label>
            <input
              type="text"
              maxLength={32}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              className="w-full px-4 py-3 rounded-xl bg-[var(--card)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            <p className="text-xs text-[var(--muted)] mt-1">{t("usernameHint")}</p>
          </div>
          {profileMessage && (
            <p className="text-green-400 text-sm">{profileMessage}</p>
          )}
          <button
            type="submit"
            disabled={profileLoading}
            className="px-6 py-3 rounded-xl bg-[var(--accent)] text-white font-medium disabled:opacity-50"
          >
            {tCommon("save")}
          </button>
        </form>
      </section>

      {isAdmin && (
        <>
          <section className="space-y-4">
            <h2 className="text-sm font-medium text-[var(--muted)]">
              {t("inviteLink")}
            </h2>
            <InviteLinkSettings />
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-medium text-[var(--muted)]">
              {t("pendingApprovals")}
            </h2>
            <p className="text-xs text-[var(--muted)]">{t("pendingApprovalsHint")}</p>
            <PendingUsersAdmin />
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-medium text-[var(--muted)]">
              {t("serverSettings")}
            </h2>
            <p className="text-xs text-[var(--muted)]">{t("serverSettingsIntro")}</p>
            <AdminServerSettings />
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-medium text-[var(--muted)]">
              {t("dbConsole")}
            </h2>
            <AdminDatabaseConsole />
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-medium text-[var(--muted)]">
              {t("serverMonitor")}
            </h2>
            <AdminServerMonitor />
          </section>
        </>
      )}

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-[var(--muted)]">
          {t("loginHistory")}
        </h2>
        <p className="text-xs text-[var(--muted)]">{t("loginHistoryHint")}</p>
        <LoginHistory />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-[var(--muted)]">{t("changePassword")}</h2>
        <form onSubmit={(e) => void handlePasswordChange(e)} className="space-y-4">
          <div>
            <label className="block text-sm mb-1 text-[var(--muted)]">
              {t("currentPassword")}
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-[var(--card)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          <div>
            <label className="block text-sm mb-1 text-[var(--muted)]">
              {t("newPassword")}
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-[var(--card)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          {passwordMessage && (
            <p className="text-green-400 text-sm">{passwordMessage}</p>
          )}
          <button
            type="submit"
            disabled={passwordLoading}
            className="px-6 py-3 rounded-xl bg-[var(--accent)] text-white font-medium disabled:opacity-50"
          >
            {tCommon("save")}
          </button>
        </form>
      </section>

      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}
