import type { WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";

export type ContactResolution = "pending" | "named" | "no_fixed_contact";

export type RecipientIdentity = {
  organizationName: string | null;
  contactName: string | null;
  contactResolution: ContactResolution;
  email: string | null;
};

export type ContactPersonHit = {
  value: string;
  evidence: string;
};

const COMPANY_TOKENS =
  /תעשיות|מתכת|מתכות|בע״מ|בעמ|חברה|נכסים|ביטוח|מפעל|טכנולוגי|ייעוץ|השקעות|אחזקות|שירותים/;
const MEM_COMPANY_START = /^(מגדל|מטריקס|מנורה|מזרחי|מיטב|מכתשים|מעדנות|מיקרוסופט)/;
const PERSON_SKIP = new Set([
  "כל",
  "טופס",
  "מייל",
  "בקשה",
  "תהליך",
  "חודש",
  "שבוע",
  "חברת",
  "נהל",
  "מנהל",
  "של",
  "אופן",
  "געש",
  "תעשיות",
  "מתכת",
  "מתכות",
]);

export function emptyRecipientIdentity(): RecipientIdentity {
  return {
    organizationName: null,
    contactName: null,
    contactResolution: "pending",
    email: null,
  };
}

export function looksLikeCompanyName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return false;
  }
  return COMPANY_TOKENS.test(trimmed) || /בע[״"׳']?מ$/.test(trimmed);
}

export function isCompanyDerivedContact(contactName: string | null, organizationName: string | null) {
  const contact = contactName?.trim() ?? "";
  const organization = organizationName?.trim() ?? "";
  if (!contact || !organization) {
    return false;
  }
  if (contact === organization) {
    return true;
  }
  if (organization.includes(contact) && contact.split(/\s+/).length <= 2) {
    return true;
  }
  const orgParts = new Set(organization.split(/\s+/));
  return contact.split(/\s+/).length > 0 && contact.split(/\s+/).every((part) => orgParts.has(part));
}

export function peelMemPreposition(name: string, message: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return trimmed;
  }
  const marked = message.match(/(?:מחברת|של חברת|חברת)\s+(.+)/u)?.[1]?.trim() ?? "";
  if (marked && (marked.startsWith(trimmed) || trimmed.startsWith(marked.split(/\s+/)[0] ?? ""))) {
    if (MEM_COMPANY_START.test(trimmed) || !trimmed.startsWith("מ") || marked.startsWith(trimmed)) {
      return trimmed;
    }
  }
  if (!trimmed.startsWith("מ") || trimmed.startsWith("מחברת")) {
    return trimmed;
  }
  if (MEM_COMPANY_START.test(trimmed)) {
    return trimmed;
  }
  const attached = new RegExp(`(?:^|\\s)${escapeRegex(trimmed)}(?:\\s|$|[.,])`, "u");
  if (!attached.test(message)) {
    return trimmed;
  }
  const peeled = trimmed.slice(1).trim();
  if (peeled.length < 2) {
    return trimmed;
  }
  if (MEM_COMPANY_START.test(peeled) || looksLikeCompanyName(peeled) || looksLikeCompanyName(trimmed)) {
    return peeled;
  }
  return trimmed;
}

export function extractContactPerson(message: string): ContactPersonHit | null {
  const patterns: Array<{ regex: RegExp; group: number }> = [
    { regex: /איש(?:\s+ה)?קשר\s+([א-ת]{2,12}(?:\s+[א-ת]{2,12})?)/u, group: 1 },
    { regex: /(?:שלח|שלחו|לשלוח)\s+ל([א-ת]{2,12}(?:\s+[א-ת]{2,12})?)/u, group: 1 },
    { regex: /(?:אסוף|אספו)\s+ל([א-ת]{2,12}(?:\s+[א-ת]{2,12})?)/u, group: 1 },
    { regex: /מ([א-ת]{2,12}\s+[א-ת]{2,12})\s+קבלן/u, group: 1 },
    { regex: /(?:אסוף|אספו|שלח|שלחו)\s+\S+\s+מ([א-ת]{2,12})(?:\s|$)/u, group: 1 },
  ];
  for (const item of patterns) {
    const match = message.match(item.regex);
    const parts = (match?.[item.group]?.trim() ?? "").split(/\s+/).filter((part) => part && !PERSON_SKIP.has(part));
    const value = parts.join(" ");
    if (!value || looksLikeCompanyName(value) || COMPANY_TOKENS.test(value)) {
      continue;
    }
    return { value, evidence: match?.[0]?.trim() ?? value };
  }
  return null;
}

export function contactPersonFromExtraction(
  message: string,
  extraction: { value: string | null; evidence: string | null } | null | undefined,
  organizationName: string | null,
): ContactPersonHit | null {
  const heuristic = extractContactPerson(message);
  const value = extraction?.value?.trim() ?? "";
  const evidence = extraction?.evidence?.trim() ?? "";
  if (value && evidence && message.includes(evidence) && !isCompanyDerivedContact(value, organizationName)) {
    if (extractContactPerson(evidence) || extractContactPerson(`${evidence} ${value}`) || heuristic?.value === value) {
      return { value, evidence };
    }
  }
  if (heuristic && !isCompanyDerivedContact(heuristic.value, organizationName)) {
    return heuristic;
  }
  return null;
}

export function withHebrewArticle(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return label;
  }
  if (parts.length === 1) {
    const word = parts[0] ?? "";
    return word.startsWith("ה") ? word : `ה${word}`;
  }
  const last = parts.at(-1) ?? "";
  if (last.startsWith("ה")) {
    return label.trim();
  }
  return `${parts.slice(0, -1).join(" ")} ה${last}`;
}

export function syncProposalWithIdentity(
  proposal: WorkflowDraftDefinition,
  identity: RecipientIdentity,
): WorkflowDraftDefinition {
  const organizationName = identity.organizationName?.trim() || null;
  const contactName =
    identity.contactResolution === "named" ? identity.contactName?.trim() || null : null;
  const email = identity.email?.trim() ?? "";
  return {
    ...proposal,
    recipientMode: proposal.recipientMode ?? "fixed",
    recipients: [
      {
        name: contactName ?? "",
        organizationName,
        email,
      },
    ],
  };
}

export function materializeRecipientForRuntime(
  proposal: WorkflowDraftDefinition,
  identity: RecipientIdentity,
): WorkflowDraftDefinition {
  const organizationName = identity.organizationName?.trim() || proposal.recipients[0]?.organizationName?.trim() || null;
  const contactName = identity.contactResolution === "named" ? identity.contactName?.trim() || null : null;
  const email = identity.email?.trim() || proposal.recipients[0]?.email?.trim() || "";
  const technicalName = contactName || organizationName || email;
  return {
    ...proposal,
    recipients: [
      {
        name: technicalName,
        organizationName,
        email,
      },
    ],
  };
}

export function statusFromIdentity(identity: RecipientIdentity): "unasked" | "named" | "none" {
  if (identity.contactResolution === "named") {
    return "named";
  }
  if (identity.contactResolution === "no_fixed_contact") {
    return "none";
  }
  return "unasked";
}

export function deriveRecipientIdentity(input: {
  recipientIdentity?: RecipientIdentity | null;
  contactPersonStatus?: "unasked" | "named" | "none";
  organizationName?: string | null;
  contactName?: string | null;
  email?: string | null;
}): RecipientIdentity {
  if (input.recipientIdentity) {
    return {
      organizationName: input.recipientIdentity.organizationName?.trim() || null,
      contactName:
        input.recipientIdentity.contactResolution === "named"
          ? input.recipientIdentity.contactName?.trim() || null
          : null,
      contactResolution: input.recipientIdentity.contactResolution,
      email: input.recipientIdentity.email?.trim() || null,
    };
  }
  const organizationName = input.organizationName?.trim() || null;
  const rawName = input.contactName?.trim() || null;
  const email = input.email?.trim() || null;
  if (input.contactPersonStatus === "named" && rawName && rawName !== organizationName) {
    return {
      organizationName,
      contactName: rawName,
      contactResolution: "named",
      email,
    };
  }
  if (input.contactPersonStatus === "none") {
    return {
      organizationName,
      contactName: null,
      contactResolution: "no_fixed_contact",
      email,
    };
  }
  return {
    organizationName,
    contactName: null,
    contactResolution: "pending",
    email,
  };
}

export function assertContactNotSkipped(
  state: {
    recipientIdentity: RecipientIdentity;
    requirements: Array<{ kind: string }>;
    pendingCompanyConfirm: string | null;
    awaitingCompanyName: boolean;
  },
  question: { key: string } | null,
) {
  const identity = state.recipientIdentity;
  const key = question?.key ?? "";
  if (identity.contactResolution !== "pending") {
    return;
  }
  if (!identity.organizationName?.trim()) {
    return;
  }
  if (state.awaitingCompanyName || state.pendingCompanyConfirm) {
    return;
  }
  if (key === "contact_name" || key === "recipient_contact") {
    return;
  }
  throw new Error("contact_question_skipped");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
