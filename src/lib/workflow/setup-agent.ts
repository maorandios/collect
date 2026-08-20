import { he } from "@/lib/i18n/he";
import { emptyWorkflowDraft, type WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import { TIMEZONE } from "@/lib/workflow/schema";
import {
  cloneDraft,
  conversationModeOf,
  emptySetupState,
  type SetupQuestion,
  type SetupRequirement,
  type WorkflowSetupState,
} from "@/lib/workflow/setup-state";
import type { SetupChangePatch, SetupExtraction } from "@/lib/workflow/setup-extraction";
import { extractSetupFacts, companyNameFromOriginal, refineRequirementKind } from "@/lib/workflow/setup-extract";
import { syncProposalEmail } from "@/lib/workflow/setup-email";
import { advanceSetup } from "@/lib/workflow/setup-flow";
import { classifyPointEdit, pointEditAck, stayInEdit, stayInReview } from "@/lib/workflow/point-edit";
import { buildSetupAssistantMessage } from "@/lib/workflow/setup-copy";
import {
  answerLooksParsed,
  extractDate,
  extractMonthDay,
  extractTime,
  extractWeekday,
  parseMonthlyDayMode,
  parseTriggerType,
  validateEmail,
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
  contactPersonFromExtraction,
  isCompanyDerivedContact,
  statusFromIdentity,
  syncProposalWithIdentity,
  type RecipientIdentity,
} from "@/lib/workflow/setup-identity";

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
  if (conversationModeOf(previous) === "edit" || conversationModeOf(next) === "edit") {
    return next;
  }
  if ((conversationModeOf(previous) === "review" || conversationModeOf(next) === "review") && fieldsTouched) {
    return next;
  }
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
  const parsed = parseTriggerType(message);
  const mentioned =
    Boolean(parsed) ||
    extractWeekday(message) != null ||
    extractTime(message) != null ||
    extractMonthDay(message, null) != null ||
    extractDate(message) != null;
  if (!mentioned) {
    return proposal;
  }
  const type = parsed ?? (extraction && extraction.scheduleType !== "none" ? extraction.scheduleType : null);
  if (!type) {
    return proposal;
  }
  if (type === "monthly") {
    const day = extraction?.scheduleDay ?? extractMonthDay(message, null);
    return {
      ...proposal,
      schedule: {
        type: "monthly" as const,
        day,
        time: extraction?.scheduleTime ?? extractTime(message),
        timezone: TIMEZONE,
        ...(day != null ? { monthlyDayMode: parseMonthlyDayMode(message) } : {}),
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
  currentIdentity: RecipientIdentity,
  extraction: SetupExtraction | null,
  companyName: string | null,
  userMessage: string,
  email: string | null,
) {
  const organizationName =
    companyName?.trim() || currentIdentity.organizationName?.trim() || proposal.recipients[0]?.organizationName?.trim() || null;
  const person = contactPersonFromExtraction(userMessage, extraction?.contactPerson, organizationName);
  const extractedName = extraction?.recipientName?.trim() || "";
  const named =
    person ??
    (extractedName &&
    person === null &&
    contactPersonFromExtraction(userMessage, { value: extractedName, evidence: extractedName }, organizationName)
      ? { value: extractedName, evidence: extractedName }
      : null);
  let contactResolution = currentIdentity.contactResolution;
  let contactName = currentIdentity.contactName;
  if (named && !isCompanyDerivedContact(named.value, organizationName)) {
    contactName = named.value;
    contactResolution = "named";
  } else if (contactResolution === "named" && isCompanyDerivedContact(contactName, organizationName)) {
    contactName = null;
    contactResolution = "pending";
  }
  const nextEmail = extraction?.recipientEmail?.trim() || email || currentIdentity.email || proposal.recipients[0]?.email || null;
  const identity: RecipientIdentity = {
    organizationName,
    contactName: contactResolution === "named" ? contactName : null,
    contactResolution,
    email: nextEmail,
  };
  return { proposal: syncProposalWithIdentity(proposal, identity), identity };
}

export function ensureEmailCopy(proposal: WorkflowDraftDefinition) {
  return syncProposalEmail(proposal);
}

export function needsSetupAi(setup: WorkflowSetupState): "extract" | "change" | null {
  const mode = conversationModeOf(setup);
  if (mode === "edit" || mode === "review") {
    return null;
  }
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
    .filter((item) => !isNonBusinessFieldLabel(item.label))
    .map((item) => refineRequirementKind(item));
  const heuristicItems = facts.items
    .filter((item) => !isNonBusinessFieldLabel(item.label))
    .map((item) => refineRequirementKind(item));
  const lumpedHeuristic =
    heuristicItems.length === 1 &&
    extractedItems.filter((item) => labelsOverlap(heuristicItems[0]?.label ?? "", item.label)).length >= 2;
  const incoming =
    firstTurn && heuristicItems.length > 0 && !lumpedHeuristic
      ? [
          ...heuristicItems.map((item) => {
            const fromAi = extractedItems.find((existing) => labelsOverlap(existing.label, item.label));
            return fromAi && item.kind === "ambiguous" ? item : (fromAi ?? item);
          }),
          ...extractedItems.filter((item) => !heuristicItems.some((existing) => labelsOverlap(existing.label, item.label))),
        ]
      : [
          ...extractedItems,
          ...heuristicItems.filter((item) => !extractedItems.some((existing) => labelsOverlap(existing.label, item.label))),
        ];
  const requirements = mergeRequirements(current.requirements, incoming, createId, firstTurn);
  let proposal: WorkflowDraftDefinition = {
    ...current.proposal,
    fields: rebuildFields(requirements, current.proposal.fields, createId),
  };
  const appliedRecipient = applyRecipientFromFacts(
    proposal,
    current.recipientIdentity,
    extraction,
    companyNameFromOriginal(userMessage, extraction?.companyName ?? facts.companyName),
    userMessage,
    facts.emails[0] ?? null,
  );
  proposal = appliedRecipient.proposal;
  const identity = appliedRecipient.identity;
  proposal = applyScheduleFromMessage(proposal, userMessage, extraction);
  proposal = ensureEmailCopy(proposal);
  proposal = sanitizeProposalFields(proposal);
  const email = identity.email?.trim() ?? "";
  const checked = email ? validateEmail(email) : null;
  const pendingCorrection =
    checked && !checked.valid && checked.suggestion
      ? {
          original: email,
          suggested: checked.suggestion,
          reason: checked.reason,
          domain: email.includes("@") ? email.slice(email.lastIndexOf("@") + 1) : "",
          suggestedDomain: checked.suggestion.slice(checked.suggestion.lastIndexOf("@") + 1),
        }
      : null;
  if (pendingCorrection || (checked && !checked.valid)) {
    identity.email = null;
    proposal = syncProposalWithIdentity(proposal, identity);
  }
  const next = advanceSetup({
    ...current,
    requirements,
    proposal,
    pendingEmailCorrection: pendingCorrection,
    recipientIdentity: identity,
    contactPersonStatus: statusFromIdentity(identity),
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
      organizationName: next.proposal.recipients[0]?.organizationName ?? null,
      proposal: next.proposal,
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
  const mode = conversationModeOf(current);
  const firstTurn = current.requirements.length === 0 && current.proposal.fields.length === 0 && mode === "setup";

  if (mode === "review" || mode === "edit") {
    if (mode === "review" && (userMessage.trim() === he.studio.setup.buildProcess || userMessage.trim() === he.studio.setup.applyChanges)) {
      return { setup: current, assistantMessage: he.studio.setup.reviewPrompt, action: "apply" as const, invalid: false };
    }
    if (mode === "review" && userMessage.trim() === he.studio.setup.changeDetails) {
      const next = {
        ...stayInReview(current),
        nextQuestion: {
          key: "change" as const,
          step: "review" as const,
          question: he.studio.setup.askChange,
          answerType: "text" as const,
        },
      };
      return { setup: next, assistantMessage: he.studio.setup.askChange, invalid: false };
    }
    const classified = changePatch
      ? ({ kind: "complete" as const, patch: changePatch })
      : classifyPointEdit(userMessage, current);
    if (classified.kind === "clarify") {
      return {
        setup: {
          ...current,
          conversationMode: mode,
          pendingEdit: { target: classified.target, partialPatch: classified.patch },
          nextQuestion: classified.question,
          updatedAt: new Date().toISOString(),
        },
        assistantMessage: classified.question.question,
        invalid: false as const,
        appliedPatch: classified.patch,
      };
    }
    if (classified.kind === "unknown") {
      return {
        setup: current,
        assistantMessage: he.studio.setup.didNotUnderstandChange,
        invalid: true as const,
        needsAi: true,
      };
    }
    const patched = applyReviewPatch(current, classified.patch, createId);
    if (!patched) {
      return { setup: current, assistantMessage: he.studio.setup.didNotUnderstandChange, invalid: true as const, needsAi: true };
    }
    const next = mode === "edit" ? stayInEdit(patched) : stayInReview(patched);
    const guarded = enforceFieldsInvariant(current, next, {
      firstTurn: false,
      extraction: false,
      fieldsTouched: classified.patch.target.startsWith("field_"),
      question: previousQuestion,
    });
    if (!guarded) {
      return { setup: current, assistantMessage: he.studio.setup.fieldsInvariant, invalid: true as const };
    }
    return {
      setup: guarded,
      assistantMessage: pointEditAck(classified.patch, guarded.proposal),
      invalid: false as const,
      appliedPatch: classified.patch,
    };
  }

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
        proposal: guarded.proposal,
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
        needsAi: reduced.needsAi ?? true,
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
        proposal: guarded.proposal,
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
