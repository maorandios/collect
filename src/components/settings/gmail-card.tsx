"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { he } from "@/lib/i18n/he";

type MailboxStatus = "connected" | "disconnected" | "needs_reauth";

export function GmailCard({
  email,
  status,
  notice,
  reason,
}: {
  email: string | null;
  status: MailboxStatus;
  notice?: "connected" | "error";
  reason?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"connect" | "disconnect" | null>(null);

  const errorMessage =
    reason === "used"
      ? he.settings.gmailOAuthUsed
      : reason === "invalid"
        ? he.settings.gmailOAuthInvalid
        : reason
          ? he.settings.gmailConnectFailed
          : null;

  useEffect(() => {
    if (notice === "connected") {
      toast.success(he.toast.gmailConnected);
    }
    if (notice === "error" && errorMessage) {
      toast.error(errorMessage);
    }
  }, [notice, errorMessage]);

  async function connect() {
    setPending("connect");
    try {
      const response = await fetch("/api/nylas/connect", { method: "POST" });
      const payload = (await response.json()) as { url?: string; message?: string };
      if (!response.ok || !payload.url) {
        toast.error(payload.message ?? he.errors.gmailConnectFailed);
        return;
      }
      window.location.assign(payload.url);
    } catch {
      toast.error(he.errors.gmailConnectFailed);
    } finally {
      setPending(null);
    }
  }

  async function disconnect() {
    setPending("disconnect");
    try {
      const response = await fetch("/api/nylas/disconnect", { method: "POST" });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        toast.error(payload.message ?? he.errors.saveFailed);
        return;
      }
      toast.success(he.toast.gmailDisconnected);
      router.refresh();
    } catch {
      toast.error(he.errors.saveFailed);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h2 className="text-base font-medium">{he.settings.gmailTitle}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{he.settings.gmailDescription}</p>
      <div className="mt-6 flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
        <div>
          <p className="text-sm text-foreground">{email ?? he.settings.noMailbox}</p>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        {status === "connected" ? (
          <Button
            type="button"
            variant="outline"
            className="h-10"
            disabled={pending !== null}
            onClick={() => void disconnect()}
          >
            {pending === "disconnect" ? he.settings.disconnectingGmail : he.actions.disconnectGmail}
          </Button>
        ) : null}
        {status === "needs_reauth" ? (
          <Button type="button" className="h-10" disabled={pending !== null} onClick={() => void connect()}>
            {pending === "connect" ? he.settings.connectingGmail : he.actions.reconnectGmail}
          </Button>
        ) : null}
        {status === "disconnected" ? (
          <Button type="button" className="h-10" disabled={pending !== null} onClick={() => void connect()}>
            {pending === "connect" ? he.settings.connectingGmail : he.actions.connectGmail}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
