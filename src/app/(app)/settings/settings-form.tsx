"use client";

import { useState } from "react";
import { toast } from "sonner";

import { updateProfile } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { he } from "@/lib/i18n/he";

export function SettingsForm({
  email,
  displayName,
  businessName,
}: {
  email: string;
  displayName: string;
  businessName: string;
}) {
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    try {
      const result = await updateProfile(formData);
      if (result.ok) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error(he.errors.saveFailed);
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      action={onSubmit}
      className="rounded-xl border border-border bg-surface p-6 shadow-sm"
    >
      <h2 className="text-base font-medium">{he.settings.profileTitle}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {he.settings.profileDescription}
      </p>
      <div className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{he.auth.emailLabel}</Label>
          <Input id="email" className="h-10" value={email} disabled />
        </div>
        <div className="space-y-2">
          <Label htmlFor="displayName">{he.settings.displayName}</Label>
          <Input
            id="displayName"
            name="displayName"
            className="h-10"
            defaultValue={displayName}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="businessName">{he.settings.businessName}</Label>
          <Input
            id="businessName"
            name="businessName"
            className="h-10"
            defaultValue={businessName}
            placeholder={he.settings.businessNamePlaceholder}
          />
        </div>
      </div>
      <div className="mt-6">
        <Button type="submit" className="h-10 px-4" disabled={pending}>
          {pending ? he.loading.saving : he.actions.save}
        </Button>
      </div>
    </form>
  );
}
