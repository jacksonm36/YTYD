import dynamic from "next/dynamic";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireAuth } from "@/lib/require-auth";
import { CardSkeleton } from "@/components/ui/Skeleton";

const DownloadForm = dynamic(
  () =>
    import("@/components/DownloadForm").then((mod) => mod.DownloadForm),
  { loading: () => <CardSkeleton /> }
);

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAuth(locale);
  const t = await getTranslations("nav");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("dashboard")}</h1>
      <DownloadForm />
    </div>
  );
}
