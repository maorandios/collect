import type { WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";

export type DraftSaveOk = {
  ok: true;
  draft: WorkflowDraftDefinition;
  revision: number;
  workflowId: string;
};

export type DraftSaveFail = {
  ok: false;
  status: number;
  message: string;
  draft?: WorkflowDraftDefinition;
  revision?: number;
  workflowId?: string;
};

export type DraftSaveResult = DraftSaveOk | DraftSaveFail;
export type DraftSaveStatus = "idle" | "saving" | "saved" | "error";

export function createDraftSaveQueue({
  debounceMs = 400,
  save,
  onStatus,
  onResult,
}: {
  debounceMs?: number;
  save: (input: {
    draft: WorkflowDraftDefinition;
    expectedRevision: number;
  }) => Promise<DraftSaveResult>;
  onStatus?: (status: DraftSaveStatus, message?: string) => void;
  onResult?: (result: DraftSaveResult) => void;
}) {
  let revision = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: WorkflowDraftDefinition | null = null;
  let running: Promise<void> = Promise.resolve();
  let stopped = false;

  function setStatus(status: DraftSaveStatus, message?: string) {
    onStatus?.(status, message);
  }

  async function drain() {
    while (!stopped && pending) {
      const draft = pending;
      pending = null;
      setStatus("saving");
      const result = await save({ draft, expectedRevision: revision });
      onResult?.(result);
      if (result.ok) {
        revision = result.revision;
        if (!pending) {
          setStatus("saved");
        }
      } else {
        if (typeof result.revision === "number") {
          revision = result.revision;
        }
        setStatus("error", result.message);
        return;
      }
    }
  }

  return {
    setRevision(next: number) {
      revision = next;
    },
    getRevision() {
      return revision;
    },
    enqueue(draft: WorkflowDraftDefinition) {
      pending = draft;
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        running = running.then(drain, drain);
      }, debounceMs);
    },
    flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      running = running.then(drain, drain);
      return running;
    },
    dispose() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
