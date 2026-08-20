import type { WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";

function contactGreeting(proposal: WorkflowDraftDefinition) {
  const recipient = proposal.recipients[0];
  const organization = recipient?.organizationName?.trim() ?? "";
  const name = recipient?.name?.trim() ?? "";
  if (name && name !== organization) {
    return `שלום ${name},`;
  }
  return "שלום,";
}

export function defaultEmailSubject(proposal: WorkflowDraftDefinition) {
  const fields = proposal.fields;
  const monthly = proposal.schedule?.type === "monthly";
  const weekly = proposal.schedule?.type === "weekly";
  if (fields.length >= 2 && monthly) {
    return "בקשה למסמכים חודשיים";
  }
  if (fields.length >= 2 && weekly) {
    return "בקשה למסמכים שבועיים";
  }
  if (fields.length >= 2) {
    return "בקשה למסמכים";
  }
  const label = fields[0]?.label?.trim();
  return label ? `בקשה ל${label}` : "";
}

export function defaultEmailBody(proposal: WorkflowDraftDefinition) {
  const labels = proposal.fields.map((field) => field.label.trim()).filter(Boolean);
  if (labels.length === 0) {
    return "";
  }
  const list = labels.map((label) => `• ${label}`).join("\n");
  return `${contactGreeting(proposal)}\n\nנא לצרף את המסמכים הבאים:\n\n${list}\n\nלפתיחת הטופס ולהעלאת המסמכים יש ללחוץ על הכפתור המצורף.\n\nתודה`;
}

export function defaultProcessName(proposal: WorkflowDraftDefinition) {
  const fields = proposal.fields;
  if (fields.length >= 2 && proposal.schedule?.type === "monthly") {
    return "איסוף מסמכים חודשיים";
  }
  if (fields.length >= 2) {
    return "איסוף מסמכים";
  }
  const label = fields[0]?.label?.trim();
  return label ? `איסוף ${label}` : "";
}

export function emailCoversAllFields(proposal: WorkflowDraftDefinition) {
  if (proposal.fields.length === 0) {
    return true;
  }
  return proposal.fields.every((field) => proposal.email.body.includes(field.label));
}

function isAutoProcessName(name: string, proposal: WorkflowDraftDefinition) {
  const trimmed = name.trim();
  if (!trimmed) {
    return true;
  }
  if (
    trimmed === "איסוף מסמכים" ||
    trimmed === "איסוף מסמכים חודשיים" ||
    trimmed === "איסוף מסמכים שבועיים"
  ) {
    return true;
  }
  return proposal.fields.some((field) => trimmed === `איסוף ${field.label}` || trimmed === `בקשה ל${field.label}`);
}

export function syncProposalEmail(proposal: WorkflowDraftDefinition): WorkflowDraftDefinition {
  const locks = proposal.editorLocks ?? {};
  const editing = proposal.emailEditingState ?? { subjectManuallyEdited: false, bodyManuallyEdited: false };
  const nextName =
    locks.name || (!isAutoProcessName(proposal.name, proposal) && proposal.name.trim())
      ? proposal.name
      : defaultProcessName(proposal) || proposal.name;
  const nextSubject =
    locks.emailSubject || editing.subjectManuallyEdited
      ? proposal.email.subject
      : defaultEmailSubject(proposal) || proposal.email.subject;
  const nextBody =
    locks.emailBody || editing.bodyManuallyEdited
      ? proposal.email.body
      : defaultEmailBody(proposal) || proposal.email.body;
  return {
    ...proposal,
    name: nextName,
    email: {
      subject: nextSubject,
      body: nextBody,
    },
  };
}
