import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { SupportedPlatforms } from "@/components/SupportedPlatforms";
import { auth } from "@/auth";

/** Session-aware; must not be statically cached at build time. */
export const dynamic = "force-dynamic";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const session = await auth();

  return (
    <section className="space-y-8 py-8">
      <div className="space-y-4">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
          {t("title")}
        </h1>
        <p className="text-sm text-[var(--muted)]">{t("titleAcronym")}</p>
        <p className="text-lg text-[var(--muted)] max-w-2xl">{t("subtitle")}</p>
        {!session?.user && (
          <Link
            href="/login"
            className="inline-block px-6 py-3 rounded-xl bg-[var(--accent)] text-white font-medium hover:opacity-90 transition-opacity"
          >
            {t("cta")}
          </Link>
        )}
      </div>
      <ul className="grid gap-4 sm:grid-cols-3">
        {[t("feature1"), t("feature2"), t("feature3")].map((feature) => (
          <li
            key={feature}
            className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm"
          >
            {feature}
          </li>
        ))}
      </ul>
      <SupportedPlatforms />
    </section>
  );
}
