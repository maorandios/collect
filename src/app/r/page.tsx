import { he } from "@/lib/i18n/he";
import { getRecipientRequest } from "@/lib/requests/recipient";
import { FormRenderer } from "@/components/forms/form-renderer";

export const dynamic = "force-dynamic";

export default async function RecipientFormPage() {
  const requestRow = await getRecipientRequest();

  if (!requestRow) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-xl border border-border bg-surface p-8 text-center">
          <h1 className="text-xl font-medium">{he.recipient.invalidTitle}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{he.recipient.missingSession}</p>
        </div>
      </div>
    );
  }

  if (requestRow.status === "completed") {
    return (
      <div className="flex h-dvh items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-xl border border-border bg-surface p-8 text-center">
          <h1 className="text-xl font-medium">{he.recipient.successTitle}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{he.recipient.completedAlready}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background p-6 py-12">
      <FormRenderer
        definition={requestRow.definition}
        senderName={requestRow.senderName}
        initialAnswers={requestRow.draftAnswers}
        initialFiles={requestRow.uploadedFiles}
      />
    </div>
  );
}
