import { he } from "@/lib/i18n/he";
import type { WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import {
  completionBlockerMessages,
  getCompletionState,
  type CompletionOptions,
} from "@/lib/workflow/completion";

export function isGmailDisconnectedBlocker(message: string) {
  return message === he.studio.gmailDisconnected || message === he.statuses.needs_reauth;
}

export function getDraftBlockers(draft: WorkflowDraftDefinition, options: CompletionOptions) {
  return completionBlockerMessages(getCompletionState(draft, options));
}

export function computeReadyToPublish(
  draft: WorkflowDraftDefinition,
  options: CompletionOptions = { hasMailbox: false },
) {
  return getCompletionState(draft, options).readyToPublish;
}
