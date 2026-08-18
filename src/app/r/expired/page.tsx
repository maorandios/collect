import { he } from "@/lib/i18n/he";

export default function RecipientExpiredPage() {
  return (
    <div className="flex h-dvh items-center justify-center bg-background p-6">
      <div className="max-w-md rounded-xl border border-border bg-surface p-8 text-center shadow-sm">
        <h1 className="text-xl font-medium">{he.recipient.expiredTitle}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{he.recipient.expiredBody}</p>
      </div>
    </div>
  );
}
