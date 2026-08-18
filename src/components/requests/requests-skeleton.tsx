import { Skeleton } from "@/components/ui/skeleton";
import { he } from "@/lib/i18n/he";

export function RequestsSkeleton() {
  return (
    <div className="min-h-full overflow-x-hidden">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-8 py-5">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{he.requests.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{he.requests.subtitle}</p>
        </div>
        <Skeleton className="h-11 w-36 rounded-[12px]" />
      </header>
      <section className="space-y-5 p-8">
        <div className="grid grid-cols-2 gap-3 min-[1440px]:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-[16px] border border-border bg-surface px-5 py-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-9 w-16" />
              <Skeleton className="mt-3 h-3 w-32" />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-11 min-w-[16rem] flex-1 rounded-[12px]" />
          <Skeleton className="h-11 w-32 rounded-[12px]" />
          <Skeleton className="h-11 w-40 rounded-[12px]" />
          <Skeleton className="h-11 w-28 rounded-[12px]" />
        </div>
        <div className="overflow-hidden rounded-[16px] border border-border bg-surface">
          <div className="h-10 bg-table-header" />
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="flex items-center gap-4 border-t border-border px-4 py-3">
              <Skeleton className="h-4 w-6" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
