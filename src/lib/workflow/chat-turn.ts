import { z } from "zod";

import { he } from "@/lib/i18n/he";
import { draftFromRecord, setupFromRecord, type ChatTurnStore } from "@/lib/workflow/chat-types";
import { type WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import {
  getCompletionState,
  type CompletionIssue,
  type MailboxCompletionStatus,
} from "@/lib/workflow/completion";
import { applySetupUserTurn, needsSetupAi, startSetup } from "@/lib/workflow/setup-agent";
import { mergePointEdit } from "@/lib/workflow/point-edit";
import { unsureMessage } from "@/lib/workflow/setup-copy";
import type { SetupAiUsage, SetupAnswerInterpretation, SetupChangePatch, SetupExtraction } from "@/lib/workflow/setup-extraction";
import { zeroSetupAiUsage } from "@/lib/workflow/setup-extraction";
import { canonicalAnswerForQuestion, SETUP_INTERPRET_MIN_CONFIDENCE } from "@/lib/workflow/setup-parse";
import { isDeterministicQuestion } from "@/lib/workflow/setup-reducer";
import { conversationModeOf, parseWorkflowSetupState, type SetupQuestion, type WorkflowSetupState } from "@/lib/workflow/setup-state";
import { getDraftBlockers } from "@/lib/workflow/readiness";

const MAX_MESSAGE_LENGTH = 4000;

const chatRequestSchema = z.object({
  workflowId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  clientTurnId: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative(),
  expectedSetupRevision: z.number().int().nonnegative().default(0),
  setupState: z.unknown().optional(),
});

export type SetupExtractInput = {
  userMessage: string;
  mailboxEmail: string | null;
  today: string;
  recent?: Array<{ role: "user" | "assistant"; content: string }>;
  setup?: WorkflowSetupState | null;
};

export type ChatTurnCompiler = {
  extract(input: SetupExtractInput): Promise<{ extraction: SetupExtraction; usage: SetupAiUsage }>;
  extractChange(input: SetupExtractInput & { setup: WorkflowSetupState }): Promise<{
    patch: SetupChangePatch;
    usage: SetupAiUsage;
  }>;
  interpretAnswer(input: {
    question: SetupQuestion;
    userMessage: string;
  }): Promise<{ interpretation: SetupAnswerInterpretation; usage: SetupAiUsage }>;
};

export type ChatTurnResult = {
  status: number;
  body: {
    message?: string;
    workflowId?: string;
    draft?: WorkflowDraftDefinition;
    revision?: number;
    assistantMessage?: string;
    blockers?: string[];
    warnings?: string[];
    readyToPublish?: boolean;
    conversationIssues?: CompletionIssue[];
    externalIssues?: CompletionIssue[];
    nextQuestions?: CompletionIssue[];
    draftComplete?: boolean;
    setupState?: WorkflowSetupState | null;
    nextQuestion?: SetupQuestion | null;
    setupConflict?: boolean;
    setupRevision?: number;
    aiUsed?: boolean;
    aiUsage?: SetupAiUsage;
    setupAction?: "apply";
  };
};

function asCompletionQuestion(question: SetupQuestion | null): CompletionIssue[] {
  if (!question || question.step === "review") {
    return [];
  }
  return [
    {
      key: question.key,
      category: question.step === "recipient" ? "recipient" : question.step === "reminder" ? "reminder" : "fields",
      resolution: "chat",
      message: question.question,
      question: question.question,
      answerType: question.answerType,
      options: question.options,
    },
  ];
}

function payload(
  record: { id: string; draft_revision: number; setup_revision?: number },
  draft: WorkflowDraftDefinition,
  setup: WorkflowSetupState | null,
  extra: Partial<ChatTurnResult["body"]> = {},
  options: { hasMailbox: boolean; mailboxStatus?: MailboxCompletionStatus },
): ChatTurnResult["body"] {
  const completion = getCompletionState(draft, {
    hasMailbox: options.hasMailbox,
    mailboxStatus: options.mailboxStatus,
  });
  return {
    workflowId: record.id,
    draft,
    revision: record.draft_revision,
    setupRevision: record.setup_revision ?? 0,
    blockers: getDraftBlockers(draft, {
      hasMailbox: options.hasMailbox,
      mailboxStatus: options.mailboxStatus,
    }),
    readyToPublish: completion.readyToPublish,
    conversationIssues: completion.conversationIssues,
    externalIssues: completion.externalIssues,
    nextQuestions: asCompletionQuestion(setup?.nextQuestion ?? null),
    draftComplete: setup?.status === "completed",
    setupState: setup,
    nextQuestion: setup?.nextQuestion ?? null,
    aiUsed: false,
    aiUsage: zeroSetupAiUsage(),
    ...extra,
  };
}

export async function runWorkflowChatTurn({
  userId,
  body,
  store,
  compiler,
  mailboxId,
  mailboxEmail,
  mailboxStatus,
  today = new Date().toISOString().slice(0, 10),
}: {
  userId: string;
  body: unknown;
  store: ChatTurnStore;
  compiler: ChatTurnCompiler;
  mailboxId: string | null;
  mailboxEmail: string | null;
  mailboxStatus?: MailboxCompletionStatus;
  today?: string;
}): Promise<ChatTurnResult> {
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((issue) => issue.path[0] === "message" && issue.code === "too_big");
    return {
      status: 400,
      body: { message: tooLong ? he.workflows.chatMessageTooLong : he.workflows.invalidChatRequest },
    };
  }

  const request = parsed.data;
  let record = request.workflowId ? await store.getOwned(request.workflowId, userId) : null;
  if (!request.workflowId) {
    record = await store.createDraft(userId);
  }
  if (!record) {
    return { status: 404, body: { message: he.errors.notFound } };
  }
  if (record.status === "completed") {
    return { status: 409, body: { message: he.errors.cannotChangeCompleted, workflowId: record.id } };
  }

  const hasMailbox = Boolean(mailboxId);
  const completionOptions = {
    hasMailbox,
    mailboxStatus: mailboxStatus ?? (hasMailbox ? "connected" : "disconnected"),
  } as const;
  const savedDraft = draftFromRecord(record);
  const existingAssistant = await store.findMessage(record.id, request.clientTurnId, "assistant");
  if (existingAssistant) {
    return {
      status: 200,
      body: payload(
        record,
        savedDraft,
        setupFromRecord(record),
        { assistantMessage: existingAssistant.content, warnings: [], aiUsed: false, aiUsage: zeroSetupAiUsage() },
        completionOptions,
      ),
    };
  }

  if (
    record.draft_revision !== request.expectedRevision ||
    (record.setup_revision ?? 0) !== request.expectedSetupRevision
  ) {
    return {
      status: 409,
      body: {
        message: he.workflows.revisionConflict,
        workflowId: record.id,
        draft: savedDraft,
        revision: record.draft_revision,
        setupRevision: record.setup_revision ?? 0,
        setupState: setupFromRecord(record),
      },
    };
  }

  let setup = setupFromRecord(record);
  if (!setup) {
    const fromClient = parseWorkflowSetupState(request.setupState);
    setup =
      fromClient.success && fromClient.data.status !== "completed" && fromClient.data.baseDraftRevision === record.draft_revision
        ? fromClient.data
        : startSetup(record.draft_revision, savedDraft);
  } else if (setup.status === "completed" || conversationModeOf(setup) === "edit") {
    setup = {
      ...setup,
      status: "completed",
      conversationMode: "edit",
      proposal: savedDraft,
      baseDraftRevision: record.draft_revision,
      nextQuestion: setup.pendingEdit ? setup.nextQuestion : null,
    };
  }
  if (conversationModeOf(setup) !== "edit" && setup.baseDraftRevision !== record.draft_revision) {
    return {
      status: 409,
      body: payload(
        record,
        savedDraft,
        { ...setup, conflict: true },
        { message: he.studio.setup.conflict, setupConflict: true },
        completionOptions,
      ),
    };
  }

  await store.insertMessage({
    workflowId: record.id,
    userId,
    clientTurnId: request.clientTurnId,
    role: "user",
    content: request.message,
  });

  let extraction: SetupExtraction | null = null;
  let changePatch: SetupChangePatch | null = null;
  let aiUsage = zeroSetupAiUsage();
  let applied: ReturnType<typeof applySetupUserTurn> | null = null;
  const mode = needsSetupAi(setup);

  if (mode === "extract") {
    try {
      const extracted = await compiler.extract({
        userMessage: request.message,
        mailboxEmail,
        today,
        setup: null,
      });
      extraction = extracted.extraction;
      aiUsage = extracted.usage;
    } catch {
      await store.insertMessage({
        workflowId: record.id,
        userId,
        clientTurnId: request.clientTurnId,
        role: "error",
        content: he.workflows.aiFailed,
      });
      return {
        status: 502,
        body: payload(record, savedDraft, setup, { message: he.workflows.aiFailed, warnings: [] }, completionOptions),
      };
    }
    applied = applySetupUserTurn({
      current: setup,
      userMessage: request.message,
      extraction,
      mailboxId,
    });
  } else {
    applied = applySetupUserTurn({
      current: setup,
      userMessage: request.message,
      mailboxId,
    });
    if (applied.invalid && applied.needsAi) {
      const question = setup.nextQuestion;
      const isChange =
        setup.status === "review" || question?.key === "change" || question?.key === "review";
      try {
        if (isChange || conversationModeOf(setup) === "review" || conversationModeOf(setup) === "edit") {
          const recent = (await store.listRecent(record.id, 6))
            .filter((item) => item.role === "user" || item.role === "assistant")
            .map((item) => ({ role: item.role as "user" | "assistant", content: item.content }))
            .slice(-2);
          const changed = await compiler.extractChange({
            userMessage: request.message,
            mailboxEmail,
            today,
            recent,
            setup,
          });
          changePatch = changed.patch;
          aiUsage = changed.usage;
          applied = applySetupUserTurn({
            current: setup,
            userMessage: request.message,
            changePatch,
            mailboxId,
          });
        } else if (question && isDeterministicQuestion(question)) {
          const interpreted = await compiler.interpretAnswer({
            question,
            userMessage: request.message,
          });
          aiUsage = interpreted.usage;
          const canonical =
            interpreted.interpretation.understood &&
            interpreted.interpretation.confidence >= SETUP_INTERPRET_MIN_CONFIDENCE &&
            interpreted.interpretation.canonicalValue
              ? canonicalAnswerForQuestion(question, interpreted.interpretation.canonicalValue)
              : null;
          if (canonical) {
            applied = applySetupUserTurn({
              current: setup,
              userMessage: canonical,
              mailboxId,
            });
          }
          if (!canonical || applied.invalid) {
            applied = {
              setup,
              assistantMessage: unsureMessage(question),
              invalid: true,
            };
          }
        }
      } catch {
        await store.insertMessage({
          workflowId: record.id,
          userId,
          clientTurnId: request.clientTurnId,
          role: "error",
          content: he.workflows.aiFailed,
        });
        return {
          status: 502,
          body: payload(record, savedDraft, setup, { message: he.workflows.aiFailed, warnings: [] }, completionOptions),
        };
      }
    }
  }

  if (!applied) {
    return {
      status: 500,
      body: { message: he.errors.saveFailed, workflowId: record.id },
    };
  }

  const persistEditDraft = conversationModeOf(applied.setup) === "edit";

  try {
    let draftForClient = persistEditDraft ? applied.setup.proposal : savedDraft;
    let expectedDraftRevision = request.expectedRevision;
    let setupToSave = applied.setup;

    if (persistEditDraft) {
      try {
        const edited = await store.applyEdit({
          workflowId: record.id,
          userId,
          expectedRevision: expectedDraftRevision,
          draft: applied.setup.proposal,
        });
        expectedDraftRevision = edited.newRevision;
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "revision_conflict") {
          throw error;
        }
        const latest = await store.getOwned(record.id, userId);
        const latestDraft = latest ? draftFromRecord(latest) : savedDraft;
        const patch = applied.appliedPatch ?? null;
        const merged = patch ? mergePointEdit(savedDraft, latestDraft, patch) : { ok: false as const };
        if (!merged.ok || !latest) {
          await store.insertMessage({
            workflowId: record.id,
            userId,
            clientTurnId: request.clientTurnId,
            role: "assistant",
            content: he.studio.setup.editConflict,
          });
          return {
            status: 200,
            body: payload(
              latest ?? record,
              latestDraft,
              latest ? setupFromRecord(latest) : setup,
              { assistantMessage: he.studio.setup.editConflict, warnings: [] },
              completionOptions,
            ),
          };
        }
        const edited = await store.applyEdit({
          workflowId: record.id,
          userId,
          expectedRevision: latest.draft_revision,
          draft: merged.draft,
        });
        expectedDraftRevision = edited.newRevision;
        draftForClient = merged.draft;
        setupToSave = { ...applied.setup, proposal: merged.draft };
      }
      setupToSave = {
        ...setupToSave,
        conversationMode: "edit",
        baseDraftRevision: expectedDraftRevision,
      };
    }

    const saved = await store.applySetupTurn({
      workflowId: record.id,
      userId,
      expectedDraftRevision,
      expectedSetupRevision: request.expectedSetupRevision,
      setup: setupToSave,
      clientTurnId: request.clientTurnId,
      assistantContent: applied.assistantMessage,
    });
    return {
      status: 200,
      body: payload(
        { ...record, draft_revision: persistEditDraft ? expectedDraftRevision : saved.draftRevision, setup_revision: saved.setupRevision },
        draftForClient,
        setupToSave,
        {
          assistantMessage: applied.assistantMessage,
          warnings: [],
          aiUsed: Boolean(aiUsage.model),
          aiUsage,
          setupAction: applied.action,
        },
        completionOptions,
      ),
    };
  } catch (error) {
    if (error instanceof Error && error.message === "revision_conflict") {
      const latest = await store.getOwned(record.id, userId);
      return {
        status: 409,
        body: {
          message: he.workflows.revisionConflict,
          workflowId: record.id,
          draft: latest ? draftFromRecord(latest) : savedDraft,
          revision: latest?.draft_revision ?? record.draft_revision,
          setupRevision: latest?.setup_revision ?? record.setup_revision ?? 0,
          setupState: latest ? setupFromRecord(latest) : setup,
        },
      };
    }
    return {
      status: 500,
      body: { message: he.errors.saveFailed, workflowId: record.id },
    };
  }
}
