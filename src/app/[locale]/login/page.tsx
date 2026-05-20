"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-[var(--muted)]">…</div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const t = useTranslations("auth");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? `/${locale}/dashboard`;
  const sessionExpired = searchParams.get("expired") === "1";
  const pendingApproval = searchParams.get("pending") === "1";
  const registered = searchParams.get("registered") === "1";

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const rateRes = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: login }),
    });
    if (rateRes.status === 429) {
      setError(tErrors("rateLimited"));
      setLoading(false);
      return;
    }

    const result = await signIn("credentials", {
      login,
      password,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      const code = result.error;
      if (code === "pending_approval") {
        setError(t("pendingApproval"));
      } else if (code === "rejected_account") {
        setError(t("rejectedAccount"));
      } else {
        setError(t("invalidCredentials"));
      }
      return;
    }
    const path = callbackUrl.replace(/^\/(hu|en)/, "") || "/dashboard";
    router.push(path);
  };

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-6">{t("signIn")}</h1>
      {sessionExpired && (
        <p className="text-amber-400 text-sm mb-4" role="status">
          {tErrors("sessionExpired")}
        </p>
      )}
      {(pendingApproval || registered) && (
        <p className="text-amber-400 text-sm mb-4" role="status">
          {t("pendingApproval")}
        </p>
      )}
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div>
          <label className="block text-sm mb-1 text-[var(--muted)]">
            {t("loginId")}
          </label>
          <input
            type="text"
            required
            autoComplete="username"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="admin"
            className="w-full px-4 py-3 rounded-xl bg-[var(--card)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
        <div>
          <label className="block text-sm mb-1 text-[var(--muted)]">{t("password")}</label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-[var(--card)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl bg-[var(--accent)] text-white font-medium disabled:opacity-50"
        >
          {t("signIn")}
        </button>
      </form>
      <p className="mt-4 text-sm text-[var(--muted)]">{t("inviteOnlyHint")}</p>
    </div>
  );
}
