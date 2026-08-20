import {
  emptyEmailEditingState,
  withDraftRecipient,
  withDraftReminder,
} from "@/lib/workflow/draft-canonical";
import { unconfiguredField } from "@/lib/workflow/draft-fields";
import {
  emptyWorkflowDraft,
  type DraftReminder,
  type WorkflowDraftDefinition,
} from "@/lib/workflow/draft-schema";
import type { InitialWorkflowExtraction } from "@/lib/workflow/intake-extraction";
import { sanitizeInitialExtraction } from "@/lib/workflow/intake-sanitize";
import { TIMEZONE } from "@/lib/workflow/schema";
import { companyNameFromOriginal, extractRequirementItems } from "@/lib/workflow/setup-extract";
import { syncProposalEmail } from "@/lib/workflow/setup-email";
import { contactPersonFromExtraction } from "@/lib/workflow/setup-identity";
import {
  extractDate,
  extractMonthDay,
  extractTime,
  extractWeekday,
  firstEmail,
  parseMonthlyDayMode,
  parseNoFixedContact,
  parseReminderChoice,
  parseTriggerType,
  validateEmail,
} from "@/lib/workflow/setup-parse";
import { isBlankDraft } from "@/lib/workflow/setup-state";
import { isNonBusinessFieldLabel, sanitizeProposalFields } from "@/lib/workflow/setup-validate";

export function blankIntakeDraft(intakeRequestId: string): WorkflowDraftDefinition {
  return withDraftReminder(
    {
      ...emptyWorkflowDraft(),
      intakeRequestId,
      emailEditingState: emptyEmailEditingState(),
    },
    { state: "unset" },
  );
}

export function shouldRunIntakeExtraction(draft: WorkflowDraftDefinition) {
  return isBlankDraft(draft);
}

export function resolveIntakeRecord(input: {
  clientRequestId: string;
  remembered: { id: string; intakeRequestId?: string } | null;
  foundByRequestId: { id: string } | null;
}) {
  if (input.remembered && input.remembered.intakeRequestId === input.clientRequestId) {
    return { workflowId: input.remembered.id, shouldCreate: false as const };
  }
  if (input.foundByRequestId) {
    return { workflowId: input.foundByRequestId.id, shouldCreate: false as const };
  }
  return { workflowId: null, shouldCreate: true as const };
}

function labelsOverlap(a: string, b: string) {
  const left = a.trim();
  const right = b.trim();
  return left === right || left.includes(right) || right.includes(left);
}

function mergeItemLabels(message: string, extracted: string[]) {
  const heuristic = extractRequirementItems(message)
    .map((item) => item.label.trim())
    .filter((label) => label && !isNonBusinessFieldLabel(label));
  const fromAi = extracted.map((label) => label.trim()).filter((label) => label && !isNonBusinessFieldLabel(label));
  const preferred =
    fromAi.length >= heuristic.length && fromAi.length > 0
      ? [...fromAi, ...heuristic.filter((label) => !fromAi.some((existing) => labelsOverlap(existing, label)))]
      : [...heuristic, ...fromAi.filter((label) => !heuristic.some((existing) => labelsOverlap(existing, label)))];
  const labels: string[] = [];
  for (const label of preferred) {
    if (!labels.some((existing) => labelsOverlap(existing, label))) {
      labels.push(label);
    }
  }
  return labels;
}

function reminderFromIntake(message: string, extraction: InitialWorkflowExtraction): DraftReminder {
  if (extraction.reminder?.state === "enabled" || extraction.reminder?.state === "disabled") {
    return extraction.reminder;
  }
  const parsed = parseReminderChoice(message);
  if (parsed?.decision === "declined") {
    return { state: "disabled" };
  }
  if (parsed?.decision === "enabled" && parsed.afterHours) {
    return { state: "enabled", afterHours: parsed.afterHours };
  }
  return extraction.reminder ?? { state: "unset" };
}

function scheduleFromIntake(message: string, extraction: InitialWorkflowExtraction): WorkflowDraftDefinition["schedule"] {
  const type =
    parseTriggerType(message) ?? (extraction.scheduleType && extraction.scheduleType !== "none" ? extraction.scheduleType : null);
  if (!type) {
    return undefined;
  }
  if (type === "monthly") {
    const day = extraction.scheduleDay ?? extractMonthDay(message, null);
    return {
      type: "monthly",
      day,
      time: extraction.scheduleTime ?? extractTime(message),
      timezone: TIMEZONE,
      ...(day != null ? { monthlyDayMode: parseMonthlyDayMode(message) } : {}),
    };
  }
  if (type === "weekly") {
    return {
      type: "weekly",
      weekday: extraction.scheduleWeekday ?? extractWeekday(message),
      time: extraction.scheduleTime ?? extractTime(message),
      timezone: TIMEZONE,
    };
  }
  if (type === "once") {
    return {
      type: "once",
      date: extraction.scheduleDate ?? extractDate(message),
      time: extraction.scheduleTime ?? extractTime(message),
      timezone: TIMEZONE,
    };
  }
  if (type === "manual") {
    return { type: "manual" };
  }
  return { type: "send_now" };
}

export function draftFromIntakeExtraction({
  userMessage,
  extraction,
  intakeRequestId,
  mailboxId = null,
  createId = () => crypto.randomUUID(),
}: {
  userMessage: string;
  extraction: InitialWorkflowExtraction;
  intakeRequestId: string;
  mailboxId?: string | null;
  createId?: () => string;
}): WorkflowDraftDefinition {
  const sanitized = sanitizeInitialExtraction(userMessage, extraction);
  const labels = mergeItemLabels(
    userMessage,
    sanitized.collectionItems.map((item) => item.label),
  );
  const organizationName = companyNameFromOriginal(
    userMessage,
    sanitized.recipient.organizationName,
  );
  const person = contactPersonFromExtraction(
    userMessage,
    sanitized.contactPerson ??
      (sanitized.recipient.contactName
        ? { value: sanitized.recipient.contactName, evidence: sanitized.recipient.contactName }
        : null),
    organizationName,
  );
  const noFixedContact = parseNoFixedContact(userMessage);
  const emailRaw = sanitized.recipient.email?.trim() || firstEmail(userMessage);
  const checked = emailRaw ? validateEmail(emailRaw) : null;
  const email = checked?.valid ? checked.normalizedEmail : null;
  const fields = labels.map((label) => unconfiguredField(createId(), label));
  const named = Boolean(person?.value) && !noFixedContact;
  let draft = withDraftReminder(
    withDraftRecipient(
      {
        ...emptyWorkflowDraft(),
        name: extraction.processName?.trim() || "",
        senderMailboxId: mailboxId,
        intakeRequestId,
        emailEditingState: emptyEmailEditingState(),
        fields,
        schedule: scheduleFromIntake(userMessage, extraction),
      },
      {
        organizationName,
        contactName: named ? person?.value ?? null : null,
        contactResolution: noFixedContact ? "no_fixed_contact" : named ? "named" : "pending",
        email,
      },
    ),
    reminderFromIntake(userMessage, extraction),
  );
  draft = sanitizeProposalFields(draft);
  return syncProposalEmail(draft);
}
