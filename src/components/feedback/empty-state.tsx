import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

function EmptyVisual() {
  return (
    <svg
      viewBox="0 0 168 128"
      className="h-[7.5rem] w-auto"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="84" cy="108" rx="48" ry="8" fill="#fdba74" opacity="0.28" />
      <rect x="46" y="22" width="88" height="78" rx="18" fill="#ffedd5" />
      <rect x="54" y="16" width="80" height="74" rx="16" fill="#fff7ed" stroke="#fdba74" strokeWidth="1.5" />
      <rect x="38" y="28" width="92" height="72" rx="18" fill="white" stroke="#fb923c" strokeWidth="1.6" />
      <rect x="56" y="48" width="44" height="6" rx="3" fill="#fed7aa" />
      <rect x="56" y="62" width="32" height="6" rx="3" fill="#ffedd5" />
      <rect x="56" y="76" width="38" height="6" rx="3" fill="#ffedd5" />
      <circle cx="118" cy="86" r="18" fill="#f97316" />
      <circle cx="117" cy="84" r="6.5" stroke="white" strokeWidth="2" />
      <path d="M122 89.5 128 95.5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-16 text-center", className)}>
      <EmptyVisual />
      <p className="mt-6 text-[15px] font-semibold tracking-tight text-foreground">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
