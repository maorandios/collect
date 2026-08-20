import { he } from "@/lib/i18n/he";
import { unconfiguredField } from "@/lib/workflow/draft-fields";
import type { WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import { TIMEZONE } from "@/lib/workflow/schema";
import type { SetupChangePatch } from "@/lib/workflow/setup-extraction";
import {
  extractMonthDay,
  extractTime,
  extractWeekday,
  firstEmail,
  parseReminderChoice,
  parseTriggerType,
  validateEmail,
} from "@/lib/workflow/setup-parse";
import type { PendingEditTarget, SetupQuestion, WorkflowSetupState } from "@/lib/workflow/setup-state";

export type PointEditResult =
  | { kind: "complete"; patch: SetupChangePatch }
  | { kind: "clarify"; target: PendingEditTarget; question: SetupQuestion; patch: SetupChangePatch }
  | { kind: "unknown" };

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

function looksLikeScheduleEdit(message: string) {
  return /תזמון|מחזוריות|שליחה|חודש|שבוע|חד[\-־]?פעמי|ידני|בתאריך|בכל חודש|בשעה/.test(message);
}

function looksLikeRecipientEdit(message: string) {
  return /מייל|כתובת|נמען|איש קשר/.test(message);
}

function extractAddedLabel(message: string) {
  const match = message.match(/תוסי(?:ף|פי|פה)\s+(?:גם\s+)?[„"']?(.+?)[""']?\s*$/u) ?? message.match(/הוסף(?:י)?\s+(?:גם\s+)?[„"']?(.+?)[""']?\s*$/u);
  const label = match?.[1]?.replace(/^את\s+/u, "").trim();
  return label && label.length >= 2 ? label : null;
}

function normalizeFieldLabel(value: string) {
  return value.replace(/\s+/g, " ").replace(/ה(?=\S)/g, "").trim();
}

function extractRemovedLabel(message: string, fields: WorkflowDraftDefinition["fields"]) {
  const match = message.match(/(?:תוריד|הסר|תמחק)\s+(?:את\s+)?[„"']?(.+?)[""']?\s*$/u);
  const raw = match?.[1]?.trim() ?? "";
  if (!raw) {
    return null;
  }
  const normalized = normalizeFieldLabel(raw);
  const hit =
    fields.find((field) => field.label === raw) ??
    fields.find((field) => normalizeFieldLabel(field.label) === normalized) ??
    fields.find((field) => raw.includes(field.label) || field.label.includes(raw));
  return hit?.label ?? null;
}

function scheduleTypeQuestion(): SetupQuestion {
  return {
    key: "pending_edit_schedule_type",
    step: "trigger",
    question: he.studio.setup.askEditScheduleType,
    answerType: "single_choice",
    options: [
      { value: "once", label: he.studio.setup.triggerOnce },
      { value: "weekly", label: he.studio.setup.triggerWeekly },
      { value: "monthly", label: he.studio.setup.triggerMonthly },
      { value: "manual", label: he.studio.setup.triggerManual },
    ],
  };
}

export function reviewQuestion(): SetupQuestion {
  return {
    key: "review",
    step: "review",
    question: he.studio.setup.reviewPrompt,
    answerType: "confirmation",
    options: [
      { value: "apply", label: he.studio.setup.buildProcess },
      { value: "edit", label: he.studio.setup.changeDetails },
    ],
  };
}

export function stayInReview(state: WorkflowSetupState): WorkflowSetupState {
  return {
    ...state,
    status: "review",
    conversationMode: "review",
    pendingEdit: null,
    currentStep: "review",
    nextQuestion: reviewQuestion(),
    updatedAt: new Date().toISOString(),
  };
}

export function stayInEdit(state: WorkflowSetupState): WorkflowSetupState {
  return {
    ...state,
    status: "completed",
    conversationMode: "edit",
    pendingEdit: null,
    currentStep: "review",
    nextQuestion: null,
    updatedAt: new Date().toISOString(),
  };
}

export function classifyPointEdit(message: string, state: WorkflowSetupState): PointEditResult {
  const pending = state.pendingEdit;
  const mergedMessage = message.trim();
  const email = firstEmail(mergedMessage);
  const checked = email ? validateEmail(email.replace(/^[לכמב]־/, "")) : null;
  const normalizedEmail = checked?.valid ? checked.normalizedEmail : null;
  const weekday = extractWeekday(mergedMessage);
  const time = extractTime(mergedMessage, { allowBareHour: /שעה|בשעה|:/.test(mergedMessage) });
  const monthDay = extractMonthDay(mergedMessage, state.nextQuestion);
  const trigger = parseTriggerType(mergedMessage);
  const reminder = parseReminderChoice(mergedMessage);
  const added = extractAddedLabel(mergedMessage);
  const removed = extractRemovedLabel(mergedMessage, state.proposal.fields);

  if (pending?.target === "schedule") {
    const partial = (pending.partialPatch ?? {}) as Partial<SetupChangePatch>;
    const scheduleType = trigger ?? partial.scheduleType ?? null;
    if (!scheduleType) {
      return {
        kind: "clarify",
        target: "schedule",
        patch: emptyPatch({ target: "schedule_type", ...partial }),
        question: scheduleTypeQuestion(),
      };
    }
    return {
      kind: "complete",
      patch: emptyPatch({
        target: monthDay != null ? "month_day" : time ? "time" : "schedule_type",
        scheduleType,
        monthDay: monthDay ?? partial.monthDay ?? null,
        time: time ?? partial.time ?? null,
        weekday: weekday ?? partial.weekday ?? null,
      }),
    };
  }

  if (normalizedEmail && (looksLikeRecipientEdit(mergedMessage) || /@/.test(mergedMessage))) {
    return { kind: "complete", patch: emptyPatch({ target: "recipient_email", recipientEmail: normalizedEmail }) };
  }

  if (added) {
    return { kind: "complete", patch: emptyPatch({ target: "field_add", fieldLabel: added }) };
  }
  if (removed) {
    return { kind: "complete", patch: emptyPatch({ target: "field_remove", fieldLabel: removed }) };
  }

  if (weekday != null && (state.proposal.schedule?.type === "weekly" || /יום|שבוע/.test(mergedMessage))) {
    return { kind: "complete", patch: emptyPatch({ target: "weekday", weekday, time }) };
  }

  if (reminder && /תזכורת|אחרי|ללא/.test(mergedMessage)) {
    return {
      kind: "complete",
      patch: emptyPatch({
        target: "reminder",
        reminderEnabled: reminder.decision === "enabled",
        reminderAfterHours: reminder.afterHours,
      }),
    };
  }

  if (looksLikeScheduleEdit(mergedMessage) || trigger || monthDay != null || (time && /שעה|בשעה|:/.test(mergedMessage))) {
    if (/תזמון|מחזוריות|שליחה/.test(mergedMessage) && !trigger && monthDay == null && !time) {
      return {
        kind: "clarify",
        target: "schedule",
        patch: emptyPatch({ target: "schedule_type" }),
        question: scheduleTypeQuestion(),
      };
    }
    return {
      kind: "complete",
      patch: emptyPatch({
        target: monthDay != null ? "month_day" : time ? "time" : trigger ? "schedule_type" : weekday != null ? "weekday" : "schedule_type",
        scheduleType: trigger,
        monthDay,
        time,
        weekday,
      }),
    };
  }

  return { kind: "unknown" };
}

export function applyPointPatch(
  proposal: WorkflowDraftDefinition,
  patch: SetupChangePatch,
  createId: () => string = () => crypto.randomUUID(),
): WorkflowDraftDefinition {
  let next = proposal;
  if (patch.scheduleType) {
    const current = next.schedule;
    const time = patch.time ?? (current && "time" in current ? current.time : null);
    if (patch.scheduleType === "monthly") {
      const day =
        patch.monthDay ??
        (current && current.type === "monthly" ? current.day : null);
      next = {
        ...next,
        schedule: {
          type: "monthly",
          day,
          time,
          timezone: TIMEZONE,
          monthlyDayMode: day === 31 && current && current.type === "monthly" ? current.monthlyDayMode : "specific_day",
        },
      };
    } else if (patch.scheduleType === "weekly") {
      next = {
        ...next,
        schedule: {
          type: "weekly",
          weekday: patch.weekday ?? (current && current.type === "weekly" ? current.weekday : null),
          time,
          timezone: TIMEZONE,
        },
      };
    } else if (patch.scheduleType === "once") {
      next = {
        ...next,
        schedule: {
          type: "once",
          date: patch.date ?? (current && current.type === "once" ? current.date : null),
          time,
          timezone: TIMEZONE,
        },
      };
    } else if (patch.scheduleType === "manual") {
      next = { ...next, schedule: { type: "manual" } };
    } else {
      next = { ...next, schedule: { type: "send_now" } };
    }
  }
  if (patch.monthDay != null) {
    const current = next.schedule;
    const time = patch.time ?? (current && "time" in current ? current.time : null);
    next = {
      ...next,
      schedule: {
        type: "monthly",
        day: patch.monthDay,
        time,
        timezone: TIMEZONE,
        monthlyDayMode: "specific_day",
      },
    };
  }
  if (patch.weekday != null) {
    const current = next.schedule;
    const time = patch.time ?? (current && "time" in current ? current.time : null);
    next = {
      ...next,
      schedule: {
        type: "weekly",
        weekday: patch.weekday,
        time,
        timezone: TIMEZONE,
      },
    };
  }
  if (patch.time && next.schedule && next.schedule.type !== "manual" && next.schedule.type !== "send_now") {
    next = { ...next, schedule: { ...next.schedule, time: patch.time, timezone: TIMEZONE } };
  }
  if (patch.recipientEmail) {
    const current = next.recipients[0];
    next = {
      ...next,
      recipientMode: next.recipientMode ?? "fixed",
      recipients: [{ name: current?.name ?? "", organizationName: current?.organizationName ?? null, email: patch.recipientEmail }],
    };
  }
  if (patch.recipientName) {
    const current = next.recipients[0];
    next = {
      ...next,
      recipientMode: next.recipientMode ?? "fixed",
      recipients: [{ name: patch.recipientName, organizationName: current?.organizationName ?? null, email: current?.email ?? "" }],
    };
  }
  if (patch.reminderEnabled != null) {
    next = {
      ...next,
      reminder: {
        enabled: patch.reminderEnabled,
        afterHours: patch.reminderEnabled ? (patch.reminderAfterHours ?? 24) : null,
      },
      reminderDecision: patch.reminderEnabled ? "enabled" : "declined",
    };
  }
  if (patch.target === "field_add" && patch.fieldLabel) {
    if (!next.fields.some((field) => field.label === patch.fieldLabel)) {
      next = { ...next, fields: [...next.fields, unconfiguredField(createId(), patch.fieldLabel)] };
    }
  }
  if (patch.target === "field_remove" && patch.fieldLabel) {
    next = { ...next, fields: next.fields.filter((field) => field.label !== patch.fieldLabel && field.id !== patch.fieldId) };
  }
  return next;
}

export function pointEditAck(patch: SetupChangePatch, proposal: WorkflowDraftDefinition) {
  const schedule = proposal.schedule;
  if (patch.target === "field_add" && patch.fieldLabel) {
    return he.studio.setup.addedUnconfiguredField.replace("{label}", patch.fieldLabel);
  }
  if (patch.target === "field_remove" && patch.fieldLabel) {
    return he.studio.setup.removedField.replace("{label}", patch.fieldLabel);
  }
  if (patch.target === "weekday" || patch.weekday != null) {
    return he.studio.setup.updatedWeekday;
  }
  if (patch.recipientEmail) {
    return he.studio.setup.updatedEmailTo.replace("{email}", patch.recipientEmail);
  }
  if (patch.reminderEnabled != null) {
    return he.studio.setup.updatedReminder;
  }
  if (schedule?.type === "monthly" && schedule.day != null && schedule.time) {
    return he.studio.setup.updatedMonthlySend.replace("{day}", String(schedule.day)).replace("{time}", schedule.time);
  }
  if (patch.time && schedule && "time" in schedule && schedule.time) {
    return he.studio.setup.updatedTime;
  }
  return he.studio.setup.updatedGeneric;
}

export function mergePointEdit(
  base: WorkflowDraftDefinition,
  latest: WorkflowDraftDefinition,
  patch: SetupChangePatch,
): { ok: true; draft: WorkflowDraftDefinition } | { ok: false } {
  const touchesSchedule = Boolean(patch.scheduleType || patch.monthDay != null || patch.weekday != null || patch.time || patch.date);
  const touchesRecipient = Boolean(patch.recipientEmail || patch.recipientName);
  const touchesReminder = patch.reminderEnabled != null;
  if (touchesSchedule && JSON.stringify(base.schedule) !== JSON.stringify(latest.schedule)) {
    return { ok: false };
  }
  if (touchesRecipient && JSON.stringify(base.recipients) !== JSON.stringify(latest.recipients)) {
    return { ok: false };
  }
  if (touchesReminder && JSON.stringify(base.reminder) !== JSON.stringify(latest.reminder)) {
    return { ok: false };
  }
  return { ok: true, draft: applyPointPatch(latest, patch) };
}
