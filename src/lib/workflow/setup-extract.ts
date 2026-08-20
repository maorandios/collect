import { unconfiguredField } from "@/lib/workflow/draft-fields";
import type { DraftField } from "@/lib/workflow/draft-schema";
import { withSupportedFileField } from "@/lib/workflow/file-formats";
import { extractContactPerson, peelMemPreposition } from "@/lib/workflow/setup-identity";
import type { SetupRequirement } from "@/lib/workflow/setup-state";

const COMPANY_SPAN = /(?:מחברת|של חברת|חברת)\s+([^]+?בע[״"׳']?מ)/u;
const COMPANY_FROM = /(?:מחברת|של חברת)\s+(.+?)(?=\s+באופן|\s+כל\s|\s*[.,]|$)/u;
const COMPANY_MEM =
  /(?:^|\s)מ(?!חברת|נהל|פקח|סמך)([א-ת]{2,}(?:\s+(?:ל)?[א-ת]{2,})+)(?:\s*[.,]|$)/u;
const LOCATION_PATTERN = /\s*בקומה\s+\d+\s*(?:במגדל\s+\S+)?/gu;
const LEAD_PATTERN = /^(?:קבלת|צריך לאסוף|יש לאסוף|איסוף|אספו|אסוף|שלחו|שלח|בקשה ל|תהליך(?:\s+\S+)?(?:\s+ל)?)\s+/u;
const SCHEDULE_TAIL =
  /\s+באופן\s+(?:חודשי|שבועי|חד[\-־]?פעמי|ידני)|\s+פעם\s+ב(?:חודש|שבוע)|\s+מדי\s+(?:חודש|שבוע)|\s+בכל\s+(?:חודש|שבוע)|\s+כל\s+(?:חודש|שבוע|יום)/gu;
const FORMAT_ONLY = /^(?:pdf|פידיאף|אקסל|excel|xlsx|xls|csv|תמונות|תמונה)$/i;
const ITEM_HEAD =
  /^(?:חשבונית|חשבוניות|קבלה|קבלות|אישור|סיכום|דוח|דוחות|תדפיס|תמונה|תמונות|חמש|קובץ|קבצים|מסמך|מסמכים|פוליס|הצעת|pdf|פידיאף|אקסל|excel)/i;
const DOCUMENT_FILE =
  /חשבונית|חשבוניות|קבלה(?!ן)|קבלות|תדפיס(?:י)?\s*בנק|אישור ניכוי מס במקור|ניכוי מס במקור|אישור ניהול ספרים|פוליסת ביטוח|דוח שעות|הצעת מחיר/;
const HUMAN_APPROVAL =
  /אישור(?:\s+של)?\s+(?:מנהל(?:\s+האתר|\s+פרויקט)?|מפקח|ביצוע|פיקוח)/;
const DOCUMENT_ORG_BLOCK =
  /^(חשבונית|חשבוניות|קבלה|קבלות|אישור|סיכום|דוח|תדפיס|מסמך|קובץ)/;
const DOCUMENT_CHUNK =
  /^(אישור ניכוי מס במקור|אישור ניהול ספרים|פוליסת ביטוח|הצעת מחיר|תדפיסי?\s*בנק|דוח שעות(?:\s+עובדים)?|דוח עובדים|דוחות(?:\s+\S+)?|חשבוניות(?:\s+מס)?|חשבונית(?:\s+מס)?|קבלות|קבלה(?!ן)|אישור(?:\s+של)?\s+(?:מנהל(?:\s+(?:ה)?(?:אתר|פרויקט))?|מפקח(?:\s+(?:ה)?אתר)?|ביצוע|פיקוח(?:\s+על\s+ביצוע)?))/;

export type ExtractedSetupFacts = {
  items: SetupRequirement[];
  companyName: string | null;
  emails: string[];
};

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function extractEmails(message: string) {
  return (message.match(/[^\s@]+@[^\s@]+\.[^\s@]+/g) ?? []).filter(looksLikeEmail);
}

export function normalizeCompanyName(name: string) {
  return name
    .replace(/בע["'׳]?מ/g, "בע״מ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,\s]+|[,\s.]+$/g, "")
    .trim();
}

export function extractCompanySpan(message: string): { name: string; sourcePhrase: string } | null {
  const withLtd = message.match(COMPANY_SPAN);
  const ltdName = withLtd?.[1]?.trim();
  if (ltdName && !DOCUMENT_ORG_BLOCK.test(ltdName)) {
    return {
      name: peelMemPreposition(normalizeCompanyName(ltdName), message),
      sourcePhrase: withLtd?.[0]?.trim() ?? ltdName,
    };
  }
  const fromCompany = message.match(COMPANY_FROM);
  const fromName = fromCompany?.[1]?.trim();
  if (fromName && !DOCUMENT_ORG_BLOCK.test(fromName)) {
    return {
      name: peelMemPreposition(normalizeCompanyName(fromName), message),
      sourcePhrase: fromCompany?.[0]?.trim() ?? fromName,
    };
  }
  const fromMem = message.match(COMPANY_MEM);
  const memName = fromMem?.[1]?.trim();
  if (
    memName &&
    !DOCUMENT_ORG_BLOCK.test(memName) &&
    /תעשיות|מתכת|מתכות|חברה|נכסים|ביטוח|מפעל|בע|בני[יה]|בנייה/.test(memName)
  ) {
    return {
      name: normalizeCompanyName(memName),
      sourcePhrase: fromMem?.[0]?.trim() ?? memName,
    };
  }
  return null;
}

export function extractCompanyName(message: string) {
  return extractCompanySpan(message)?.name ?? null;
}

export function companyNameFromOriginal(message: string, candidate: string | null | undefined) {
  const fromText = extractCompanyName(message);
  if (fromText) {
    return fromText;
  }
  const trimmed = candidate?.trim() ?? "";
  if (!trimmed || DOCUMENT_ORG_BLOCK.test(trimmed)) {
    return null;
  }
  const normalized = peelMemPreposition(normalizeCompanyName(trimmed), message);
  const compactMessage = message.replace(/[״"׳']/g, "");
  const compactName = normalized.replace(/[״"׳']/g, "");
  if (compactName.length >= 4 && compactMessage.includes(compactName.replace(/בעמ$/, "בעמ"))) {
    const index = compactMessage.indexOf(compactName);
    if (index >= 0) {
      return normalizeCompanyName(message.slice(index, index + trimmed.length + 2).match(/.+?בע[״"׳']?מ/)?.[0] ?? normalized);
    }
    return normalized;
  }
  return null;
}

function normalizeItemLabel(raw: string) {
  return raw
    .replace(LOCATION_PATTERN, " ")
    .replace(/^אישור של\s+/, "אישור ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,\s]+|[,\s.]+$/g, "")
    .replace(/\s+של$/u, "")
    .trim();
}

export function refineRequirementKind(item: Omit<SetupRequirement, "id"> & { id?: string }): Omit<SetupRequirement, "id"> & { id?: string } {
  if (/דוח עובדים/.test(item.label) && !/דוח שעות/.test(item.label)) {
    return { ...item, kind: "ambiguous" };
  }
  if (DOCUMENT_FILE.test(item.label) && item.kind === "ambiguous") {
    return withSupportedFileField({ ...item, kind: "file", filePreset: item.filePreset ?? "all" });
  }
  if (item.kind === "file") {
    return withSupportedFileField(item);
  }
  return item;
}

function classifyItem(label: string): Omit<SetupRequirement, "id"> {
  const lower = label.toLowerCase();
  if (/תמונ/.test(label)) {
    const count = label.match(/חמש|5/) ? 5 : undefined;
    return withSupportedFileField({ label, kind: "file", filePreset: "images", maxFiles: count });
  }
  if (/\bpdf\b|פידיאף/.test(lower) && /אקסל|excel/.test(lower)) {
    return withSupportedFileField({ label, kind: "file", filePreset: "all" });
  }
  if (/\bpdf\b|פידיאף/.test(lower)) {
    return withSupportedFileField({ label, kind: "file", filePreset: "pdf" });
  }
  if (/אקסל|excel|xlsx|csv/.test(lower)) {
    return withSupportedFileField({ label, kind: "file", filePreset: "excel" });
  }
  if (DOCUMENT_FILE.test(label)) {
    return withSupportedFileField({ label, kind: "file", filePreset: "all" });
  }
  if (/דוח שעות/.test(label)) {
    return withSupportedFileField({ label, kind: "file", filePreset: "all" });
  }
  if (/דוח|דוחות/.test(label)) {
    return { label, kind: "ambiguous" };
  }
  if (/קובץ|מסמך/.test(label)) {
    return withSupportedFileField({ label, kind: "file", filePreset: "all" });
  }
  if (HUMAN_APPROVAL.test(label) || /אישור/.test(label)) {
    return { label, kind: "ambiguous" };
  }
  if (/סיכום/.test(label)) {
    return { label, kind: "text" };
  }
  return withSupportedFileField({ label, kind: "file", filePreset: "all" });
}

function splitAdjacentDocuments(text: string) {
  const items: string[] = [];
  let rest = text.trim();
  while (rest) {
    rest = rest.replace(/^[,\s+]+/u, "").replace(/^ו(?=חשבונ|קבל|תדפיס|דוח|אישור)/u, "").trim();
    if (!rest) {
      break;
    }
    const match = rest.match(DOCUMENT_CHUNK);
    if (!match) {
      break;
    }
    items.push(normalizeItemLabel(match[0]));
    rest = rest.slice(match[0].length);
  }
  return items.length >= 2 ? items : null;
}

function splitList(text: string) {
  const byPlusOrComma = text
    .split(/\s*\+\s*|,\s*|،\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const pieces: string[] = [];
  for (const part of byPlusOrComma) {
    const adjacent = splitAdjacentDocuments(part);
    if (adjacent) {
      pieces.push(...adjacent);
      continue;
    }
    const split = part.split(
      /(?:\s+|(?<=[א-ת0-9]))ו(?=אישור|חשבונ|קבל|סיכום|דוח|תדפיס|תמונ|חמש|קובץ|מסמך|פוליס|הצעת|pdf|PDF|אקסל|excel)/u,
    );
    if (split.length > 1 && split.every((item) => ITEM_HEAD.test(item.trim()))) {
      pieces.push(...split.map((item) => item.trim()));
    } else {
      pieces.push(part);
    }
  }
  return pieces.map(normalizeItemLabel).filter(Boolean);
}

function mergeFormatOnly(items: Array<Omit<SetupRequirement, "id">>) {
  if (items.length < 2 || !items.every((item) => FORMAT_ONLY.test(item.label))) {
    return items;
  }
  return [
    withSupportedFileField({
      label: items.map((item) => item.label).join(" ו"),
      kind: "file" as const,
      filePreset: "all" as const,
    }),
  ];
}

export function splitAtomicItemLabel(label: string): string[] {
  const trimmed = normalizeItemLabel(label);
  if (!trimmed) {
    return [];
  }
  const adjacent = splitAdjacentDocuments(trimmed);
  if (adjacent && adjacent.length >= 2) {
    return adjacent;
  }
  const parts = splitList(trimmed);
  return parts.length > 0 ? parts : [trimmed];
}

export function extractRequirementItems(message: string): SetupRequirement[] {
  let working = message.replace(COMPANY_SPAN, " ").replace(COMPANY_FROM, " ");
  working = working.replace(COMPANY_MEM, " ");
  working = working.replace(LOCATION_PATTERN, " ");
  working = working.replace(SCHEDULE_TAIL, " ");
  working = working.replace(LEAD_PATTERN, "");
  working = working.replace(/לקבלת\s+|על\s+ביצוע\s+/g, (match) => (match.includes("ביצוע") ? match : ""));
  const person = extractContactPerson(message);
  if (person?.evidence) {
    working = working.replace(person.evidence, " ");
  }
  const source = normalizeItemLabel(working);
  if (!source) {
    return [];
  }
  const parts = source.split(/\s+בצירוף\s+/u);
  const rawItems = mergeFormatOnly(parts.flatMap((part) => splitList(part)).map(classifyItem));
  return rawItems
    .filter((item) => item.label.length >= 2)
    .map((item, index) => ({
      ...item,
      id: `req-${index + 1}`,
    }));
}

export function extractSetupFacts(message: string): ExtractedSetupFacts {
  return {
    items: extractRequirementItems(message),
    companyName: extractCompanyName(message),
    emails: extractEmails(message),
  };
}

export function requirementToField(item: SetupRequirement, id: string): DraftField {
  return unconfiguredField(id, item.label);
}

export function joinHebrewItems(labels: string[]) {
  if (labels.length === 0) {
    return "";
  }
  if (labels.length === 1) {
    return labels[0] ?? "";
  }
  if (labels.length === 2) {
    return `${labels[0]} ו${labels[1]}`;
  }
  return `${labels.slice(0, -1).join(", ")} ו${labels.at(-1)}`;
}
