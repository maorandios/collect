import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { he } from "@/lib/i18n/he";
import { cn } from "@/lib/utils";

export default function RootNotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-8 text-center">
      <h1 className="text-xl font-medium">{he.errors.notFound}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {he.errors.notFoundDescription}
      </p>
      <Link href="/" className={cn(buttonVariants(), "mt-6")}>
        {he.actions.back}
      </Link>
    </div>
  );
}
