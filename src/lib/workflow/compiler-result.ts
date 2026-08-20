import { z } from "zod";

const compilerRecipientSchema = z.object({
  name: z.string().nullable(),
  organizationName: z.string().nullable().optional(),
  email: z.string().nullable(),
});

const compilerFieldSchema = z.object({
  id: z.string().nullable(),
  type: z.enum(["short_text", "long_text", "number", "date", "confirmation", "file"]),
  label: z.string(),
  required: z.boolean(),
  helpText: z.string().nullable(),
  allowedMimeTypes: z.array(z.string()),
  maxFiles: z.number().nullable(),
  maxFileSizeMb: z.number().nullable(),
});

export const WorkflowCompilerResultSchema = z.object({
  assistantMessage: z.string(),
  name: z.string().nullable(),
  recipientMode: z.enum(["fixed", "at_launch"]).nullable(),
  recipients: z.array(compilerRecipientSchema).nullable(),
  scheduleType: z.enum(["unchanged", "send_now", "once", "weekly", "monthly", "manual"]),
  scheduleDate: z.string().nullable(),
  scheduleTime: z.string().nullable(),
  scheduleWeekday: z.number().int().nullable(),
  scheduleDay: z.number().int().nullable(),
  emailSubject: z.string().nullable(),
  emailBody: z.string().nullable(),
  fields: z.array(compilerFieldSchema).nullable(),
  removedFieldIds: z.array(z.string()),
  reminderEnabled: z.boolean().nullable(),
  reminderAfterHours: z.number().nullable(),
  warnings: z.array(z.string()),
});

export type WorkflowCompilerResult = z.output<typeof WorkflowCompilerResultSchema>;

import type { WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";

export type CompileConversationInput = {
  messages: { role: "user" | "assistant"; content: string }[];
  draft: WorkflowDraftDefinition;
  mailboxEmail: string | null;
  today: string;
};

export function parseWorkflowCompilerResult(input: unknown) {
  return WorkflowCompilerResultSchema.safeParse(input);
}
