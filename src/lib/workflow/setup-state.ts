import { z } from "zod";

import { emptyWorkflowDraft, workflowDraftSchema, type WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import { deriveRecipientIdentity, emptyRecipientIdentity } from "@/lib/workflow/setup-identity";

export const SETUP_STATUSES = ["collecting", "review", "applying", "completed"] as const;
export const CONVERSATION_MODES = ["setup", "review", "edit"] as const;
export const PENDING_EDIT_TARGETS = ["schedule", "recipient", "reminder", "field", "email"] as const;
export const SETUP_STEPS = [
  "requirements",
  "field_types",
  "recipient",
  "trigger",
  "schedule_details",
  "reminder",
  "review",
] as const;
export const REQUIREMENT_KINDS = ["file", "confirmation", "text", "number", "date", "ambiguous"] as const;
export const SETUP_ANSWER_TYPES = ["text", "email", "time", "date", "single_choice", "confirmation"] as const;

export const setupStatusSchema = z.enum(SETUP_STATUSES);
export const setupStepSchema = z.enum(SETUP_STEPS);
export const requirementKindSchema = z.enum(REQUIREMENT_KINDS);

export const setupQuestionSchema = z.object({
  key: z.string().min(1),
  step: setupStepSchema,
  question: z.string().min(1),
  helperText: z.string().optional(),
  answerType: z.enum(SETUP_ANSWER_TYPES),
  options: z
    .array(
      z.object({
        value: z.string(),
        label: z.string(),
      }),
    )
    .optional(),
  requirementId: z.string().optional(),
});

export const setupRequirementSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: requirementKindSchema,
  maxFiles: z.number().int().positive().optional(),
  filePreset: z.enum(["all", "pdf", "excel", "images", "video"]).optional(),
  fileFormatResolution: z.enum(["pending", "resolved"]).optional(),
  allowedMimeTypes: z.array(z.string().min(1)).optional(),
});

export const recipientIdentitySchema = z.object({
  organizationName: z.string().nullable(),
  contactName: z.string().nullable(),
  contactResolution: z.enum(["pending", "named", "no_fixed_contact"]),
  email: z.string().nullable(),
});

export const workflowSetupStateSchema = z.object({
  status: setupStatusSchema,
  baseDraftRevision: z.number().int().nonnegative(),
  proposal: workflowDraftSchema,
  requirements: z.array(setupRequirementSchema).default([]),
  completedSteps: z.array(setupStepSchema).default([]),
  currentStep: setupStepSchema.nullable().default(null),
  nextQuestion: setupQuestionSchema.nullable().default(null),
  reminderDecision: z.enum(["not_asked", "enabled", "declined"]).default("not_asked"),
  pendingEmailCorrection: z
    .object({
      original: z.string(),
      suggested: z.string().optional(),
      domain: z.string().optional(),
      suggestedDomain: z.string().optional(),
      reason: z
        .enum([
          "comma_in_domain",
          "missing_at",
          "multiple_at",
          "contains_space",
          "missing_tld",
          "common_domain_typo",
          "invalid_structure",
        ])
        .optional(),
    })
    .nullable()
    .default(null),
  contactPersonStatus: z.enum(["unasked", "named", "none"]).default("unasked"),
  recipientIdentity: recipientIdentitySchema.default(emptyRecipientIdentity()),
  pendingCompanyConfirm: z.string().nullable().default(null),
  pendingWeekdayOrMonthDay: z
    .object({
      weekday: z.number().int().min(0).max(6),
      monthDay: z.number().int().min(1).max(31),
      weekdayLabel: z.string().min(1),
    })
    .nullable()
    .default(null),
  awaitingCompanyName: z.boolean().default(false),
  conversationMode: z.enum(CONVERSATION_MODES).optional(),
  pendingEdit: z
    .object({
      target: z.enum(PENDING_EDIT_TARGETS),
      partialPatch: z.unknown().optional(),
    })
    .nullable()
    .default(null),
  conflict: z.boolean().default(false),
  updatedAt: z.string(),
});

export type SetupStatus = z.output<typeof setupStatusSchema>;
export type SetupStep = z.output<typeof setupStepSchema>;
export type SetupQuestion = z.output<typeof setupQuestionSchema>;
export type SetupRequirement = z.output<typeof setupRequirementSchema>;
export type WorkflowSetupState = z.output<typeof workflowSetupStateSchema>;
export type ConversationMode = (typeof CONVERSATION_MODES)[number];
export type PendingEditTarget = (typeof PENDING_EDIT_TARGETS)[number];

export function conversationModeOf(setup: WorkflowSetupState): ConversationMode {
  if (setup.conversationMode) {
    return setup.conversationMode;
  }
  if (setup.status === "review") {
    return "review";
  }
  if (setup.status === "completed") {
    return "edit";
  }
  return "setup";
}

export function parseWorkflowSetupState(input: unknown) {
  if (input && typeof input === "object" && !("recipientIdentity" in input)) {
    const value = input as {
      contactPersonStatus?: "unasked" | "named" | "none";
      proposal?: { recipients?: Array<{ name?: string | null; organizationName?: string | null; email?: string | null }> };
    };
    const recipient = value.proposal?.recipients?.[0];
    return workflowSetupStateSchema.safeParse({
      ...input,
      recipientIdentity: deriveRecipientIdentity({
        contactPersonStatus: value.contactPersonStatus,
        organizationName: recipient?.organizationName ?? null,
        contactName: recipient?.name ?? null,
        email: recipient?.email ?? null,
      }),
    });
  }
  return workflowSetupStateSchema.safeParse(input);
}

export function emptySetupState(
  baseDraftRevision: number,
  proposal: WorkflowDraftDefinition = emptyWorkflowDraft(),
): WorkflowSetupState {
  return {
    status: "collecting",
    baseDraftRevision,
    proposal,
    requirements: [],
    completedSteps: [],
    currentStep: "requirements",
    nextQuestion: null,
    reminderDecision: "not_asked",
    pendingEmailCorrection: null,
    contactPersonStatus: "unasked",
    recipientIdentity: emptyRecipientIdentity(),
    pendingCompanyConfirm: null,
    pendingWeekdayOrMonthDay: null,
    awaitingCompanyName: false,
    conversationMode: "setup",
    pendingEdit: null,
    conflict: false,
    updatedAt: new Date().toISOString(),
  };
}

export function cloneDraft(draft: WorkflowDraftDefinition): WorkflowDraftDefinition {
  return workflowDraftSchema.parse(JSON.parse(JSON.stringify(draft)));
}

export function isBlankDraft(draft: WorkflowDraftDefinition) {
  return (
    !draft.name.trim() &&
    draft.fields.length === 0 &&
    !draft.schedule &&
    draft.recipients.every(
      (item) => !item.email?.trim() && !item.name?.trim() && !item.organizationName?.trim(),
    ) &&
    !draft.email.subject.trim() &&
    !draft.email.body.trim()
  );
}
