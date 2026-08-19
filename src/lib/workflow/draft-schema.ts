import { z } from "zod";

import {
  dateSchema,
  recipientModeSchema,
  timeSchema,
  timezoneSchema,
  TIMEZONE,
  WEEKDAY,
  workflowFieldSchema,
} from "@/lib/workflow/schema";

const draftRecipientSchema = z.object({
  name: z.string().nullable().optional(),
  email: z.string().optional(),
});

const draftWeekdaySchema = z.number().int().min(WEEKDAY.sunday).max(WEEKDAY.saturday);
const draftMonthDaySchema = z.number().int().min(1).max(31);

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
  fields: z.array(workflowFieldSchema).default([]),
  reminder: z
    .object({
      enabled: z.boolean().default(false),
      afterHours: z.number().positive().nullable().optional(),
      afterMinutes: z.number().positive().nullable().optional(),
    })
    .default({ enabled: false, afterHours: null }),
  reminderDecision: z.enum(["unset", "enabled", "declined"]).default("unset"),
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
export type DraftSchedule = z.output<typeof draftScheduleSchema>;
export type ReminderDecision = WorkflowDraftDefinition["reminderDecision"];
export type DraftEditorLocks = WorkflowDraftDefinition["editorLocks"];

export function parseWorkflowDraft(input: unknown) {
  return workflowDraftSchema.safeParse(input);
}

export function emptyWorkflowDraft(): WorkflowDraftDefinition {
  return workflowDraftSchema.parse({});
}
