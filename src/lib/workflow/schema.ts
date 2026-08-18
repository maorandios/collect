import { z } from "zod";

export const TIMEZONE = "Asia/Jerusalem" as const;

const timezoneSchema = z.literal(TIMEZONE);

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const scheduleSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("send_now"),
  }),
  z.object({
    type: z.literal("once"),
    date: dateSchema,
    time: timeSchema,
    timezone: timezoneSchema,
  }),
  z.object({
    type: z.literal("weekly"),
    weekday: z.number().int().min(0).max(6),
    time: timeSchema,
    timezone: timezoneSchema,
  }),
  z.object({
    type: z.literal("monthly"),
    day: z.number().int().min(1).max(31),
    time: timeSchema,
    timezone: timezoneSchema,
  }),
]);

const fieldBase = {
  id: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean(),
  helpText: z.string().nullable(),
};

export const workflowFieldSchema = z.discriminatedUnion("type", [
  z.object({ ...fieldBase, type: z.literal("short_text") }),
  z.object({ ...fieldBase, type: z.literal("long_text") }),
  z.object({ ...fieldBase, type: z.literal("number") }),
  z.object({ ...fieldBase, type: z.literal("date") }),
  z.object({ ...fieldBase, type: z.literal("confirmation") }),
  z.object({
    ...fieldBase,
    type: z.literal("file"),
    allowedMimeTypes: z.array(z.string().min(1)).min(1),
    maxFiles: z.number().int().positive(),
    maxFileSizeMb: z.number().positive(),
  }),
]);

export const workflowDefinitionSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1),
  senderMailboxId: z.string().uuid().nullable(),
  recipients: z
    .array(
      z.object({
        name: z.string().nullable(),
        email: z.string().email(),
      }),
    )
    .min(1),
  schedule: scheduleSchema,
  email: z.object({
    subject: z.string().min(1),
    body: z.string().min(1),
  }),
  fields: z.array(workflowFieldSchema).min(1),
  reminder: z.object({
    enabled: z.boolean(),
    afterHours: z.number().positive().nullable(),
  }),
});

export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
export type WorkflowField = z.infer<typeof workflowFieldSchema>;
export type WorkflowSchedule = z.infer<typeof scheduleSchema>;

export function parseWorkflowDefinition(input: unknown) {
  return workflowDefinitionSchema.safeParse(input);
}
