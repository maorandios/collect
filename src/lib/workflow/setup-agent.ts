import { he } from "@/lib/i18n/he";
import { emptyWorkflowDraft, type WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import { resolveEmailSubject } from "@/lib/workflow/email-subject";
import { TIMEZONE } from "@/lib/workflow/schema";
import type { SetupChangePatch, SetupExtraction } from "@/lib/workflow/setup-extraction";
import { extractSetupFacts } from "@/lib/workflow/setup-extract";
import { advanceSetup } from "@/lib/workflow/setup-flow";
import { buildSetupAssistantMessage } from "@/lib/workflow/setup-copy";
import {
  answerLooksParsed,
  extractDate,
  extractMonthDay,
  extractPersonName,
  extractTime,
  extractWeekday,
  parseTriggerType,
  suggestEmailTypo,
} from "@/lib/workflow/setup-parse";
import {
  applyReviewPatch,
  classifyReviewChange,
  isDeterministicQuestion,
  rebuildFields,
  reduceSetupAnswer,
} from "@/lib/workflow/setup-reducer";
import {
  assertFieldsUnchanged,
  isNonBusinessFieldLabel,
  sanitizeProposalFields,
  validateProposalSemantics,
} from "@/lib/workflow/setup-validate";
import {
  cloneDraft,
  emptySetupState,
  type SetupQuestion,
  type SetupRequirement,
  type WorkflowSetupState,
} from "@/lib/workflow/setup-state";

function enforceFieldsInvariant(
  previous: WorkflowSetupState,
  next: WorkflowSetupState,
  {
    firstTurn,
    extraction,
    fieldsTouched,
    question,
  }: {
    firstTurn: boolean;
    extraction: boolean;
    fieldsTouched: boolean;
    question: SetupQuestion | null;
  },
) {
  const currentStep =
    firstTurn || extraction
      ? "requirements"
      : fieldsTouched && (question?.step === "field_types" || question?.key === "change" || question?.key === "review")
        ? question?.step === "field_types"
          ? "field_types"
          : "review_field_change"
        : previous.currentStep;
  if (currentStep === "requirements" || currentStep === "field_types" || currentStep === "review_field_change") {
    return next;
  }
  try {
    assertFieldsUnchanged(previous.proposal, next.proposal);
    return next;
  } catch {
    return null;
  }
}

function labelsOverlap(a: string, b: string) {
  const left = a.trim();
  const right = b.trim();
  return left === right || left.includes(right) || right.includes(left);
}

function mergeRequirements(
  current: SetupRequirement[],
  incoming: Array<Omit<SetupRequirement, "id"> & { id?: string }>,
  createId: () => string,
  replace: boolean,
) {
  const base = replace ? [] : [...current];
  for (const item of incoming) {
    if (base.some((existing) => labelsOverlap(existing.label, item.label))) {
      continue;
    }
    base.push({
      ...item,
      id: item.id && !item.id.startsWith("req-") ? item.id : createId(),
    });
  }
  return base;
}

function applyScheduleFromMessage(proposal: WorkflowDraftDefinition, message: string, extraction: SetupExtraction | null) {
  const mentioned =
    Boolean(parseTriggerType(message)) ||
    extractWeekday(message) != null ||
    extractTime(message) != null ||
    extractMonthDay(message, null) != null ||
    extractDate(message) != null;
  if (!mentioned) {
    return proposal;
  }
  const type = extraction && extraction.scheduleType !== "none" ? extraction.scheduleType : parseTriggerType(message);
  if (!type) {
    return proposal;
  }
  if (type === "monthly") {
    return {
      ...proposal,
      schedule: {
        type: "monthly" as const,
        day: extraction?.scheduleDay ?? extractMonthDay(message, null),
        time: extraction?.scheduleTime ?? extractTime(message),
        timezone: TIMEZONE,
      },
    };
  }
  if (type === "weekly") {
    return {
      ...proposal,
      schedule: {
        type: "weekly" as const,
        weekday: extraction?.scheduleWeekday ?? extractWeekday(message),
        time: extraction?.scheduleTime ?? extractTime(message),
        timezone: TIMEZONE,
      },
    };
  }
  if (type === "once") {
    return {
      ...proposal,
      schedule: {
        type: "once" as const,
        date: extraction?.scheduleDate ?? extractDate(message),
        time: extraction?.scheduleTime ?? extractTime(message),
        timezone: TIMEZONE,
      },
    };
  }
  if (type === "manual") {
    return { ...proposal, schedule: { type: "manual" as const }, recipientMode: proposal.recipientMode ?? "fixed" };
  }
  return { ...proposal, schedule: { type: "send_now" as const } };
}

function applyRecipientFromFacts(
  proposal: WorkflowDraftDefinition,
  extraction: SetupExtraction | null,
  companyName: string | null,
  personName: string | null,
  email: string | null,
) {
  const extractedName = extraction?.recipientName?.trim() ?? "";
  const safeExtracted =
    extractedName && extractedName !== "נהל" && extractedName !== "מנהל" ? extractedName : "";
  const name = safeExtracted || personName || companyName || proposal.recipients[0]?.name || "";
  const nextEmail = extraction?.recipientEmail?.trim() || email || proposal.recipients[0]?.email || "";
  if (!name && !nextEmail) {
    return proposal;
  }
  return {
    ...proposal,
    recipientMode: "fixed" as const,
    recipients: [{ name, email: nextEmail }],
  };
}

export function ensureEmailCopy(
  proposal: WorkflowDraftDefinition,
  userMessage: string,
  extraction: SetupExtraction | null,
) {
  const labels = proposal.fields.map((field) => field.label);
  const subject =
    extraction?.emailSubject?.trim() ||
    proposal.email.subject.trim() ||
    resolveEmailSubject({
      incoming: labels.length ? `בקשה ל${labels[0]}` : "",
      current: "",
      recipientNames: proposal.recipients.map((item) => item.name),
      userMessage,
      locked: false,
    });
  const body =
    extraction?.emailBody?.trim() ||
    proposal.email.body.trim() ||
    (labels.length ? `שלום,\nנא לצרף את ${labels.join(" ואת ")}.\nתודה.` : "");
  const name = extraction?.name?.trim() || proposal.name.trim() || (labels.length ? `איסוף ${labels[0]}` : "");
  return {
    ...proposal,
    name,
    email: { subject, body },
  };
}

export function needsSetupAi(setup: WorkflowSetupState): "extract" | "change" | null {
  const firstTurn = setup.requirements.length === 0 && setup.proposal.fields.length === 0;
  if (firstTurn || setup.nextQuestion?.key === "requirements") {
    return "extract";
  }
  if (setup.nextQuestion?.key === "change") {
    return "change";
  }
  if (isDeterministicQuestion(setup.nextQuestion)) {
    return null;
  }
  return "extract";
}

export function compactSetupForModel(setup: WorkflowSetupState) {
  return {
    status: setup.status,
    currentStep: setup.currentStep,
    question: setup.nextQuestion
      ? { key: setup.nextQuestion.key, step: setup.nextQuestion.step, question: setup.nextQuestion.question }
      : null,
    requirements: setup.requirements.map((item) => ({ id: item.id, label: item.label, kind: item.kind })),
    fields: setup.proposal.fields.map((field) => ({ id: field.id, type: field.type, label: field.label })),
    recipients: setup.proposal.recipients,
    schedule: setup.proposal.schedule ?? null,
    reminder: setup.proposal.reminder,
  };
}

export function applySetupExtraction({
  current,
  userMessage,
  extraction,
  createId = () => crypto.randomUUID(),
}: {
  current: WorkflowSetupState;
  userMessage: string;
  extraction: SetupExtraction | null;
  createId?: () => string;
}) {
  const firstTurn = current.requirements.length === 0 && current.proposal.fields.length === 0;
  const facts = extractSetupFacts(userMessage);
  const extractedItems = (extraction?.items ?? [])
    .map((item) => ({
      label: item.label,
      kind: item.kind,
      filePreset: item.filePreset ?? undefined,
    }))
    .filter((item) => !isNonBusinessFieldLabel(item.label));
  const heuristicItems = facts.items.filter((item) => !isNonBusinessFieldLabel(item.label));
  const incoming = [
    ...extractedItems,
    ...heuristicItems.filter(
      (item) => !extractedItems.some((existing) => labelsOverlap(existing.label, item.label)),
    ),
  ];
  const requirements = mergeRequirements(current.requirements, incoming, createId, firstTurn);
  let proposal: WorkflowDraftDefinition = {
    ...current.proposal,
    fields: rebuildFields(requirements, current.proposal.fields, createId),
  };
  proposal = applyRecipientFromFacts(
    proposal,
    extraction,
    extraction?.companyName ?? facts.companyName,
    extractPersonName(userMessage),
    facts.emails[0] ?? null,
  );
  proposal = applyScheduleFromMessage(proposal, userMessage, extraction);
  proposal = ensureEmailCopy(proposal, userMessage, extraction);
  proposal = sanitizeProposalFields(proposal);
  const email = proposal.recipients[0]?.email?.trim() ?? "";
  const typo = email ? suggestEmailTypo(email) : null;
  if (typo) {
    proposal = {
      ...proposal,
      recipients: proposal.recipients.map((item, index) => (index === 0 ? { ...item, email: "" } : item)),
    };
  }
  const next = advanceSetup({
    ...current,
    requirements,
    proposal,
    pendingEmailCorrection: typo,
    updatedAt: new Date().toISOString(),
  });
  if (next.status === "review" && !validateProposalSemantics(next.proposal).ok) {
    return {
      setup: current,
      assistantMessage: he.studio.setup.setupInvalid,
      invalid: true as const,
    };
  }
  return {
    setup: next,
    assistantMessage: buildSetupAssistantMessage({
      requirements: next.requirements,
      previousQuestion: current.nextQuestion,
      previousStatus: current.status,
      nextQuestion: next.nextQuestion,
      nextStatus: next.status,
      userMessage,
      firstTurn,
    }),
    invalid: false as const,
  };
}

export function applySetupUserTurn({
  current,
  userMessage,
  extraction = null,
  changePatch = null,
  createId = () => crypto.randomUUID(),
}: {
  current: WorkflowSetupState;
  userMessage: string;
  extraction?: SetupExtraction | null;
  changePatch?: SetupChangePatch | null;
  mailboxId?: string | null;
  createId?: () => string;
}) {
  const previousQuestion = current.nextQuestion;
  const firstTurn = current.requirements.length === 0 && current.proposal.fields.length === 0;

  if (changePatch) {
    const patched = applyReviewPatch(current, changePatch, createId);
    if (!patched) {
      return { setup: current, assistantMessage: he.studio.setup.didNotUnderstandChange, invalid: true };
    }
    const next = advanceSetup(patched);
    const guarded = enforceFieldsInvariant(current, next, {
      firstTurn: false,
      extraction: false,
      fieldsTouched: changePatch.target.startsWith("field_"),
      question: previousQuestion,
    });
    if (!guarded) {
      return { setup: current, assistantMessage: he.studio.setup.fieldsInvariant, invalid: true };
    }
    if (guarded.status === "review" && !validateProposalSemantics(guarded.proposal).ok) {
      return { setup: current, assistantMessage: he.studio.setup.setupInvalid, invalid: true };
    }
    return {
      setup: guarded,
      assistantMessage: buildSetupAssistantMessage({
        requirements: guarded.requirements,
        previousQuestion,
        previousStatus: current.status,
        nextQuestion: guarded.nextQuestion,
        nextStatus: guarded.status,
        userMessage,
        firstTurn: false,
        changeTarget: changePatch.target,
      }),
      invalid: false,
    };
  }

  if (firstTurn || extraction) {
    return applySetupExtraction({ current, userMessage, extraction, createId });
  }

  if (previousQuestion && (isDeterministicQuestion(previousQuestion) || previousQuestion.key === "change")) {
    const reduced = reduceSetupAnswer({
      setupState: current,
      question: previousQuestion,
      userAnswer: userMessage,
      createId,
    });
    if (!reduced.ok) {
      return {
        setup: current,
        assistantMessage: reduced.message,
        invalid: true,
        needsAi: true,
        action: undefined,
      };
    }
    if (reduced.action === "apply") {
      return { setup: current, assistantMessage: he.studio.setup.reviewPrompt, action: "apply" as const, invalid: false };
    }
    const next = advanceSetup(reduced.setup);
    const guarded = enforceFieldsInvariant(current, next, {
      firstTurn: false,
      extraction: false,
      fieldsTouched: reduced.fieldsTouched,
      question: previousQuestion,
    });
    if (!guarded) {
      return { setup: current, assistantMessage: he.studio.setup.fieldsInvariant, invalid: true };
    }
    if (guarded.status === "review" && !validateProposalSemantics(guarded.proposal).ok) {
      return { setup: current, assistantMessage: he.studio.setup.setupInvalid, invalid: true };
    }
    const changeTarget =
      previousQuestion.key === "review" || previousQuestion.key === "change"
        ? classifyReviewChange(userMessage, current)?.target ?? null
        : null;
    return {
      setup: guarded,
      assistantMessage: buildSetupAssistantMessage({
        requirements: guarded.requirements,
        previousQuestion,
        previousStatus: current.status,
        nextQuestion: guarded.nextQuestion,
        nextStatus: guarded.status,
        userMessage,
        firstTurn: false,
        changeTarget,
      }),
      action: reduced.action,
      invalid: false,
    };
  }

  return applySetupExtraction({ current, userMessage, extraction, createId });
}

export function startSetup(baseDraftRevision: number, existing: WorkflowDraftDefinition | null) {
  const proposal = existing && existing.fields.length > 0 ? cloneDraft(existing) : emptyWorkflowDraft();
  return advanceSetup(emptySetupState(baseDraftRevision, proposal));
}

export function questionCount(setup: WorkflowSetupState) {
  return setup.nextQuestion ? 1 : 0;
}

export function pendingNeedsAi(setup: WorkflowSetupState | null, hasMessages: boolean, lastUserText?: string) {
  if (!hasMessages || !setup || setup.requirements.length === 0) {
    return true;
  }
  if (setup.nextQuestion?.key === "review") {
    return false;
  }
  if (isDeterministicQuestion(setup.nextQuestion)) {
    return Boolean(lastUserText) && !answerLooksParsed(setup.nextQuestion, lastUserText ?? "");
  }
  return needsSetupAi(setup) != null;
}
