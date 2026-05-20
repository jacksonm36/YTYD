import { CardSkeleton } from "@/components/ui/Skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-[var(--border)]" />
      <CardSkeleton />
    </div>
  );
}
