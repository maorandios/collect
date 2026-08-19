import type { WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import { isBlankDraft, type WorkflowSetupState } from "@/lib/workflow/setup-state";

export function isSetupCollectingOrReview(setup: WorkflowSetupState | null | undefined) {
  return setup?.status === "collecting" || setup?.status === "review";
}

export function leftPaneDraft(draft: WorkflowDraftDefinition) {
  return draft;
}

export function leftPaneIsEmpty(setup: WorkflowSetupState | null | undefined, draft: WorkflowDraftDefinition) {
  if (!isBlankDraft(draft)) {
    return false;
  }
  return setup?.status !== "completed";
}

export function leftPaneShowsPendingBanner(
  setup: WorkflowSetupState | null | undefined,
  draft: WorkflowDraftDefinition,
) {
  return isSetupCollectingOrReview(setup) && !isBlankDraft(draft);
}

export function hidePublishActionsDuringSetup(
  setup: WorkflowSetupState | null | undefined,
  draft: WorkflowDraftDefinition,
) {
  return leftPaneIsEmpty(setup, draft);
}
