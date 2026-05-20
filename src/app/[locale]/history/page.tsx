import dynamic from "next/dynamic";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import type { HistoryJob } from "@/components/DownloadHistory";
import { Skeleton } from "@/components/ui/Skeleton";

const DownloadHistory = dynamic(
  () =>
    import("@/components/DownloadHistory").then((mod) => mod.DownloadHistory),
  { loading: () => <HistoryListSkeleton /> }
);

function HistoryListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("download");
  const session = await requireAuth(locale);

  const rows = await prisma.downloadJob.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      url: true,
      type: true,
      formatLabel: true,
      status: true,
      phase: true,
      progress: true,
      downloadProgress: true,
      convertProgress: true,
      errorCode: true,
      fileName: true,
      fileSize: true,
      createdAt: true,
      completedAt: true,
      expiresAt: true,
    },
  });

  const now = new Date();
  const initialJobs: HistoryJob[] = rows.map((job) => {
    const expired = job.expiresAt < now && job.status === "ready";
    return {
      id: job.id,
      title: job.title,
      url: job.url,
      type: job.type,
      formatLabel: job.formatLabel,
      status: expired ? "expired" : job.status,
      phase: expired ? "expired" : job.phase,
      progress: job.progress,
      downloadProgress: job.downloadProgress,
      convertProgress: job.convertProgress,
      errorCode: job.errorCode,
      fileName: job.fileName,
      fileSize: job.fileSize?.toString() ?? null,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
      canDownload: !expired && job.status === "ready" && !!job.fileName,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("historyTitle")}</h1>
        <p className="text-sm text-[var(--muted)] mt-1">{t("historySubtitle")}</p>
      </div>
      <DownloadHistory initialJobs={initialJobs} />
    </div>
  );
}
