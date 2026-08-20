"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { buildWizardDraft, startEmptyWizardDraft } from "@/app/(app)/workflows/intake";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { he } from "@/lib/i18n/he";

const BUILD_REQUEST_KEY = "collects.wizard.intake.buildRequestId";
const BUILD_WORKFLOW_KEY = "collects.wizard.intake.buildWorkflowId";
const EMPTY_REQUEST_KEY = "collects.wizard.intake.emptyRequestId";
const EMPTY_WORKFLOW_KEY = "collects.wizard.intake.emptyWorkflowId";

function readId(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeId(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* ignore quota / private mode */
  }
}

function clearId(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function WizardIntake() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState<"build" | "empty" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const buildRequestId = useRef("");
  const emptyRequestId = useRef("");
  const buildWorkflowId = useRef<string | undefined>(undefined);
  const emptyWorkflowId = useRef<string | undefined>(undefined);

  function requestId(kind: "build" | "empty") {
    const ref = kind === "build" ? buildRequestId : emptyRequestId;
    const key = kind === "build" ? BUILD_REQUEST_KEY : EMPTY_REQUEST_KEY;
    if (ref.current) {
      return ref.current;
    }
    const existing = readId(key);
    if (existing) {
      ref.current = existing;
      return existing;
    }
    const next = crypto.randomUUID();
    ref.current = next;
    writeId(key, next);
    return next;
  }

  function rememberedWorkflowId(kind: "build" | "empty") {
    const ref = kind === "build" ? buildWorkflowId : emptyWorkflowId;
    if (ref.current) {
      return ref.current;
    }
    const stored = readId(kind === "build" ? BUILD_WORKFLOW_KEY : EMPTY_WORKFLOW_KEY) ?? undefined;
    ref.current = stored;
    return stored;
  }

  function rememberBuildWorkflow(workflowId: string) {
    buildWorkflowId.current = workflowId;
    writeId(BUILD_WORKFLOW_KEY, workflowId);
  }

  function rememberEmptyWorkflow(workflowId: string) {
    emptyWorkflowId.current = workflowId;
    writeId(EMPTY_WORKFLOW_KEY, workflowId);
  }

  function clearBuildSession() {
    clearId(BUILD_REQUEST_KEY);
    clearId(BUILD_WORKFLOW_KEY);
  }

  function clearEmptySession() {
    clearId(EMPTY_REQUEST_KEY);
    clearId(EMPTY_WORKFLOW_KEY);
  }

  function goToWizard(workflowId: string) {
    router.push(`/workflows/${workflowId}?step=items`);
  }

  async function onBuild() {
    if (pending || !description.trim()) {
      return;
    }
    setPending("build");
    setError(null);
    const result = await buildWizardDraft({
      clientRequestId: requestId("build"),
      description: description.trim(),
      workflowId: rememberedWorkflowId("build"),
    });
    if (!result.ok) {
      if (result.workflowId) {
        rememberBuildWorkflow(result.workflowId);
      }
      setError(result.message);
      setPending(null);
      return;
    }
    rememberBuildWorkflow(result.workflowId);
    clearBuildSession();
    goToWizard(result.workflowId);
  }

  async function onRetry() {
    await onBuild();
  }

  async function onContinueManually() {
    if (pending) {
      return;
    }
    const existing = rememberedWorkflowId("build");
    if (existing) {
      clearBuildSession();
      goToWizard(existing);
      return;
    }
    setPending("empty");
    const result = await startEmptyWizardDraft({
      clientRequestId: requestId("build"),
      workflowId: rememberedWorkflowId("build"),
    });
    if (!result.ok) {
      if (result.workflowId) {
        rememberBuildWorkflow(result.workflowId);
      }
      setError(result.message);
      setPending(null);
      return;
    }
    rememberBuildWorkflow(result.workflowId);
    clearBuildSession();
    goToWizard(result.workflowId);
  }

  async function onStartEmpty() {
    if (pending) {
      return;
    }
    setPending("empty");
    setError(null);
    const result = await startEmptyWizardDraft({
      clientRequestId: requestId("empty"),
      workflowId: rememberedWorkflowId("empty"),
    });
    if (!result.ok) {
      if (result.workflowId) {
        rememberEmptyWorkflow(result.workflowId);
      }
      setError(result.message);
      setPending(null);
      return;
    }
    rememberEmptyWorkflow(result.workflowId);
    clearEmptySession();
    goToWizard(result.workflowId);
  }

  const building = pending === "build";
  const busy = pending !== null;

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-10">
      <div className="w-full max-w-2xl space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-medium">{he.wizard.intakeTitle}</h1>
          <p className="text-sm text-muted-foreground">{he.wizard.intakeDescription}</p>
        </div>
        <Textarea
          value={description}
          disabled={busy}
          placeholder={he.wizard.intakePlaceholder}
          onChange={(event) => setDescription(event.target.value)}
          className="min-h-48 resize-none text-base [field-sizing:fixed] md:text-base"
        />
        {building ? <p className="text-center text-sm text-muted-foreground">{he.wizard.buildingDraft}</p> : null}
        {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          {error ? (
            <>
              <Button type="button" className="h-10 min-w-36" disabled={busy} onClick={() => void onRetry()}>
                {he.wizard.retry}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 min-w-36"
                disabled={busy}
                onClick={() => void onContinueManually()}
              >
                {he.wizard.continueManually}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                className="h-10 min-w-36"
                disabled={busy || !description.trim()}
                onClick={() => void onBuild()}
              >
                {he.wizard.buildDraft}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 min-w-36"
                disabled={busy}
                onClick={() => void onStartEmpty()}
              >
                {he.wizard.startEmpty}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
