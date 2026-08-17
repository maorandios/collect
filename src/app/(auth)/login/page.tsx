import { he } from "@/lib/i18n/he";
import { getPublicSupabaseConfig } from "@/lib/env";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  const { isConfigured } = getPublicSupabaseConfig();

  return (
    <div className="flex h-dvh w-full items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-sm">
        <p className="text-2xl font-semibold tracking-tight text-foreground">
          {he.productName}
        </p>
        <h1 className="mt-6 text-xl font-medium text-foreground">
          {he.auth.title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{he.auth.subtitle}</p>
        <div className="mt-8">
          <LoginForm isConfigured={isConfigured} />
        </div>
      </div>
    </div>
  );
}
