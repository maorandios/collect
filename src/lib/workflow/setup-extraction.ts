import { z } from "zod";

export const setupExtractedItemSchema = z.object({
  label: z.string().min(1),
  kind: z.enum(["file", "confirmation", "text", "number", "date", "ambiguous"]),
  filePreset: z.enum(["all", "pdf", "excel", "images", "video"]).nullable(),
});

export const setupExtractionSchema = z.object({
  items: z.array(setupExtractedItemSchema),
  name: z.string().nullable(),
  companyName: z.string().nullable(),
  contactPerson: z.object({
    value: z.string().nullable(),
    evidence: z.string().nullable(),
  }).nullable(),
  recipientName: z.string().nullable(),
  recipientEmail: z.string().nullable(),
  scheduleType: z.enum(["none", "send_now", "once", "weekly", "monthly", "manual"]),
  scheduleDate: z.string().nullable(),
  scheduleTime: z.string().nullable(),
  scheduleWeekday: z.number().int().min(0).max(6).nullable(),
  scheduleDay: z.number().int().min(1).max(31).nullable(),
  emailSubject: z.string().nullable(),
  emailBody: z.string().nullable(),
});

export const setupChangePatchSchema = z.object({
  target: z.enum([
    "recipient_email",
    "recipient_name",
    "weekday",
    "time",
    "month_day",
    "date",
    "schedule_type",
    "reminder",
    "field_type",
    "field_add",
    "field_remove",
    "email_subject",
    "email_body",
    "name",
    "unknown",
  ]),
  recipientEmail: z.string().nullable(),
  recipientName: z.string().nullable(),
  weekday: z.number().int().min(0).max(6).nullable(),
  time: z.string().nullable(),
  monthDay: z.number().int().min(1).max(31).nullable(),
  date: z.string().nullable(),
  scheduleType: z.enum(["send_now", "once", "weekly", "monthly", "manual"]).nullable(),
  reminderEnabled: z.boolean().nullable(),
  reminderAfterHours: z.number().int().nullable(),
  fieldId: z.string().nullable(),
  fieldType: z.enum(["file", "confirmation", "text", "number"]).nullable(),
  fieldLabel: z.string().nullable(),
  emailSubject: z.string().nullable(),
  emailBody: z.string().nullable(),
  name: z.string().nullable(),
});

export type SetupExtraction = z.output<typeof setupExtractionSchema>;
export type SetupChangePatch = z.output<typeof setupChangePatchSchema>;

export const emptySetupExtraction = (): SetupExtraction => ({
  items: [],
  name: null,
  companyName: null,
  contactPerson: { value: null, evidence: null },
  recipientName: null,
  recipientEmail: null,
  scheduleType: "none",
  scheduleDate: null,
  scheduleTime: null,
  scheduleWeekday: null,
  scheduleDay: null,
  emailSubject: null,
  emailBody: null,
});

export type SetupAiUsage = {
  model: string | null;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  fallback: boolean;
};

export const setupAnswerInterpretationSchema = z.object({
  understood: z.boolean(),
  canonicalValue: z.string().nullable(),
  confidence: z.number(),
});

export type SetupAnswerInterpretation = z.output<typeof setupAnswerInterpretationSchema>;

export const zeroSetupAiUsage = (): SetupAiUsage => ({
  model: null,
  latencyMs: 0,
  inputTokens: 0,
  outputTokens: 0,
  fallback: false,
});
