import { FILE_PRESET_MIME, type FilePresetId } from "@/lib/workflow/file-presets";
import type { WorkflowField } from "@/lib/workflow/schema";
import type { SetupRequirement } from "@/lib/workflow/setup-state";

const COMPANY_PATTERN = /מחברת\s+(.+?)(?:\s*[.,]|$)/u;
const COMPANY_BAAM_PATTERN = /מ(?:חברת\s+)?(.+?בע[״"]?מ)\.?/u;
const LOCATION_PATTERN = /\s*בקומה\s+\d+\s*(?:במגדל\s+\S+)?/gu;
const LEAD_PATTERN = /^(?:קבלת|צריך לאסוף|יש לאסוף|איסוף|אספו|אסוף|שלחו|שלח|בקשה ל|תהליך(?:\s+\S+)?(?:\s+ל)?)\s+/u;
const PERSON_TRAIL = /\s+מ(?!נהל|חברת)([א-ת]{2,12}(?:\s+[א-ת]{2,12})?)(?:\s+קבלן\s+[א-ת]+)?$/u;
const FORMAT_ONLY = /^(?:pdf|פידיאף|אקסל|excel|xlsx|xls|csv|תמונות|תמונה)$/i;
const ITEM_HEAD =
  /^(?:חשבונית|חשבוניות|אישור|סיכום|דוח|דוחות|תמונה|תמונות|חמש|קובץ|קבצים|מסמך|מסמכים|pdf|פידיאף|אקסל|excel)/i;

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

export function extractCompanyName(message: string) {
  const company = message.match(COMPANY_PATTERN)?.[1]?.trim();
  if (company) {
    return company.replace(/[.,]$/, "").trim();
  }
  const baam = message.match(COMPANY_BAAM_PATTERN)?.[1]?.trim();
  return baam ? baam.replace(/[.,]$/, "").trim() : null;
}

function normalizeItemLabel(raw: string) {
  return raw
    .replace(LOCATION_PATTERN, " ")
    .replace(/^אישור של\s+/, "אישור ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,\s]+|[,\s.]+$/g, "")
    .trim();
}

function classifyItem(label: string): Omit<SetupRequirement, "id"> {
  const lower = label.toLowerCase();
  if (/תמונ/.test(label)) {
    const count = label.match(/חמש|5/) ? 5 : undefined;
    return { label, kind: "file", filePreset: "images", maxFiles: count };
  }
  if (/\bpdf\b|פידיאף/.test(lower) && /אקסל|excel/.test(lower)) {
    return { label, kind: "file", filePreset: "all" };
  }
  if (/\bpdf\b|פידיאף/.test(lower)) {
    return { label, kind: "file", filePreset: "pdf" };
  }
  if (/אקסל|excel|xlsx|csv/.test(lower)) {
    return { label, kind: "file", filePreset: "excel" };
  }
  if (/חשבונית|חשבוניות|דוח|דוחות|קובץ|מסמך/.test(label)) {
    return { label, kind: "file", filePreset: "all" };
  }
  if (/אישור/.test(label)) {
    return { label, kind: "ambiguous" };
  }
  if (/סיכום/.test(label)) {
    return { label, kind: "text" };
  }
  return { label, kind: "file", filePreset: "all" };
}

function splitList(text: string) {
  const byComma = text
    .split(/,\s*|،\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const pieces: string[] = [];
  for (const part of byComma) {
    const split = part.split(/\s+ו(?=אישור|חשבונ|סיכום|דוח|תמונ|חמש|קובץ|מסמך|pdf|PDF|אקסל|excel)/u);
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
    {
      label: items.map((item) => item.label).join(" ו"),
      kind: "file" as const,
      filePreset: "all" as const,
    },
  ];
}

export function extractRequirementItems(message: string): SetupRequirement[] {
  let working = message.replace(COMPANY_PATTERN, " ").replace(COMPANY_BAAM_PATTERN, " ");
  working = working.replace(LOCATION_PATTERN, " ");
  working = working.replace(LEAD_PATTERN, "");
  working = working.replace(/לקבלת\s+|על\s+ביצוע\s+/g, (match) => (match.includes("ביצוע") ? match : ""));
  working = working.replace(PERSON_TRAIL, "");
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

export function requirementToField(item: SetupRequirement, id: string): WorkflowField | null {
  if (item.kind === "ambiguous") {
    return null;
  }
  if (item.kind === "file") {
    const preset = (item.filePreset ?? "all") as FilePresetId;
    return {
      id,
      type: "file",
      label: item.label,
      required: true,
      helpText: null,
      allowedMimeTypes: [...FILE_PRESET_MIME[preset]],
      maxFiles: item.maxFiles ?? 1,
      maxFileSizeMb: 10,
    };
  }
  if (item.kind === "confirmation") {
    return { id, type: "confirmation", label: item.label, required: true, helpText: null };
  }
  if (item.kind === "number") {
    return { id, type: "number", label: item.label, required: true, helpText: null };
  }
  if (item.kind === "date") {
    return { id, type: "date", label: item.label, required: true, helpText: null };
  }
  return { id, type: "long_text", label: item.label, required: true, helpText: null };
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
