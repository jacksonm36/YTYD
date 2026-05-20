"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/routing";
import { signOut, useSession } from "next-auth/react";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function Header() {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();
  const { data: session } = useSession();

  const navLink = (href: string, label: string) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={`px-3 py-2 rounded-lg text-sm transition-colors ${
          active
            ? "bg-[var(--accent)] text-white"
            : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card)]"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="border-b border-[var(--border)] bg-[var(--card)]/80 backdrop-blur sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-4 max-w-5xl">
        <Link
          href="/"
          className="font-semibold text-sm sm:text-base text-[var(--foreground)] max-w-[12rem] sm:max-w-none leading-snug"
          title={tCommon("appName")}
        >
          <span className="hidden sm:inline">{tCommon("appName")}</span>
          <span className="sm:hidden">{tCommon("appShortName")}</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-1">
          {navLink("/", t("home"))}
          {session?.user && (
            <>
              {navLink("/dashboard", t("dashboard"))}
              {navLink("/history", t("history"))}
              {navLink("/settings", t("settings"))}
            </>
          )}
        </nav>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          {session?.user ? (
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: `/${locale}` })}
              className="text-sm px-3 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--border)] transition-colors"
            >
              {t("logout")}
            </button>
          ) : (
            <Link
              href="/login"
              className="text-sm px-3 py-2 rounded-lg bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
            >
              {t("login")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
