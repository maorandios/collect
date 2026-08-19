import { z } from "zod";

import { emptyWorkflowDraft, workflowDraftSchema, type WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";

export const SETUP_STATUSES = ["collecting", "review", "applying", "completed"] as const;
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
      suggested: z.string(),
      domain: z.string(),
      suggestedDomain: z.string(),
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

export function parseWorkflowSetupState(input: unknown) {
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
    draft.recipients.every((item) => !item.email?.trim() && !item.name?.trim()) &&
    !draft.email.subject.trim() &&
    !draft.email.body.trim()
  );
}
