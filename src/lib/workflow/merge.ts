import type { WorkflowCompilerResult } from "@/lib/workflow/compiler-result";
import type { DraftSchedule, ReminderDecision, WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import { resolveEmailSubject } from "@/lib/workflow/email-subject";
import { userRequestedLockArea } from "@/lib/workflow/editor-locks";
import { resolveFileMimeTypes } from "@/lib/workflow/file-presets";
import { TIMEZONE, type WorkflowField } from "@/lib/workflow/schema";

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function extractEmails(message: string) {
  return (message.match(/[^\s@]+@[^\s@]+\.[^\s@]+/g) ?? []).filter(looksLikeEmail);
}

function extractReminderChoice(message: string): { decision: ReminderDecision; afterHours: number | null } | null {
  if (/ללא תזכורת/.test(message)) {
    return { decision: "declined", afterHours: null };
  }
  if (/אחרי שבוע/.test(message)) {
    return { decision: "enabled", afterHours: 168 };
  }
  if (/אחרי יומיים/.test(message)) {
    return { decision: "enabled", afterHours: 48 };
  }
  if (/אחרי יום/.test(message)) {
    return { decision: "enabled", afterHours: 24 };
  }
  return null;
}
function extractWeekday(message: string) {
  if (/יום ראשון/.test(message) || /(^|\s)ראשון(\s|$)/.test(message)) {
    return 0;
  }
  if (/יום שני/.test(message)) {
    return 1;
  }
  if (/יום שלישי/.test(message)) {
    return 2;
  }
  if (/יום רביעי/.test(message)) {
    return 3;
  }
  if (/יום חמישי/.test(message)) {
    return 4;
  }
  if (/יום שישי/.test(message)) {
    return 5;
  }
  if (/יום שבת/.test(message)) {
    return 6;
  }
  return null;
}

function extractTime(message: string) {
  const match = message.match(/(?:בשעה\s*)?(\d{1,2})[:.](\d{2})/);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function applyUserFacts(draft: WorkflowDraftDefinition, userMessage: string): WorkflowDraftDefinition {
  const emails = extractEmails(userMessage);
  const time = extractTime(userMessage);
  const weekday = extractWeekday(userMessage);
  let recipients = draft.recipients;
  if (emails.length > 0) {
    const targetIndex = recipients.findIndex((recipient) => recipient.name?.trim() && !recipient.email?.trim());
    if (targetIndex >= 0) {
      recipients = recipients.map((recipient, index) =>
        index === targetIndex ? { ...recipient, email: emails[0] } : recipient,
      );
    } else if (recipients.length === 1 && !recipients[0]?.email?.trim()) {
      recipients = [{ ...recipients[0], email: emails[0] }];
    }
  }
  let schedule = draft.schedule;
  if (schedule?.type === "weekly" && schedule.weekday == null && weekday != null) {
    schedule = { ...schedule, weekday, timezone: TIMEZONE };
  }
  if (time && schedule && (schedule.type === "monthly" || schedule.type === "weekly" || schedule.type === "once")) {
    if (!schedule.time) {
      schedule = { ...schedule, time, timezone: TIMEZONE };
    }
  }
  let reminder = draft.reminder;
  let reminderDecision = draft.reminderDecision;
  const reminderChoice = extractReminderChoice(userMessage);
  if (reminderChoice) {
    reminderDecision = reminderChoice.decision;
    reminder = {
      enabled: reminderChoice.decision === "enabled",
      afterHours: reminderChoice.afterHours,
      afterMinutes: reminder.enabled ? reminder.afterMinutes : null,
    };
  }
  return {
    ...draft,
    name: draft.name.trim() ? draft.name : "",
    recipients,
    schedule,
    reminder,
    reminderDecision,
  };
}

function emailAllowed(email: string, userMessage: string, previousEmails: Set<string>) {
  const normalized = email.toLowerCase();
  if (previousEmails.has(normalized)) {
    return true;
  }
  return userMessage.toLowerCase().includes(normalized);
}

function currentTime(schedule: DraftSchedule | undefined) {
  if (!schedule || !("time" in schedule)) {
    return null;
  }
  return schedule.time ?? null;
}

function mergeSchedule(
  current: DraftSchedule | undefined,
  result: WorkflowCompilerResult,
): DraftSchedule | undefined {
  const nextType = result.scheduleType === "unchanged" ? current?.type : result.scheduleType;
  if (!nextType) {
    return current;
  }

  if (nextType === "send_now" || nextType === "manual") {
    return { type: nextType };
  }

  const sameType = current?.type === nextType;
  const time = result.scheduleTime ?? (sameType ? currentTime(current) : null);

  if (nextType === "once") {
    const date = result.scheduleDate ?? (sameType && current?.type === "once" ? (current.date ?? null) : null);
    return { type: "once", date: date ?? null, time: time ?? null, timezone: TIMEZONE };
  }

  if (nextType === "weekly") {
    const weekday =
      result.scheduleWeekday ?? (sameType && current?.type === "weekly" ? (current.weekday ?? null) : null);
    return {
      type: "weekly",
      weekday: weekday ?? null,
      time: time ?? null,
      timezone: TIMEZONE,
    };
  }

  const day = result.scheduleDay ?? (sameType && current?.type === "monthly" ? (current.day ?? null) : null);
  return {
    type: "monthly",
    day: day ?? null,
    time: time ?? null,
    timezone: TIMEZONE,
  };
}

function mergeField(
  existing: WorkflowField,
  incoming: NonNullable<WorkflowCompilerResult["fields"]>[number],
  userMessage: string,
): WorkflowField {
  if (incoming.type === "file" || existing.type === "file") {
    const fromExisting = existing.type === "file" ? existing : null;
    const label = incoming.label || existing.label;
    return {
      id: existing.id,
      type: "file",
      label,
      required: incoming.required,
      helpText: incoming.helpText ?? existing.helpText,
      allowedMimeTypes: resolveFileMimeTypes({
        label,
        userMessage,
        incoming: incoming.allowedMimeTypes.length > 0 ? incoming.allowedMimeTypes : (fromExisting?.allowedMimeTypes ?? []),
      }),
      maxFiles: incoming.maxFiles ?? fromExisting?.maxFiles ?? 1,
      maxFileSizeMb: incoming.maxFileSizeMb ?? fromExisting?.maxFileSizeMb ?? 10,
    };
  }
  return {
    id: existing.id,
    type: incoming.type,
    label: incoming.label || existing.label,
    required: incoming.required,
    helpText: incoming.helpText ?? existing.helpText,
  };
}

function newField(
  incoming: NonNullable<WorkflowCompilerResult["fields"]>[number],
  id: string,
  userMessage: string,
): WorkflowField {
  if (incoming.type === "file") {
    return {
      id,
      type: "file",
      label: incoming.label,
      required: incoming.required,
      helpText: incoming.helpText,
      allowedMimeTypes: resolveFileMimeTypes({
        label: incoming.label,
        userMessage,
        incoming: incoming.allowedMimeTypes,
      }),
      maxFiles: incoming.maxFiles ?? 1,
      maxFileSizeMb: incoming.maxFileSizeMb ?? 10,
    };
  }
  return {
    id,
    type: incoming.type,
    label: incoming.label,
    required: incoming.required,
    helpText: incoming.helpText,
  };
}

export function mergeWorkflowDraft({
  current,
  result,
  userMessage,
  mailboxId,
  createId = () => crypto.randomUUID(),
}: {
  current: WorkflowDraftDefinition;
  result: WorkflowCompilerResult;
  userMessage: string;
  mailboxId: string | null;
  createId?: () => string;
}): WorkflowDraftDefinition {
  const previousEmails = new Set(
    current.recipients
      .map((recipient) => recipient.email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email)),
  );
  const previousByName = new Map(
    current.recipients
      .filter((recipient) => recipient.name)
      .map((recipient) => [recipient.name!.trim(), recipient]),
  );

  let recipients = current.recipients;
  if (result.recipients) {
    recipients = result.recipients.map((incoming) => {
      const name = incoming.name?.trim() || null;
      const email = incoming.email?.trim() ?? "";
      if (email && looksLikeEmail(email) && emailAllowed(email, userMessage, previousEmails)) {
        return { name, organizationName: incoming.organizationName ?? previousByName.get(name ?? "")?.organizationName ?? null, email };
      }
      const previous = name ? previousByName.get(name) : undefined;
      return {
        name: name ?? previous?.name ?? null,
        organizationName: incoming.organizationName ?? previous?.organizationName ?? null,
        email: previous?.email ?? "",
      };
    });
  }

  const locks = current.editorLocks ?? {};
  const fieldsLocked = Boolean(locks.fields) && !userRequestedLockArea(userMessage, "fields");
  const removed = fieldsLocked ? new Set<string>() : new Set(result.removedFieldIds);
  const surviving = current.fields.filter((field) => !removed.has(field.id));
  const survivingById = new Map(surviving.map((field) => [field.id, field]));
  let fields = surviving;
  if (result.fields && !fieldsLocked) {
    const used = new Set<string>();
    const mergedFields: WorkflowDraftDefinition["fields"] = [];
    for (const incoming of result.fields) {
      const existing = incoming.id ? survivingById.get(incoming.id) : undefined;
      if (existing) {
        mergedFields.push(existing.type === "unconfigured" ? existing : mergeField(existing, incoming, userMessage));
        used.add(existing.id);
      } else {
        mergedFields.push(newField(incoming, createId(), userMessage));
      }
    }
    for (const field of surviving) {
      if (!used.has(field.id)) {
        mergedFields.push(field);
      }
    }
    fields = mergedFields;
  }

  const scheduleLocked = Boolean(locks.schedule) && !userRequestedLockArea(userMessage, "schedule");
  const recipientsLocked = Boolean(locks.recipients) && !userRequestedLockArea(userMessage, "recipients");
  const reminderLocked =
    Boolean(locks.reminder) ||
    current.reminderDecision === "declined" ||
    current.reminderDecision === "enabled";
  const compilerMaySetReminder = userRequestedLockArea(userMessage, "reminder") && !reminderLocked;

  const merged: WorkflowDraftDefinition = {
    version: 1,
    name:
      locks.name && !userRequestedLockArea(userMessage, "name")
        ? current.name
        : result.name?.trim() || current.name,
    senderMailboxId: mailboxId,
    recipientMode: result.recipientMode ?? current.recipientMode,
    recipients: recipientsLocked ? current.recipients : recipients,
    schedule: scheduleLocked ? current.schedule : mergeSchedule(current.schedule, result),
    email: {
      subject: resolveEmailSubject({
        incoming: result.emailSubject,
        current: current.email.subject,
        recipientNames: (recipientsLocked ? current.recipients : recipients).map((item) => item.name),
        userMessage,
        locked: Boolean(locks.emailSubject),
      }),
      body:
        locks.emailBody && !userRequestedLockArea(userMessage, "emailBody")
          ? current.email.body
          : result.emailBody?.trim() || current.email.body,
    },
    fields,
    reminder: compilerMaySetReminder
      ? {
          enabled: result.reminderEnabled ?? current.reminder.enabled,
          afterHours:
            result.reminderEnabled === false ? null : (result.reminderAfterHours ?? current.reminder.afterHours),
          afterMinutes: current.reminder.afterMinutes,
        }
      : current.reminder,
    reminderDecision: current.reminderDecision ?? "unset",
    emailEditingState: current.emailEditingState,
    draftReminder: current.draftReminder,
    intakeRequestId: current.intakeRequestId,
    editorLocks: current.editorLocks ?? {},
  };
  return applyUserFacts(merged, userMessage);
}
