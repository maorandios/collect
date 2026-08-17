"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, Settings, Workflow } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { he } from "@/lib/i18n/he";

import { signOut } from "@/app/(app)/actions";

const items = [
  { href: "/requests", label: he.nav.requests, icon: Inbox },
  { href: "/workflows", label: he.nav.workflows, icon: Workflow },
  { href: "/settings", label: he.nav.settings, icon: Settings },
];

export function AppSidebar({ email }: { email: string | null }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-e border-border bg-surface">
      <div className="px-6 py-6">
        <Link
          href="/requests"
          className="text-xl font-semibold tracking-tight text-foreground"
        >
          {he.productName}
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-hover font-medium text-foreground"
                  : "text-muted-foreground hover:bg-hover hover:text-foreground",
              )}
            >
              <Icon className="size-4" strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border px-4 py-4">
        {email ? (
          <p className="mb-3 truncate text-xs text-muted-foreground">{email}</p>
        ) : null}
        <form action={signOut}>
          <Button type="submit" variant="ghost" className="h-9 w-full justify-start">
            {he.actions.signOut}
          </Button>
        </form>
      </div>
    </aside>
  );
}
