"use client";

import { useEffect, useRef, type RefObject } from "react";
import { ArrowUp } from "lucide-react";

import { StudioReviewCard } from "@/components/workflows/studio-review-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { he } from "@/lib/i18n/he";
import { setupProgress } from "@/lib/workflow/setup-flow";
import { pendingNeedsAi as setupPendingNeedsAi } from "@/lib/workflow/setup-agent";
import type { WorkflowSetupState } from "@/lib/workflow/setup-state";
import type { WorkflowStatus } from "@/lib/workflow/lifecycle";
import type { StudioMessage } from "@/lib/workflow/studio-state";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  { id: "invoice", label: he.studio.examples.invoice, prompt: he.studio.examplePrompts.invoice },
  { id: "monthly", label: he.studio.examples.monthly, prompt: he.studio.examplePrompts.monthly },
  { id: "once", label: he.studio.examples.once, prompt: he.studio.examplePrompts.once },
] as const;

function SetupProgress({ setup }: { setup: WorkflowSetupState }) {
  const progress = setupProgress(setup);
  const currentLabel = progress.groups.find((item) => item.id === progress.current)?.label ?? "";
  return (
    <div className="border-b border-border px-5 py-3">
      <p className="mb-2 text-xs text-muted-foreground">
        {he.studio.setup.stepOf
          .replace("{current}", String(progress.current))
          .replace("{total}", String(progress.total))
          .replace("{label}", currentLabel)}
      </p>
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {progress.groups.map((group) => (
          <li key={group.id} className={group.done || group.id === progress.current ? "text-foreground" : "text-muted-foreground"}>
            {group.label}
            {group.done ? "  ✓" : `  ${group.id}`}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function StudioChatPane({
  messages,
  pending,
  composer,
  onComposerChange,
  onSend,
  onRetry,
  onExample,
  onBuild,
  onQuickReply,
  readOnly,
  tooLong,
  setupState,
  hasExistingDraft,
  composerRef,
}: {
  messages: StudioMessage[];
  pending: boolean;
  composer: string;
  onComposerChange: (value: string) => void;
  onSend: () => void;
  onRetry: () => void;
  onExample: (prompt: string) => void;
  onBuild: () => void;
  onQuickReply: (label: string) => void;
  readOnly: boolean;
  tooLong: boolean;
  setupState: WorkflowSetupState | null;
  hasExistingDraft: boolean;
  status: WorkflowStatus;
  composerRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const lastMessage = messages.at(-1);
  const lastUser = [...messages].reverse().find((item) => item.role === "user");
  const showRetry = lastMessage?.role === "error" && !pending && !readOnly;
  const showReview = !pending && setupState?.status === "review";
  const waitingForAi = pending && setupPendingNeedsAi(setupState, messages.length > 0, lastUser?.content);
  const quickReplyOptions =
    !pending &&
    !showReview &&
    lastMessage?.role === "assistant" &&
    setupState?.status === "collecting" &&
    setupState.nextQuestion?.options?.length
      ? setupState.nextQuestion.options
      : null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pending, showReview]);

  const placeholder =
    setupState?.nextQuestion && setupState.status !== "review"
      ? setupState.nextQuestion.question
      : he.studio.composerPlaceholder;

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-[2] flex-col overflow-hidden border-e border-border bg-surface">
      {setupState && messages.length > 0 ? <SetupProgress setup={setupState} /> : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
        <div className="mt-auto flex flex-col gap-3 px-5 py-6">
          {messages.length === 0 && !pending ? (
            <div className="space-y-5 text-center">
              <div>
                <h1 className="text-2xl font-semibold">{he.studio.chatTitle}</h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{he.studio.chatSubtitle}</p>
              </div>
              <div className="flex flex-col gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example.id}
                    type="button"
                    disabled={readOnly}
                    onClick={() => onExample(example.prompt)}
                    className="rounded-xl border border-border bg-background px-4 py-3 text-sm hover:border-primary hover:text-primary"
                  >
                    {example.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => {
                if (message.role === "error") {
                  return (
                    <div
                      key={message.id}
                      className="rounded-xl border border-destructive/30 bg-[#fde8e8] px-4 py-3 text-sm text-destructive"
                    >
                      <p>{message.content}</p>
                      {showRetry && lastMessage?.id === message.id ? (
                        <Button type="button" variant="outline" className="mt-3 h-9" onClick={onRetry}>
                          {he.actions.retry}
                        </Button>
                      ) : null}
                    </div>
                  );
                }
                const isUser = message.role === "user";
                const showReplies = !isUser && lastMessage?.id === message.id && quickReplyOptions;
                return (
                  <div key={message.id} className={cn("flex w-full flex-col", isUser ? "items-start" : "items-end")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6",
                        isUser ? "bg-primary text-primary-foreground" : "border border-border bg-background",
                      )}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                    {showReplies ? (
                      <div className="mt-2 flex max-w-[85%] flex-wrap justify-end gap-2">
                        {quickReplyOptions.map((option) => (
                          <Button
                            key={option.value}
                            type="button"
                            variant="outline"
                            className="h-9"
                            disabled={pending || readOnly}
                            onClick={() => onQuickReply(option.label)}
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {pending ? (
                <div className="flex justify-end">
                  <div className="rounded-2xl border border-border bg-background px-4 py-2 text-sm text-muted-foreground">
                    {waitingForAi ? he.studio.understanding : he.studio.savingTurn}
                  </div>
                </div>
              ) : null}
              {setupState?.conflict ? (
                <p className="rounded-xl border border-border bg-[#fde8e8] px-4 py-3 text-sm text-destructive">
                  {he.studio.setup.conflict}
                </p>
              ) : null}
              {showReview && setupState ? (
                <StudioReviewCard
                  setup={setupState}
                  hasExistingDraft={hasExistingDraft}
                  pending={pending}
                  onBuild={onBuild}
                  onChange={() => onQuickReply(he.studio.setup.changeDetails)}
                />
              ) : null}
            </>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {readOnly ? (
        <div className="border-t border-border px-5 py-4 text-sm text-muted-foreground">
          {he.studio.completedReadOnly}
        </div>
      ) : (
        <div className="border-t border-border p-4">
          <div className="rounded-xl border border-border bg-background p-2">
            <Textarea
              ref={composerRef}
              value={composer}
              disabled={pending}
              placeholder={placeholder}
              onChange={(event) => onComposerChange(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  onSend();
                }
              }}
              className="max-h-40 min-h-24 resize-none overflow-y-auto border-0 bg-transparent shadow-none [field-sizing:fixed] focus-visible:ring-0"
            />
            <div className="flex items-center justify-between gap-3 px-1 pb-1">
              <p className={cn("text-xs", tooLong ? "text-destructive" : "text-muted-foreground")}>
                {tooLong ? he.workflows.chatMessageTooLong : null}
              </p>
              <Button
                type="button"
                size="icon"
                className="size-9"
                disabled={pending || tooLong || composer.trim().length === 0}
                onClick={onSend}
                aria-label={he.studio.send}
              >
                <ArrowUp className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
