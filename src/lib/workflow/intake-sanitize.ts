import {
  emptyInitialWorkflowExtraction,
  type InitialCollectionItem,
  type InitialWorkflowExtraction,
} from "@/lib/workflow/intake-extraction";
import {
  extractCompanySpan,
  extractRequirementItems,
  normalizeCompanyName,
  splitAtomicItemLabel,
} from "@/lib/workflow/setup-extract";
import { peelMemPreposition } from "@/lib/workflow/setup-identity";
import { isNonBusinessFieldLabel } from "@/lib/workflow/setup-validate";

const COMPANY_PREFIX = /^(?:מחברת|של חברת|חברת)\s+/u;
const COMPOUND_DELIVERABLE =
  /(?:\s+|,|\+)\s*ו?(?:גם\s+)?(?=אישור|חשבונ|קבל|סיכום|דוח|תדפיס|תמונ|חמש|קובץ|מסמך|פוליס|הצעת)|(?<=[א-ת0-9])ו(?=אישור|חשבונ|קבל|סיכום|דוח|תדפיס|תמונ|קובץ|מסמך|פוליס|הצעת)/u;

export type AtomicExtractionValidation =
  | { ok: true }
  | { ok: false; reasons: string[] };

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compact(value: string) {
  return value.replace(/[״"׳'\s]/g, "");
}

function normalizeLabel(value: string) {
  return value.replace(/\s{2,}/g, " ").replace(/^[,\s]+|[,\s.]+$/g, "").trim();
}

export function normalizeOrganizationName(name: string, message: string) {
  const stripped = name.trim().replace(COMPANY_PREFIX, "");
  return peelMemPreposition(normalizeCompanyName(stripped), message);
}

function containsPhrase(haystack: string, needle: string) {
  const phrase = needle.trim();
  if (!phrase) {
    return false;
  }
  if (haystack.includes(phrase)) {
    return true;
  }
  const compactHaystack = compact(haystack);
  const compactNeedle = compact(phrase);
  return compactNeedle.length >= 4 && compactHaystack.includes(compactNeedle);
}

function stripCompanyFromText(text: string, organizationName: string | null, organizationSource: string | null) {
  let next = text;
  const phrases = [organizationSource, organizationName].filter((value): value is string => Boolean(value?.trim()));
  for (const phrase of phrases) {
    const peeled = phrase.replace(COMPANY_PREFIX, "").replace(/^מ/, "");
    next = next.replace(new RegExp(escapeRegex(phrase), "gu"), " ");
    if (peeled && peeled !== phrase) {
      next = next.replace(new RegExp(`(?:מחברת|של חברת|חברת|מ)${escapeRegex(peeled)}`, "gu"), " ");
      next = next.replace(new RegExp(escapeRegex(peeled), "gu"), " ");
    }
  }
  next = next.replace(COMPANY_PREFIX, " ");
  return normalizeLabel(next);
}

function looksLikeCompoundDeliverable(label: string) {
  return COMPOUND_DELIVERABLE.test(label);
}

function sourceOverlapsCompany(sourcePhrase: string, organizationSource: string | null, organizationName: string | null) {
  const source = sourcePhrase.trim();
  if (!source) {
    return false;
  }
  const companySource = organizationSource?.trim() ?? "";
  if (companySource && (source === companySource || compact(source) === compact(companySource))) {
    return true;
  }
  const name = organizationName?.trim() ?? "";
  return Boolean(name && (source === name || compact(source) === compact(name)));
}

export function expectedAtomicItemCount(message: string) {
  return extractRequirementItems(message).filter((item) => !isNonBusinessFieldLabel(item.label)).length;
}

function uniqueItems(items: InitialCollectionItem[]) {
  const unique: InitialCollectionItem[] = [];
  for (const item of items) {
    const label = normalizeLabel(item.label);
    if (!label || isNonBusinessFieldLabel(label)) {
      continue;
    }
    if (unique.some((existing) => existing.label === label || compact(existing.label) === compact(label))) {
      continue;
    }
    unique.push({ label, sourcePhrase: normalizeLabel(item.sourcePhrase) || label });
  }
  return unique;
}

export function sanitizeInitialExtraction(
  input: string,
  extraction: InitialWorkflowExtraction,
): InitialWorkflowExtraction {
  const span = extractCompanySpan(input);
  const organizationSource =
    extraction.recipient.organizationSourcePhrase?.trim() || span?.sourcePhrase || null;
  const organizationName = normalizeOrganizationName(
    extraction.recipient.organizationName?.trim() || span?.name || "",
    input,
  ) || span?.name || null;

  const expanded: InitialCollectionItem[] = [];
  for (const item of extraction.collectionItems) {
    const withoutCompany = stripCompanyFromText(item.label, organizationName, organizationSource);
    const parts = splitAtomicItemLabel(withoutCompany);
    const labels = parts.length > 0 ? parts : withoutCompany ? [withoutCompany] : [];
    for (const label of labels) {
      const clean = stripCompanyFromText(label, organizationName, organizationSource);
      if (!clean || sourceOverlapsCompany(clean, organizationSource, organizationName)) {
        continue;
      }
      expanded.push({
        label: clean,
        sourcePhrase: stripCompanyFromText(item.sourcePhrase, organizationName, organizationSource) || clean,
      });
    }
  }

  return {
    ...extraction,
    collectionItems: uniqueItems(expanded),
    recipient: {
      ...extraction.recipient,
      organizationName,
      organizationSourcePhrase: organizationSource,
    },
  };
}

export function validateAtomicExtraction(
  input: string,
  extraction: InitialWorkflowExtraction,
): AtomicExtractionValidation {
  const reasons: string[] = [];
  const organizationName = extraction.recipient.organizationName?.trim() || null;
  const organizationSource = extraction.recipient.organizationSourcePhrase?.trim() || null;
  for (const item of extraction.collectionItems) {
    if (organizationName && containsPhrase(item.label, organizationName)) {
      reasons.push("label_contains_company");
    }
    if (organizationSource && containsPhrase(item.label, organizationSource)) {
      reasons.push("label_contains_company_source");
    }
    if (sourceOverlapsCompany(item.sourcePhrase, organizationSource, organizationName)) {
      reasons.push("source_is_company");
    }
    if (looksLikeCompoundDeliverable(item.label)) {
      reasons.push("compound_deliverable");
    }
  }
  const expected = expectedAtomicItemCount(input);
  if (expected > 0 && extraction.collectionItems.length < expected) {
    reasons.push("missing_deliverables");
  }
  if (reasons.length === 0) {
    return { ok: true };
  }
  return { ok: false, reasons: [...new Set(reasons)] };
}

export function heuristicIntakeExtraction(input: string): InitialWorkflowExtraction {
  const span = extractCompanySpan(input);
  const items = extractRequirementItems(input)
    .filter((item) => !isNonBusinessFieldLabel(item.label))
    .map((item) => ({ label: item.label, sourcePhrase: item.label }));
  return {
    ...emptyInitialWorkflowExtraction(),
    collectionItems: uniqueItems(items),
    recipient: {
      organizationName: span?.name ?? null,
      organizationSourcePhrase: span?.sourcePhrase ?? null,
      contactName: null,
      email: null,
    },
  };
}

export function preferAtomicExtraction(
  input: string,
  primary: InitialWorkflowExtraction,
  secondary: InitialWorkflowExtraction,
) {
  const left = validateAtomicExtraction(input, primary);
  const right = validateAtomicExtraction(input, secondary);
  if (left.ok && !right.ok) {
    return primary;
  }
  if (right.ok && !left.ok) {
    return secondary;
  }
  return secondary.collectionItems.length > primary.collectionItems.length ? secondary : primary;
}
