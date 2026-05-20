"use client";

import { Suspense, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { useSearchParams } from "next/navigation";

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="text-[var(--muted)]">…</div>}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const t = useTranslations("auth");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite") ?? "";

  const [inviteValid, setInviteValid] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!inviteToken) {
      setInviteValid(false);
      return;
    }
    void fetch(
      `/api/auth/invite/validate?token=${encodeURIComponent(inviteToken)}`
    )
      .then((res) => res.json())
      .then((data: { valid?: boolean }) => setInviteValid(!!data.valid))
      .catch(() => setInviteValid(false));
  }, [inviteToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!inviteValid || !inviteToken) {
      setError(tErrors("invalidInvite"));
      return;
    }

    if (password.length < 8) {
      setError(t("passwordMin"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name,
          username: username.trim() || undefined,
          locale,
          invite: inviteToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(tErrors(data.error ?? "generic"));
        return;
      }
      router.push("/login?pending=1");
    } catch {
      setError(tErrors("generic"));
    } finally {
      setLoading(false);
    }
  };

  if (inviteValid === null) {
    return (
      <div className="max-w-md mx-auto">
        <p className="text-[var(--muted)]">{t("inviteChecking")}</p>
      </div>
    );
  }

  if (!inviteValid) {
    return (
      <div className="max-w-md mx-auto space-y-4">
        <h1 className="text-2xl font-bold">{t("signUp")}</h1>
        <p className="text-amber-400 text-sm" role="alert">
          {t("inviteRequired")}
        </p>
        <p className="text-sm text-[var(--muted)]">{t("inviteRequiredHint")}</p>
        <Link
          href="/login"
          className="inline-block text-[var(--accent)] hover:underline text-sm"
        >
          {t("signIn")}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-2">{t("signUp")}</h1>
      <p className="text-sm text-[var(--muted)] mb-6">{t("inviteSignUpHint")}</p>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div>
          <label className="block text-sm mb-1 text-[var(--muted)]">{t("name")}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-[var(--card)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
        <div>
          <label className="block text-sm mb-1 text-[var(--muted)]">{t("username")}</label>
          <input
            type="text"
            maxLength={32}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-[var(--card)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
        <div>
          <label className="block text-sm mb-1 text-[var(--muted)]">{t("email")}</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-[var(--card)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
        <div>
          <label className="block text-sm mb-1 text-[var(--muted)]">{t("password")}</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-[var(--card)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
        <div>
          <label className="block text-sm mb-1 text-[var(--muted)]">
            {t("confirmPassword")}
          </label>
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-[var(--card)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl bg-[var(--accent)] text-white font-medium disabled:opacity-50"
        >
          {t("signUp")}
        </button>
      </form>
      <p className="mt-4 text-sm text-[var(--muted)]">
        {t("hasAccount")}{" "}
        <Link href="/login" className="text-[var(--accent)] hover:underline">
          {t("signIn")}
        </Link>
      </p>
    </div>
  );
}
