import type { StudioInitialState } from "@/lib/workflow/studio-state";

let stash: StudioInitialState | null = null;

export function stashStudioState(state: StudioInitialState) {
  stash = state;
}

export function takeStashedStudioState(workflowId: string) {
  if (!stash || stash.workflowId !== workflowId) {
    return null;
  }
  const current = stash;
  stash = null;
  return current;
}
