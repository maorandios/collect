"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { he } from "@/lib/i18n/he";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-full min-h-full flex-col items-center justify-center px-8 text-center">
      <h1 className="text-xl font-medium">{he.errors.generic}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {he.errors.notFoundDescription}
      </p>
      <Button type="button" className="mt-6" onClick={() => retry()}>
        {he.actions.retry}
      </Button>
    </div>
  );
}
