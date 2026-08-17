"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { he } from "@/lib/i18n/he";
import { createClient } from "@/lib/supabase/client";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapAuthError(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes("rate") || lower.includes("seconds")) {
    return he.auth.rateLimited;
  }

  if (
    lower.includes("invalid") ||
    lower.includes("otp") ||
    lower.includes("token") ||
    lower.includes("expired")
  ) {
    return he.auth.invalidCode;
  }

  return he.errors.generic;
}

export function LoginForm({ isConfigured }: { isConfigured: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function sendCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!isConfigured) {
      setError(he.auth.missingConfig);
      return;
    }

    const trimmedEmail = email.trim();
    if (!emailPattern.test(trimmedEmail)) {
      setError(he.auth.invalidEmail);
      return;
    }

    setPending(true);
    try {
      const supabase = createClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          shouldCreateUser: true,
        },
      });

      if (otpError) {
        setError(mapAuthError(otpError.message));
        return;
      }

      setEmail(trimmedEmail);
      setStep("code");
    } catch {
      setError(he.errors.generic);
    } finally {
      setPending(false);
    }
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!/^\d{6}$/.test(code.trim())) {
      setError(he.auth.codeRequired);
      return;
    }

    setPending(true);
    try {
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code.trim(),
        type: "email",
      });

      if (verifyError) {
        setError(mapAuthError(verifyError.message));
        return;
      }

      router.replace("/requests");
      router.refresh();
    } catch {
      setError(he.errors.generic);
    } finally {
      setPending(false);
    }
  }

  if (step === "code") {
    return (
      <form className="space-y-5" onSubmit={verifyCode}>
        <p className="text-sm text-muted-foreground">
          {he.auth.codeSentTo.replace("{email}", email)}
        </p>
        <div className="space-y-2">
          <Label htmlFor="otp">{he.auth.codeLabel}</Label>
          <Input
            id="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className="h-10 tracking-[0.4em]"
            value={code}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder={he.auth.codePlaceholder}
            required
          />
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-3">
          <Button type="submit" size="lg" className="h-10" disabled={pending}>
            {pending ? he.auth.verifying : he.actions.verifyCode}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-10"
            disabled={pending}
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
          >
            {he.actions.back}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form className="space-y-5" onSubmit={sendCode}>
      <div className="space-y-2">
        <Label htmlFor="email">{he.auth.emailLabel}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          className="h-10"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={he.auth.emailPlaceholder}
          required
        />
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="h-10 w-full" disabled={pending}>
        {pending ? he.auth.sendingCode : he.actions.sendCode}
      </Button>
    </form>
  );
}
