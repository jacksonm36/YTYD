export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-[var(--border)] ${className}`}
      aria-hidden
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
