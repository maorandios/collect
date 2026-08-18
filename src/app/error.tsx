"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { he } from "@/lib/i18n/he";

export default function RootError({
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
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-8 text-center">
      <h1 className="text-xl font-medium">{he.errors.generic}</h1>
      <Button type="button" className="mt-6" onClick={() => retry()}>
        {he.actions.retry}
      </Button>
    </div>
  );
}
