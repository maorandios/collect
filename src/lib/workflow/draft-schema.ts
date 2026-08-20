import { z } from "zod";

import {
  dateSchema,
  recipientModeSchema,
  timeSchema,
  timezoneSchema,
  TIMEZONE,
  WEEKDAY,
} from "@/lib/workflow/schema";

export const draftContactResolutionSchema = z.enum(["pending", "named", "no_fixed_contact"]);

export const draftRecipientSchema = z.object({
  name: z.string().nullable().optional(),
  organizationName: z.string().nullable().optional(),
  email: z.string().optional(),
  contactName: z.string().nullable().optional(),
  contactResolution: draftContactResolutionSchema.optional(),
});

export const draftReminderCanonicalSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("unset") }),
  z.object({ state: z.literal("disabled") }),
  z.object({
    state: z.literal("enabled"),
    afterHours: z.number().positive(),
  }),
]);

export const emailEditingStateSchema = z.object({
  subjectManuallyEdited: z.boolean().default(false),
  bodyManuallyEdited: z.boolean().default(false),
});

const draftWeekdaySchema = z.number().int().min(WEEKDAY.sunday).max(WEEKDAY.saturday);
const draftMonthDaySchema = z.number().int().min(1).max(31);

const draftFieldBase = {
  id: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean(),
  helpText: z.string().nullable(),
};

export const draftWorkflowFieldSchema = z.discriminatedUnion("type", [
  z.object({ ...draftFieldBase, type: z.literal("unconfigured") }),
  z.object({ ...draftFieldBase, type: z.literal("short_text") }),
  z.object({ ...draftFieldBase, type: z.literal("long_text") }),
  z.object({ ...draftFieldBase, type: z.literal("number") }),
  z.object({ ...draftFieldBase, type: z.literal("date") }),
  z.object({ ...draftFieldBase, type: z.literal("confirmation") }),
  z.object({
    ...draftFieldBase,
    type: z.literal("file"),
    allowedMimeTypes: z.array(z.string().min(1)).default([]),
    maxFiles: z.number().int().positive(),
    maxFileSizeMb: z.number().positive(),
  }),
]);

export const draftScheduleSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("send_now"),
  }),
  z.object({
    type: z.literal("once"),
    date: dateSchema.nullable().optional(),
    time: timeSchema.nullable().optional(),
    timezone: timezoneSchema.default(TIMEZONE),
  }),
  z.object({
    type: z.literal("weekly"),
    weekday: draftWeekdaySchema.nullable().optional(),
    time: timeSchema.nullable().optional(),
    timezone: timezoneSchema.default(TIMEZONE),
  }),
  z.object({
    type: z.literal("monthly"),
    day: draftMonthDaySchema.nullable().optional(),
    time: timeSchema.nullable().optional(),
    timezone: timezoneSchema.default(TIMEZONE),
    monthlyDayMode: z.enum(["end_of_month", "specific_day"]).optional(),
  }),
  z.object({
    type: z.literal("manual"),
  }),
]);

export const workflowDraftSchema = z.object({
  version: z.literal(1).default(1),
  name: z.string().default(""),
  senderMailboxId: z.string().uuid().nullable().optional(),
  recipientMode: recipientModeSchema.optional(),
  recipients: z.array(draftRecipientSchema).default([]),
  schedule: draftScheduleSchema.optional(),
  email: z
    .object({
      subject: z.string().default(""),
      body: z.string().default(""),
    })
    .default({ subject: "", body: "" }),
  fields: z.array(draftWorkflowFieldSchema).default([]),
  reminder: z
    .object({
      enabled: z.boolean().default(false),
      afterHours: z.number().positive().nullable().optional(),
      afterMinutes: z.number().positive().nullable().optional(),
    })
    .default({ enabled: false, afterHours: null }),
  reminderDecision: z.enum(["unset", "enabled", "declined"]).default("unset"),
  draftReminder: draftReminderCanonicalSchema.optional(),
  emailEditingState: emailEditingStateSchema.optional(),
  intakeRequestId: z.string().min(1).optional(),
  editorLocks: z
    .object({
      name: z.boolean().optional(),
      emailSubject: z.boolean().optional(),
      emailBody: z.boolean().optional(),
      schedule: z.boolean().optional(),
      recipients: z.boolean().optional(),
      fields: z.boolean().optional(),
      reminder: z.boolean().optional(),
    })
    .default({}),
});

export type WorkflowDraftDefinition = z.output<typeof workflowDraftSchema>;
export type DraftField = z.output<typeof draftWorkflowFieldSchema>;
export type DraftFieldType = DraftField["type"];
export type DraftSchedule = z.output<typeof draftScheduleSchema>;
export type ReminderDecision = WorkflowDraftDefinition["reminderDecision"];
export type DraftEditorLocks = WorkflowDraftDefinition["editorLocks"];
export type DraftReminder = z.output<typeof draftReminderCanonicalSchema>;
export type DraftRecipient = {
  organizationName: string | null;
  contactName: string | null;
  contactResolution: z.output<typeof draftContactResolutionSchema>;
  email: string | null;
};
export type EmailEditingState = z.output<typeof emailEditingStateSchema>;

export function parseWorkflowDraft(input: unknown) {
  return workflowDraftSchema.safeParse(input);
}

export function emptyWorkflowDraft(): WorkflowDraftDefinition {
  return workflowDraftSchema.parse({});
}
