import { emailCoversAllFields } from "@/lib/workflow/setup-email";
import { looksLikeEmail } from "@/lib/workflow/setup-parse";
import type { WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";

const WEEKDAY_ONLY =
  /^(יום\s+)?(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)$/;
const TIME_ONLY = /^\d{1,2}[:.]\d{2}$/;
const META_FIELD_LABEL = /^(אימייל|מייל|יום|שעה|תזכורת|שם נמען|כתובת)$/;

export type ProposalSemanticsResult =
  | { ok: true }
  | { ok: false; reason: string };

export function isNonBusinessFieldLabel(label: string) {
  const trimmed = label.trim();
  if (!trimmed) {
    return true;
  }
  if (looksLikeEmail(trimmed)) {
    return true;
  }
  if (TIME_ONLY.test(trimmed)) {
    return true;
  }
  if (WEEKDAY_ONLY.test(trimmed)) {
    return true;
  }
  if (META_FIELD_LABEL.test(trimmed)) {
    return true;
  }
  return false;
}

export function fieldsSignature(proposal: WorkflowDraftDefinition) {
  return JSON.stringify(proposal.fields.map((field) => ({ id: field.id, type: field.type, label: field.label })));
}

export function assertFieldsUnchanged(previous: WorkflowDraftDefinition, next: WorkflowDraftDefinition) {
  if (fieldsSignature(previous) !== fieldsSignature(next)) {
    throw new Error("fields_changed");
  }
}

export function mayMutateProposalFields({
  currentStep,
  fieldsTouched,
  firstTurn,
  extraction,
}: {
  currentStep: string | null;
  fieldsTouched: boolean;
  firstTurn: boolean;
  extraction: boolean;
}) {
  if (firstTurn || extraction) {
    return true;
  }
  if (currentStep === "requirements" || currentStep === "field_types" || currentStep === "review_field_change") {
    return true;
  }
  return fieldsTouched && (currentStep === "review" || currentStep === "requirements");
}

export function sanitizeProposalFields(proposal: WorkflowDraftDefinition): WorkflowDraftDefinition {
  const seen = new Set<string>();
  const fields = proposal.fields.filter((field) => {
    if (isNonBusinessFieldLabel(field.label)) {
      return false;
    }
    if (!field.id || seen.has(field.id)) {
      return false;
    }
    seen.add(field.id);
    return true;
  });
  return { ...proposal, fields };
}

export function validateProposalSemantics(proposal: WorkflowDraftDefinition): ProposalSemanticsResult {
  const ids = new Set<string>();
  for (const field of proposal.fields) {
    if (isNonBusinessFieldLabel(field.label)) {
      return { ok: false, reason: "invalid_field_label" };
    }
    if (!field.id || ids.has(field.id)) {
      return { ok: false, reason: "duplicate_field" };
    }
    ids.add(field.id);
    if (looksLikeEmail(field.label) || (field.helpText && looksLikeEmail(field.helpText))) {
      return { ok: false, reason: "email_in_fields" };
    }
  }
  const organization = proposal.recipients[0]?.organizationName?.trim() ?? "";
  if (organization && /^(חשבונית|חשבוניות|קבלה|קבלות|אישור)/.test(organization)) {
    return { ok: false, reason: "organization_from_document" };
  }
  if (proposal.fields.length > 0 && proposal.email.body.trim() && !emailCoversAllFields(proposal)) {
    return { ok: false, reason: "email_omits_field" };
  }
  return { ok: true };
}
