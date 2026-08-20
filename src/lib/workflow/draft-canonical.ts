import { configuredFields } from "@/lib/workflow/draft-fields";
import { omitDraftOnlyFields } from "@/lib/workflow/editor-locks";
import {
  type DraftRecipient,
  type DraftReminder,
  type EmailEditingState,
  type WorkflowDraftDefinition,
} from "@/lib/workflow/draft-schema";
import {
  parseWorkflowDefinition,
  type WorkflowDefinition,
  type WorkflowSchedule,
} from "@/lib/workflow/schema";

export function emptyDraftRecipient(): DraftRecipient {
  return {
    organizationName: null,
    contactName: null,
    contactResolution: "pending",
    email: null,
  };
}

export function emptyEmailEditingState(): EmailEditingState {
  return { subjectManuallyEdited: false, bodyManuallyEdited: false };
}

export function getEmailEditingState(draft: WorkflowDraftDefinition): EmailEditingState {
  const state = draft.emailEditingState ?? emptyEmailEditingState();
  return {
    subjectManuallyEdited: Boolean(state.subjectManuallyEdited || draft.editorLocks?.emailSubject),
    bodyManuallyEdited: Boolean(state.bodyManuallyEdited || draft.editorLocks?.emailBody),
  };
}

export function withEmailEditingState(
  draft: WorkflowDraftDefinition,
  patch: Partial<EmailEditingState>,
): WorkflowDraftDefinition {
  const current = getEmailEditingState(draft);
  return {
    ...draft,
    emailEditingState: {
      subjectManuallyEdited: patch.subjectManuallyEdited ?? current.subjectManuallyEdited,
      bodyManuallyEdited: patch.bodyManuallyEdited ?? current.bodyManuallyEdited,
    },
  };
}

export function getDraftReminder(draft: WorkflowDraftDefinition): DraftReminder {
  if (draft.draftReminder) {
    return draft.draftReminder;
  }
  if (draft.reminder.enabled && draft.reminder.afterHours) {
    return { state: "enabled", afterHours: draft.reminder.afterHours };
  }
  if (draft.reminderDecision === "declined") {
    return { state: "disabled" };
  }
  if (draft.reminderDecision === "enabled" && !draft.reminder.enabled) {
    return { state: "disabled" };
  }
  return { state: "unset" };
}

export function withDraftReminder(
  draft: WorkflowDraftDefinition,
  reminder: DraftReminder,
): WorkflowDraftDefinition {
  if (reminder.state === "enabled") {
    return {
      ...draft,
      draftReminder: reminder,
      reminderDecision: "enabled",
      reminder: { enabled: true, afterHours: reminder.afterHours, afterMinutes: null },
    };
  }
  if (reminder.state === "disabled") {
    return {
      ...draft,
      draftReminder: reminder,
      reminderDecision: "declined",
      reminder: { enabled: false, afterHours: null, afterMinutes: null },
    };
  }
  return {
    ...draft,
    draftReminder: reminder,
    reminderDecision: "unset",
    reminder: { enabled: false, afterHours: null, afterMinutes: null },
  };
}

export function materializedReminder(reminder: DraftReminder): WorkflowDefinition["reminder"] {
  if (reminder.state === "enabled") {
    return { enabled: true, afterHours: reminder.afterHours, afterMinutes: null };
  }
  return { enabled: false, afterHours: null, afterMinutes: null };
}

export function getDraftRecipient(draft: WorkflowDraftDefinition): DraftRecipient {
  const row = draft.recipients[0];
  if (!row) {
    return emptyDraftRecipient();
  }
  const organizationName = row.organizationName?.trim() || null;
  const email = row.email?.trim() || null;
  if (row.contactResolution) {
    return {
      organizationName,
      contactName: row.contactResolution === "named" ? row.contactName?.trim() || row.name?.trim() || null : null,
      contactResolution: row.contactResolution,
      email,
    };
  }
  const name = row.contactName?.trim() || row.name?.trim() || null;
  const contactName = name && name !== organizationName ? name : null;
  return {
    organizationName,
    contactName,
    contactResolution: contactName ? "named" : "pending",
    email,
  };
}

export function withDraftRecipient(
  draft: WorkflowDraftDefinition,
  recipient: DraftRecipient,
): WorkflowDraftDefinition {
  const contactName = recipient.contactResolution === "named" ? recipient.contactName?.trim() || null : null;
  return {
    ...draft,
    recipients: [
      {
        organizationName: recipient.organizationName?.trim() || null,
        contactName,
        contactResolution: recipient.contactResolution,
        name: contactName,
        email: recipient.email?.trim() || "",
      },
    ],
  };
}

export function materializedRecipientName(recipient: DraftRecipient) {
  return recipient.contactName?.trim() || recipient.organizationName?.trim() || recipient.email?.trim() || null;
}

export function materializePublishedDefinition(draft: WorkflowDraftDefinition) {
  const recipient = getDraftRecipient(draft);
  const name = materializedRecipientName(recipient);
  const raw = omitDraftOnlyFields({
    version: 1,
    name: draft.name,
    senderMailboxId: draft.senderMailboxId ?? null,
    recipientMode: draft.recipientMode ?? "fixed",
    recipients:
      recipient.email?.trim() && name
        ? [
            {
              name,
              organizationName: recipient.organizationName,
              email: recipient.email.trim(),
            },
          ]
        : recipient.email?.trim()
          ? [
              {
                name: recipient.email.trim(),
                organizationName: recipient.organizationName,
                email: recipient.email.trim(),
              },
            ]
          : [],
    schedule: draft.schedule as WorkflowSchedule | undefined,
    email: draft.email,
    fields: configuredFields(draft.fields),
    reminder: materializedReminder(getDraftReminder(draft)),
  });
  return parseWorkflowDefinition(raw);
}
