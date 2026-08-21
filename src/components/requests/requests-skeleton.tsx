import { Star } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { he } from "@/lib/i18n/he";

export function RequestsSkeleton() {
  return (
    <div className="flex min-h-full flex-col overflow-x-hidden">
      <header className="flex h-20 shrink-0 items-center justify-between gap-4 border-b border-border bg-sidebar px-8">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <Star className="size-5 shrink-0" strokeWidth={1.7} />
            {he.requests.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{he.requests.subtitle}</p>
        </div>
        <Skeleton className="h-11 w-44 rounded-2xl" />
      </header>
      <section className="space-y-5 p-8">
        <div className="flex overflow-hidden rounded-2xl border border-border bg-surface">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="min-w-0 flex-1 px-5 py-4 not-first:border-s not-first:border-border">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-9 w-16" />
              <Skeleton className="mt-3 h-3 w-32" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-5 items-center">
          <Skeleton className="h-11 rounded-[12px] pe-3" />
          <div className="col-span-4 flex items-center gap-3">
            <Skeleton className="h-11 w-40 rounded-[12px]" />
            <Skeleton className="h-11 w-40 rounded-[12px]" />
            <Skeleton className="h-4 w-48" />
          </div>
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
