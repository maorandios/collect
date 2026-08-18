import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { he } from "@/lib/i18n/he";
import { cn } from "@/lib/utils";

export default function AppNotFound() {
  return (
    <div className="flex h-full min-h-full flex-col items-center justify-center px-8 text-center">
      <h1 className="text-xl font-medium">{he.errors.notFound}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {he.errors.notFoundDescription}
      </p>
      <Link href="/requests" className={cn(buttonVariants(), "mt-6")}>
        {he.actions.back}
      </Link>
    </div>
  );
}
