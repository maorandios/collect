import type { WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import {
  buildLoopAssistantMessage,
  getCompletionState,
  type CompletionOptions,
} from "@/lib/workflow/completion";

export function reconcileAssistantMessage(
  _modelMessage: string,
  draft: WorkflowDraftDefinition,
  options: CompletionOptions = { hasMailbox: false },
  extras: { status?: string; hasUnpublishedChanges?: boolean } = {},
) {
  const completion = getCompletionState(draft, options);
  return buildLoopAssistantMessage({
    draft,
    completion,
    status: extras.status,
    hasUnpublishedChanges: extras.hasUnpublishedChanges,
  });
}
