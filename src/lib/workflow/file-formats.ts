import { he } from "@/lib/i18n/he";
import { FILE_PRESET_MIME } from "@/lib/workflow/file-presets";

export const ALL_SUPPORTED_FILE_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

const SETUP_MIME = new Set<string>(ALL_SUPPORTED_FILE_MIME_TYPES);

export function supportedFileMimeTypes() {
  return [...ALL_SUPPORTED_FILE_MIME_TYPES];
}

export function uniqueMimeTypes(types: string[]) {
  const next: string[] = [];
  for (const type of types) {
    if (type !== "*/*" && (SETUP_MIME.has(type) || FILE_PRESET_MIME.all.includes(type)) && !next.includes(type)) {
      next.push(type);
    }
  }
  return next;
}

export function resolvedAllowedMimeTypes(types: string[] | null | undefined) {
  const unique = uniqueMimeTypes(types ?? []);
  return unique.length > 0 ? unique : supportedFileMimeTypes();
}

function sameSet(left: string[], right: readonly string[]) {
  return left.length === right.length && left.every((type) => right.includes(type));
}

export function fileFormatLabel(types: string[] | null | undefined) {
  const list = uniqueMimeTypes(types ?? []);
  if (list.length === 0 || sameSet(list, ALL_SUPPORTED_FILE_MIME_TYPES) || sameSet(list, FILE_PRESET_MIME.all)) {
    return he.studio.setup.formatAll;
  }
  if (sameSet(list, ["application/pdf"])) {
    return he.studio.setup.formatPdf;
  }
  if (
    sameSet(list, [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ]) ||
    sameSet(list, FILE_PRESET_MIME.excel)
  ) {
    return he.studio.setup.formatExcelCsv;
  }
  if (sameSet(list, ["image/jpeg", "image/png", "image/webp"]) || sameSet(list, FILE_PRESET_MIME.images)) {
    return he.studio.setup.formatImages;
  }
  return he.studio.setup.formatAll;
}

export function withSupportedFileField<T extends { kind: string }>(item: T): T & { allowedMimeTypes: string[] } {
  if (item.kind !== "file") {
    return item as T & { allowedMimeTypes: string[] };
  }
  return {
    ...item,
    allowedMimeTypes: supportedFileMimeTypes(),
  };
}
