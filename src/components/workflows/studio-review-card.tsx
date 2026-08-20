import { Button } from "@/components/ui/button";
import { he } from "@/lib/i18n/he";
import { buildSetupReviewModel } from "@/lib/workflow/setup-review";
import type { WorkflowSetupState } from "@/lib/workflow/setup-state";

export function StudioReviewCard({
  setup,
  hasExistingDraft,
  pending,
  onBuild,
  onChange,
}: {
  setup: WorkflowSetupState;
  hasExistingDraft: boolean;
  pending: boolean;
  onBuild: () => void;
  onChange: () => void;
}) {
  const review = buildSetupReviewModel(setup);
  return (
    <div className="space-y-4 rounded-xl border border-border bg-background p-4">
      <div>
        <p className="text-xs text-muted-foreground">{he.studio.setup.reviewCollect}</p>
        <ul className="mt-1 space-y-1 text-sm">
          {review.fields.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{he.studio.setup.reviewRecipient}</p>
        {review.organizationName ? (
          <p className="mt-1 text-sm">
            {he.studio.setup.reviewCompany}: {review.organizationName}
          </p>
        ) : null}
        <p className={review.organizationName ? "text-sm" : "mt-1 text-sm"}>
          {he.studio.setup.reviewContact}: {review.contactName}
        </p>
        <p className="text-sm">
          {he.studio.setup.reviewEmailAddress}:{" "}
          <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
            {review.email || he.studio.notSet}
          </span>
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{he.studio.setup.reviewTrigger}</p>
        <p className="mt-1 text-sm">{review.schedule}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{he.studio.setup.reviewReminder}</p>
        <p className="mt-1 text-sm">{review.reminder}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-10" disabled={pending} onClick={onBuild}>
          {hasExistingDraft ? he.studio.setup.applyChanges : he.studio.setup.buildProcess}
        </Button>
        <Button type="button" variant="outline" className="h-10" disabled={pending} onClick={onChange}>
          {he.studio.setup.changeDetails}
        </Button>
      </div>
    </div>
  );
}

export function reviewCardShowsEmailContent() {
  return false;
}