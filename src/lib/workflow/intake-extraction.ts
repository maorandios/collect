import { z } from "zod";

import { draftReminderCanonicalSchema } from "@/lib/workflow/draft-schema";

export const initialCollectionItemSchema = z.object({
  label: z.string().min(1),
  sourcePhrase: z.string().min(1),
});

export const initialRecipientSchema = z.object({
  organizationName: z.string().nullable(),
  organizationSourcePhrase: z.string().nullable(),
  contactName: z.string().nullable(),
  email: z.string().nullable(),
});

export const initialWorkflowExtractionSchema = z.object({
  processName: z.string().nullable(),
  collectionItems: z.array(initialCollectionItemSchema),
  recipient: initialRecipientSchema,
  contactPerson: z
    .object({
      value: z.string().nullable(),
      evidence: z.string().nullable(),
    })
    .nullable(),
  scheduleType: z.enum(["none", "send_now", "once", "weekly", "monthly", "manual"]),
  scheduleDate: z.string().nullable(),
  scheduleTime: z.string().nullable(),
  scheduleWeekday: z.number().int().min(0).max(6).nullable(),
  scheduleDay: z.number().int().min(1).max(31).nullable(),
  reminder: draftReminderCanonicalSchema.nullable(),
});

export type InitialCollectionItem = z.output<typeof initialCollectionItemSchema>;
export type InitialRecipient = z.output<typeof initialRecipientSchema>;
export type InitialWorkflowExtraction = z.output<typeof initialWorkflowExtractionSchema>;

export function emptyInitialWorkflowExtraction(): InitialWorkflowExtraction {
  return {
    processName: null,
    collectionItems: [],
    recipient: {
      organizationName: null,
      organizationSourcePhrase: null,
      contactName: null,
      email: null,
    },
    contactPerson: { value: null, evidence: null },
    scheduleType: "none",
    scheduleDate: null,
    scheduleTime: null,
    scheduleWeekday: null,
    scheduleDay: null,
    reminder: { state: "unset" },
  };
}

export function parseInitialWorkflowExtraction(input: unknown) {
  return initialWorkflowExtractionSchema.safeParse(input);
}
