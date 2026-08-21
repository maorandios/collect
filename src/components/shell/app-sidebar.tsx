"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitCompare, LogOut, Settings, Star, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import { he } from "@/lib/i18n/he";

import { signOut } from "@/app/(app)/actions";

const items = [
  { href: "/requests", label: he.nav.requests, icon: Star },
  { href: "/workflows", label: he.nav.workflows, icon: GitCompare },
  { href: "/settings", label: he.nav.settings, icon: Settings },
];

const iconButtonClass =
  "flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors";

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-14 shrink-0 flex-col items-center border-e border-border bg-sidebar">
      <div className="flex h-20 w-full shrink-0 items-center justify-center">
        <Link
          href="/requests"
          aria-label={he.productName}
          className="flex size-10 items-center justify-center rounded-lg bg-zinc-700 text-zinc-100"
        >
          <Zap className="size-[25px]" strokeWidth={1.75} />
        </Link>
      </div>
      <nav className="flex w-full flex-col items-center gap-3 pt-8">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              title={item.label}
              className={cn(
                iconButtonClass,
                active ? "bg-white text-foreground shadow-sm" : "hover:text-foreground",
              )}
            >
              <Icon className="size-5" strokeWidth={1.7} />
            </Link>
          );
        })}
        <form action={signOut}>
          <button
            type="submit"
            aria-label={he.actions.signOut}
            title={he.actions.signOut}
            className={cn(iconButtonClass, "hover:text-foreground")}
          >
            <LogOut className="size-5" strokeWidth={1.7} />
          </button>
        </form>
      </nav>
    </aside>
  );
}
