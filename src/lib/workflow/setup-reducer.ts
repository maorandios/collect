import { he } from "@/lib/i18n/he";
import { emptyWorkflowDraft, type DraftField, type WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import { TIMEZONE } from "@/lib/workflow/schema";
import { applyPointPatch, classifyPointEdit, stayInReview } from "@/lib/workflow/point-edit";
import type { SetupChangePatch } from "@/lib/workflow/setup-extraction";
import {
  extractBareWeekdayName,
  extractDate,
  extractMonthDay,
  extractTime,
  extractWeekday,
  firstEmail,
  emailValidationMessage,
  looksLikeEmailAttempt,
  parseEmailTypoChoice,
  parseFieldKind,
  parseNoFixedContact,
  parseCompanyConfirm,
  parseMonthlyDayMode,
  parseReminderChoice,
  parseTriggerType,
  parseWeekdayOrMonthDayChoice,
  validateEmail,
  weekdayLabel,
} from "@/lib/workflow/setup-parse";
import { requirementToField } from "@/lib/workflow/setup-extract";
import { withSupportedFileField } from "@/lib/workflow/file-formats";
import {
  isCompanyDerivedContact,
  statusFromIdentity,
  syncProposalWithIdentity,
  type RecipientIdentity,
} from "@/lib/workflow/setup-identity";
import type { SetupQuestion, SetupRequirement, WorkflowSetupState } from "@/lib/workflow/setup-state";

export type ReduceSetupResult =
  | { ok: true; setup: WorkflowSetupState; action?: "apply"; fieldsTouched: boolean }
  | { ok: false; message: string; needsAi?: boolean };

function withProposal(state: WorkflowSetupState, proposal: WorkflowDraftDefinition): WorkflowSetupState {
  return { ...state, proposal, updatedAt: new Date().toISOString() };
}

function withIdentity(state: WorkflowSetupState, identity: RecipientIdentity, proposal?: WorkflowDraftDefinition): WorkflowSetupState {
  const nextProposal = syncProposalWithIdentity(proposal ?? state.proposal, identity);
  return {
    ...state,
    proposal: { ...nextProposal, fields: proposal?.fields ?? state.proposal.fields },
    recipientIdentity: identity,
    contactPersonStatus: statusFromIdentity(identity),
    updatedAt: new Date().toISOString(),
  };
}

export function rebuildFields(
  requirements: SetupRequirement[],
  current: DraftField[],
  createId: () => string,
) {
  const byLabel = new Map(current.map((field) => [field.label, field]));
  const byId = new Map(current.filter((field) => field.id).map((field) => [field.id as string, field]));
  const fields: DraftField[] = [];
  for (const item of requirements) {
    const existing = byLabel.get(item.label) ?? (item.id ? byId.get(item.id) : undefined);
    const next = requirementToField(item, existing?.id ?? createId());
    if (next) {
      fields.push(next);
    }
  }
  return fields;
}

function replaceRecipientEmail(proposal: WorkflowDraftDefinition, email: string): WorkflowDraftDefinition {
  const recipients =
    proposal.recipients.length === 0
      ? [{ name: "", organizationName: null, email }]
      : proposal.recipients.map((item, index) => (index === 0 ? { ...item, email } : item));
  return { ...proposal, recipientMode: proposal.recipientMode ?? "fixed", recipients };
}

function replaceScheduleTime(proposal: WorkflowDraftDefinition, time: string): WorkflowDraftDefinition {
  const schedule = proposal.schedule;
  if (!schedule || schedule.type === "manual" || schedule.type === "send_now") {
    return proposal;
  }
  return { ...proposal, schedule: { ...schedule, time, timezone: TIMEZONE } };
}

function replaceWeekday(proposal: WorkflowDraftDefinition, weekday: number): WorkflowDraftDefinition {
  const schedule = proposal.schedule;
  if (!schedule || schedule.type !== "weekly") {
    return {
      ...proposal,
      schedule: { type: "weekly", weekday, time: schedule && "time" in schedule ? schedule.time : null, timezone: TIMEZONE },
    };
  }
  return { ...proposal, schedule: { ...schedule, weekday, timezone: TIMEZONE } };
}

function replaceMonthDay(
  proposal: WorkflowDraftDefinition,
  day: number,
  monthlyDayMode: "end_of_month" | "specific_day" = "specific_day",
): WorkflowDraftDefinition {
  const schedule = proposal.schedule;
  if (!schedule || schedule.type !== "monthly") {
    return {
      ...proposal,
      schedule: { type: "monthly", day, time: schedule && "time" in schedule ? schedule.time : null, timezone: TIMEZONE, monthlyDayMode },
    };
  }
  return { ...proposal, schedule: { ...schedule, day, timezone: TIMEZONE, monthlyDayMode } };
}

function replaceDate(proposal: WorkflowDraftDefinition, date: string): WorkflowDraftDefinition {
  const schedule = proposal.schedule;
  if (!schedule || schedule.type !== "once") {
    return {
      ...proposal,
      schedule: { type: "once", date, time: schedule && "time" in schedule ? schedule.time : null, timezone: TIMEZONE },
    };
  }
  return { ...proposal, schedule: { ...schedule, date, timezone: TIMEZONE } };
}

function applyTrigger(proposal: WorkflowDraftDefinition, type: NonNullable<ReturnType<typeof parseTriggerType>>): WorkflowDraftDefinition {
  if (type === "monthly") {
    const day = proposal.schedule && proposal.schedule.type === "monthly" ? proposal.schedule.day : null;
    const time = proposal.schedule && "time" in proposal.schedule ? proposal.schedule.time : null;
    return { ...proposal, schedule: { type: "monthly", day, time, timezone: TIMEZONE } };
  }
  if (type === "weekly") {
    const weekday = proposal.schedule && proposal.schedule.type === "weekly" ? proposal.schedule.weekday : null;
    const time = proposal.schedule && "time" in proposal.schedule ? proposal.schedule.time : null;
    return { ...proposal, schedule: { type: "weekly", weekday, time, timezone: TIMEZONE } };
  }
  if (type === "once") {
    const date = proposal.schedule && proposal.schedule.type === "once" ? proposal.schedule.date : null;
    const time = proposal.schedule && "time" in proposal.schedule ? proposal.schedule.time : null;
    return { ...proposal, schedule: { type: "once", date, time, timezone: TIMEZONE } };
  }
  if (type === "manual") {
    return { ...proposal, schedule: { type: "manual" }, recipientMode: proposal.recipientMode ?? "fixed" };
  }
  return { ...proposal, schedule: { type: "send_now" } };
}

function applyKind(item: SetupRequirement, kind: NonNullable<ReturnType<typeof parseFieldKind>>): SetupRequirement {
  if (kind === "file") {
    return withSupportedFileField({ ...item, kind: "file", filePreset: item.filePreset ?? "all" });
  }
  if (kind === "confirmation") {
    return { ...item, kind: "confirmation", filePreset: undefined };
  }
  if (kind === "number") {
    return { ...item, kind: "number", filePreset: undefined };
  }
  return { ...item, kind: "text", filePreset: undefined };
}

function applyReminder(state: WorkflowSetupState, choice: NonNullable<ReturnType<typeof parseReminderChoice>>): WorkflowSetupState {
  return {
    ...state,
    reminderDecision: choice.decision,
    proposal: {
      ...state.proposal,
      reminder: { enabled: choice.decision === "enabled", afterHours: choice.afterHours },
      reminderDecision: choice.decision,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function applyReviewPatch(
  state: WorkflowSetupState,
  patch: SetupChangePatch,
  createId: () => string,
): WorkflowSetupState | null {
  const beforeFields = state.proposal.fields;
  let proposal = state.proposal;
  let requirements = state.requirements;
  let reminderDecision = state.reminderDecision;
  if (patch.target === "field_type" && patch.fieldType) {
    const match =
      requirements.find((item) => item.id === patch.fieldId) ??
      requirements.find((item) => item.label === patch.fieldLabel) ??
      requirements.find((item) => item.kind === "ambiguous");
    if (!match) {
      return null;
    }
    requirements = requirements.map((item) => (item.id === match.id ? applyKind(item, patch.fieldType!) : item));
    proposal = { ...proposal, fields: rebuildFields(requirements, proposal.fields, createId) };
  } else if (patch.target === "email_subject" && patch.emailSubject) {
    proposal = {
      ...proposal,
      email: { ...proposal.email, subject: patch.emailSubject },
      editorLocks: { ...proposal.editorLocks, emailSubject: true },
    };
  } else if (patch.target === "email_body" && patch.emailBody) {
    proposal = {
      ...proposal,
      email: { ...proposal.email, body: patch.emailBody },
      editorLocks: { ...proposal.editorLocks, emailBody: true },
    };
  } else if (patch.target === "name" && patch.name) {
    proposal = { ...proposal, name: patch.name };
  } else {
    const nextProposal = applyPointPatch(proposal, patch, createId);
    const hasAction = Boolean(
      patch.scheduleType ||
        patch.monthDay != null ||
        patch.weekday != null ||
        patch.time ||
        patch.date ||
        patch.recipientEmail ||
        patch.reminderEnabled != null ||
        patch.fieldLabel ||
        patch.fieldId,
    );
    if (!hasAction && JSON.stringify(nextProposal) === JSON.stringify(proposal)) {
      return null;
    }
    proposal = nextProposal;
    if (patch.target === "field_add" && patch.fieldLabel && !requirements.some((item) => item.label === patch.fieldLabel)) {
      requirements = [
        ...requirements,
        { id: createId(), label: patch.fieldLabel, kind: "ambiguous" },
      ];
    }
    if (patch.target === "field_remove" && (patch.fieldId || patch.fieldLabel)) {
      requirements = requirements.filter((item) => item.id !== patch.fieldId && item.label !== patch.fieldLabel);
    }
    if (patch.reminderEnabled != null) {
      reminderDecision = patch.reminderEnabled ? "enabled" : "declined";
    }
    if (patch.recipientEmail) {
      proposal = {
        ...proposal,
        recipientMode: proposal.recipientMode ?? "fixed",
        recipients: proposal.recipients.map((item, index) =>
          index === 0 ? { ...item, email: patch.recipientEmail! } : item,
        ),
      };
    }
  }
  const fieldsTouched =
    patch.target === "field_type" || patch.target === "field_add" || patch.target === "field_remove";
  if (!fieldsTouched) {
    proposal = { ...proposal, fields: beforeFields };
  }
  return {
    ...state,
    requirements,
    reminderDecision,
    proposal,
    recipientIdentity: patch.recipientEmail
      ? { ...state.recipientIdentity, email: patch.recipientEmail }
      : state.recipientIdentity,
    updatedAt: new Date().toISOString(),
  };
}

export function classifyReviewChange(message: string, state: WorkflowSetupState): SetupChangePatch | null {
  const email = firstEmail(message);
  if (email) {
    return {
      target: "recipient_email",
      recipientEmail: email,
      recipientName: null,
      weekday: null,
      time: null,
      monthDay: null,
      date: null,
      scheduleType: null,
      reminderEnabled: null,
      reminderAfterHours: null,
      fieldId: null,
      fieldType: null,
      fieldLabel: null,
      emailSubject: null,
      emailBody: null,
      name: null,
    };
  }
  const weekday = extractWeekday(message);
  if (weekday != null && (state.proposal.schedule?.type === "weekly" || /יום|שבוע/.test(message))) {
    return emptyPatch({ target: "weekday", weekday });
  }
  const time = extractTime(message, { allowBareHour: /שעה|בשעה|:/.test(message) });
  if (time && (/שעה|בשעה|:/.test(message) || /^\d{1,2}([:.]\d{2})?$/.test(message.trim()))) {
    return emptyPatch({ target: "time", time });
  }
  const day = extractMonthDay(message, state.nextQuestion);
  if (day != null && (state.proposal.schedule?.type === "monthly" || /בחודש/.test(message))) {
    return emptyPatch({ target: "month_day", monthDay: day });
  }
  const date = extractDate(message);
  if (date) {
    return emptyPatch({ target: "date", date });
  }
  const trigger = parseTriggerType(message);
  if (trigger && /שליחה|הפעלה|מתי|חודשי|שבועי|חד|ידני/.test(message)) {
    return emptyPatch({ target: "schedule_type", scheduleType: trigger });
  }
  const reminder = parseReminderChoice(message);
  if (reminder && /תזכורת|אחרי|ללא/.test(message)) {
    return emptyPatch({
      target: "reminder",
      reminderEnabled: reminder.decision === "enabled",
      reminderAfterHours: reminder.afterHours,
    });
  }
  const kind = parseFieldKind(message);
  if (kind) {
    const ambiguous = state.requirements.find((item) => item.kind === "ambiguous");
    return emptyPatch({
      target: "field_type",
      fieldType: kind,
      fieldId: ambiguous?.id ?? null,
      fieldLabel: ambiguous?.label ?? null,
    });
  }
  return null;
}

function emptyPatch(overrides: Partial<SetupChangePatch> & Pick<SetupChangePatch, "target">): SetupChangePatch {
  return {
    target: overrides.target,
    recipientEmail: overrides.recipientEmail ?? null,
    recipientName: overrides.recipientName ?? null,
    weekday: overrides.weekday ?? null,
    time: overrides.time ?? null,
    monthDay: overrides.monthDay ?? null,
    date: overrides.date ?? null,
    scheduleType: overrides.scheduleType ?? null,
    reminderEnabled: overrides.reminderEnabled ?? null,
    reminderAfterHours: overrides.reminderAfterHours ?? null,
    fieldId: overrides.fieldId ?? null,
    fieldType: overrides.fieldType ?? null,
    fieldLabel: overrides.fieldLabel ?? null,
    emailSubject: overrides.emailSubject ?? null,
    emailBody: overrides.emailBody ?? null,
    name: overrides.name ?? null,
  };
}

export function isDeterministicQuestion(question: SetupQuestion | null) {
  if (!question) {
    return false;
  }
  if (question.step === "field_types" || question.step === "recipient" || question.step === "trigger") {
    return true;
  }
  if (question.step === "schedule_details" || question.step === "reminder") {
    return true;
  }
  if (question.key === "review") {
    return true;
  }
  return false;
}

export function reduceSetupAnswer({
  setupState,
  question,
  userAnswer,
  createId = () => crypto.randomUUID(),
}: {
  setupState: WorkflowSetupState;
  question: SetupQuestion;
  userAnswer: string;
  createId?: () => string;
}): ReduceSetupResult {
  const message = userAnswer.trim();
  const beforeFields = setupState.proposal.fields;

  if (question.key === "review" || question.key === "change" || setupState.status === "review") {
    if (message === he.studio.setup.buildProcess || message === he.studio.setup.applyChanges) {
      return { ok: true, setup: setupState, action: "apply", fieldsTouched: false };
    }
    if (message === he.studio.setup.changeDetails) {
      return {
        ok: true,
        fieldsTouched: false,
        setup: {
          ...stayInReview(setupState),
          nextQuestion: {
            key: "change",
            step: "review",
            question: he.studio.setup.askChange,
            answerType: "text",
          },
          updatedAt: new Date().toISOString(),
        },
      };
    }
    const classified = classifyPointEdit(message, setupState);
    if (classified.kind === "clarify") {
      return {
        ok: true,
        fieldsTouched: false,
        setup: {
          ...setupState,
          status: "review",
          conversationMode: "review",
          pendingEdit: { target: classified.target, partialPatch: classified.patch },
          nextQuestion: classified.question,
          updatedAt: new Date().toISOString(),
        },
      };
    }
    if (classified.kind === "unknown") {
      return { ok: false, message: he.studio.setup.didNotUnderstandChange, needsAi: true };
    }
    const patched = applyReviewPatch(setupState, classified.patch, createId);
    if (!patched) {
      return { ok: false, message: he.studio.setup.didNotUnderstandChange, needsAi: true };
    }
    return {
      ok: true,
      setup: stayInReview(patched),
      fieldsTouched: classified.patch.target.startsWith("field_"),
    };
  }

  if (question.step === "field_types") {
    const kind = parseFieldKind(message);
    if (!kind) {
      return { ok: false, message: he.studio.setup.didNotUnderstandFieldType };
    }
    const requirements = setupState.requirements.map((item) =>
      item.id === question.requirementId ? applyKind(item, kind) : item,
    );
    return {
      ok: true,
      fieldsTouched: true,
      setup: withProposal(
        { ...setupState, requirements },
        { ...setupState.proposal, fields: rebuildFields(requirements, setupState.proposal.fields, createId) },
      ),
    };
  }

  if (question.key === "company_confirm") {
    const choice = parseCompanyConfirm(message);
    if (!choice) {
      return { ok: false, message: he.studio.setup.didNotUnderstandChange };
    }
    if (choice === "change") {
      return {
        ok: true,
        fieldsTouched: false,
        setup: {
          ...setupState,
          awaitingCompanyName: true,
          pendingCompanyConfirm: null,
          proposal: { ...setupState.proposal, fields: beforeFields },
          updatedAt: new Date().toISOString(),
        },
      };
    }
    const confirmed = setupState.pendingCompanyConfirm?.trim() ?? "";
    const identity = {
      ...setupState.recipientIdentity,
      organizationName: confirmed || setupState.recipientIdentity.organizationName,
    };
    return {
      ok: true,
      fieldsTouched: false,
      setup: {
        ...withIdentity(setupState, identity, { ...setupState.proposal, fields: beforeFields }),
        pendingCompanyConfirm: null,
      },
    };
  }

  if (question.key === "company_name") {
    if (!message) {
      return { ok: false, message: he.studio.setup.didNotUnderstandChange };
    }
    const identity = { ...setupState.recipientIdentity, organizationName: message };
    return {
      ok: true,
      fieldsTouched: false,
      setup: {
        ...withIdentity(setupState, identity, { ...setupState.proposal, fields: beforeFields }),
        pendingCompanyConfirm: null,
        awaitingCompanyName: false,
      },
    };
  }

  if (question.key === "recipient_contact" || question.key === "contact_name") {
    if (parseNoFixedContact(message) || message === he.studio.setup.noFixedContact) {
      const identity: RecipientIdentity = {
        ...setupState.recipientIdentity,
        contactName: null,
        contactResolution: "no_fixed_contact",
      };
      return {
        ok: true,
        fieldsTouched: false,
        setup: withIdentity(setupState, identity, { ...setupState.proposal, fields: beforeFields }),
      };
    }
    if (!message || isCompanyDerivedContact(message, setupState.recipientIdentity.organizationName)) {
      return { ok: false, message: he.studio.setup.didNotUnderstandChange };
    }
    const identity: RecipientIdentity = {
      ...setupState.recipientIdentity,
      contactName: message,
      contactResolution: "named",
    };
    return {
      ok: true,
      fieldsTouched: false,
      setup: withIdentity(setupState, identity, { ...setupState.proposal, fields: beforeFields }),
    };
  }

  if (question.key === "email_typo") {
    const pending = setupState.pendingEmailCorrection;
    const choice = parseEmailTypoChoice(message);
    if (choice === "rewrite") {
      return {
        ok: true,
        fieldsTouched: false,
        setup: { ...setupState, pendingEmailCorrection: null, updatedAt: new Date().toISOString() },
      };
    }
    if (choice === "confirm" && pending?.suggested) {
      return {
        ok: true,
        fieldsTouched: false,
        setup: {
          ...withIdentity(setupState, { ...setupState.recipientIdentity, email: pending.suggested }, { ...setupState.proposal, fields: beforeFields }),
          pendingEmailCorrection: null,
        },
      };
    }
    const typed = validateEmail(message);
    if (typed.valid) {
      return {
        ok: true,
        fieldsTouched: false,
        setup: {
          ...withIdentity(setupState, { ...setupState.recipientIdentity, email: typed.normalizedEmail }, { ...replaceRecipientEmail(setupState.proposal, typed.normalizedEmail), fields: beforeFields }),
          pendingEmailCorrection: null,
        },
      };
    }
    if (looksLikeEmailAttempt(message)) {
      return { ok: false, message: emailValidationMessage(typed), needsAi: false };
    }
    return { ok: false, message: he.studio.setup.didNotUnderstandEmail, needsAi: false };
  }

  if (question.key === "recipient_email" || question.answerType === "email") {
    const candidate = firstEmail(message) ?? (looksLikeEmailAttempt(message) ? message.replace(/\\@/g, "@").trim() : null);
    if (!candidate) {
      return { ok: false, message: he.studio.setup.didNotUnderstandEmail, needsAi: false };
    }
    const result = validateEmail(candidate);
    if (result.valid) {
      const next = withIdentity(
        setupState,
        { ...setupState.recipientIdentity, email: result.normalizedEmail },
        { ...replaceRecipientEmail(setupState.proposal, result.normalizedEmail), fields: beforeFields },
      );
      return {
        ok: true,
        setup: { ...next, pendingEmailCorrection: null },
        fieldsTouched: false,
      };
    }
    if (result.suggestion) {
      return {
        ok: true,
        fieldsTouched: false,
        setup: {
          ...setupState,
          pendingEmailCorrection: {
            original: candidate,
            suggested: result.suggestion,
            reason: result.reason,
            domain: candidate.includes("@") ? candidate.slice(candidate.lastIndexOf("@") + 1) : "",
            suggestedDomain: result.suggestion.slice(result.suggestion.lastIndexOf("@") + 1),
          },
          proposal: { ...setupState.proposal, fields: beforeFields },
          updatedAt: new Date().toISOString(),
        },
      };
    }
    return { ok: false, message: emailValidationMessage(result), needsAi: false };
  }

  if (question.key === "recipient") {
    const email = firstEmail(message);
    if (email) {
      return {
        ok: true,
        fieldsTouched: false,
        setup: withIdentity(
          setupState,
          { ...setupState.recipientIdentity, email },
          { ...setupState.proposal, fields: beforeFields },
        ),
      };
    }
    if (!message) {
      return { ok: false, message: he.studio.setup.didNotUnderstandChange };
    }
    return {
      ok: true,
      fieldsTouched: false,
      setup: withIdentity(
        setupState,
        { ...setupState.recipientIdentity, contactName: message, contactResolution: "named" },
        { ...setupState.proposal, fields: beforeFields },
      ),
    };
  }

  if (question.step === "trigger") {
    const type = parseTriggerType(message);
    if (!type) {
      return { ok: false, message: he.studio.setup.didNotUnderstandTrigger };
    }
    return {
      ok: true,
      fieldsTouched: false,
      setup: withProposal(setupState, { ...applyTrigger(setupState.proposal, type), fields: beforeFields }),
    };
  }

  if (question.key === "weekly_weekday") {
    const weekday = extractWeekday(message);
    if (weekday == null) {
      return { ok: false, message: he.studio.setup.didNotUnderstandWeekday };
    }
    return {
      ok: true,
      fieldsTouched: false,
      setup: withProposal(setupState, { ...replaceWeekday(setupState.proposal, weekday), fields: beforeFields }),
    };
  }

  if (question.key === "monthly_day") {
    const weekday = extractBareWeekdayName(message);
    if (weekday != null) {
      const monthDay = weekday + 1;
      return {
        ok: true,
        fieldsTouched: false,
        setup: {
          ...setupState,
          pendingWeekdayOrMonthDay: {
            weekday,
            monthDay,
            weekdayLabel: weekdayLabel(weekday) || message.trim(),
          },
          proposal: { ...setupState.proposal, fields: beforeFields },
          updatedAt: new Date().toISOString(),
        },
      };
    }
    const day = extractMonthDay(message, question);
    if (day == null) {
      return { ok: false, message: he.studio.setup.didNotUnderstandDay };
    }
    return {
      ok: true,
      fieldsTouched: false,
      setup: {
        ...withProposal(setupState, {
          ...replaceMonthDay(setupState.proposal, day, parseMonthlyDayMode(message)),
          fields: beforeFields,
        }),
        pendingWeekdayOrMonthDay: null,
      },
    };
  }

  if (question.key === "weekday_or_month_day") {
    const pending = setupState.pendingWeekdayOrMonthDay;
    const choice = parseWeekdayOrMonthDayChoice(message, pending);
    if (choice?.kind === "weekly" && pending) {
      return {
        ok: true,
        fieldsTouched: false,
        setup: {
          ...withProposal(setupState, {
            ...replaceWeekday(setupState.proposal, pending.weekday),
            fields: beforeFields,
          }),
          pendingWeekdayOrMonthDay: null,
        },
      };
    }
    if (choice?.kind === "month" && choice.day != null) {
      return {
        ok: true,
        fieldsTouched: false,
        setup: {
          ...withProposal(setupState, { ...replaceMonthDay(setupState.proposal, choice.day), fields: beforeFields }),
          pendingWeekdayOrMonthDay: null,
        },
      };
    }
    return { ok: false, message: question.question, needsAi: false };
  }

  if (question.key === "once_date") {
    const date = extractDate(message);
    if (!date) {
      return { ok: false, message: he.studio.setup.didNotUnderstandChange };
    }
    return {
      ok: true,
      fieldsTouched: false,
      setup: withProposal(setupState, { ...replaceDate(setupState.proposal, date), fields: beforeFields }),
    };
  }

  if (question.answerType === "time" || question.key.endsWith("_time")) {
    const time = extractTime(message, { allowBareHour: true });
    if (!time) {
      return { ok: false, message: he.studio.setup.didNotUnderstandTime };
    }
    return {
      ok: true,
      fieldsTouched: false,
      setup: withProposal(setupState, { ...replaceScheduleTime(setupState.proposal, time), fields: beforeFields }),
    };
  }

  if (question.step === "reminder") {
    const choice = parseReminderChoice(message);
    if (!choice) {
      return { ok: false, message: he.studio.setup.didNotUnderstandReminder };
    }
    const next = applyReminder(setupState, choice);
    return { ok: true, fieldsTouched: false, setup: { ...next, proposal: { ...next.proposal, fields: beforeFields } } };
  }

  return { ok: false, message: he.studio.setup.didNotUnderstandChange, needsAi: true };
}

export function blankProposal() {
  return emptyWorkflowDraft();
}
