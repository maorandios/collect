import type { WorkflowDefinition } from "@/lib/workflow/schema";

export const roniExampleWorkflow: WorkflowDefinition = {
  version: 1,
  name: "סיכום חודשי",
  senderMailboxId: null,
  recipientMode: "fixed",
  recipients: [
    {
      name: "רוני",
      email: "roni@example.com",
    },
  ],
  schedule: {
    type: "send_now",
  },
  email: {
    subject: "בקשה לסיכום עבודה",
    body: "שלום רוני,\n\nנשמח לקבל סיכום של העבודה, חשבונית PDF ועד חמש תמונות.\n\nתודה,\nקולקט",
  },
  fields: [
    {
      id: "summary",
      type: "long_text",
      label: "סיכום העבודה",
      required: true,
      helpText: null,
    },
    {
      id: "invoice",
      type: "file",
      label: "חשבונית PDF",
      required: true,
      helpText: null,
      allowedMimeTypes: ["application/pdf"],
      maxFiles: 1,
      maxFileSizeMb: 10,
    },
    {
      id: "photos",
      type: "file",
      label: "תמונות",
      required: true,
      helpText: "עד חמש תמונות",
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      maxFiles: 5,
      maxFileSizeMb: 8,
    },
  ],
  reminder: {
    enabled: true,
    afterHours: 48,
  },
};
