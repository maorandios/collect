export const FILE_PRESET_IDS = ["all", "pdf", "excel", "images", "video"] as const;
export type FilePresetId = (typeof FILE_PRESET_IDS)[number];

export const FILE_PRESET_MIME: Record<FilePresetId, string[]> = {
  all: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/quicktime",
  ],
  pdf: ["application/pdf"],
  excel: [
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
  ],
  images: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  video: ["video/mp4", "video/quicktime"],
};

const SAFE_MIME = new Set(FILE_PRESET_MIME.all);

export function sanitizeMimeTypes(types: string[]) {
  const allowed = types.filter((type) => SAFE_MIME.has(type));
  return allowed.length > 0 ? [...new Set(allowed)] : [...FILE_PRESET_MIME.all];
}

export function filePresetFromMimeTypes(types: string[]): FilePresetId {
  const normalized = [...new Set(types)].sort().join("|");
  for (const id of FILE_PRESET_IDS) {
    if ([...FILE_PRESET_MIME[id]].sort().join("|") === normalized) {
      return id;
    }
  }
  return "all";
}

export function detectExplicitFilePreset(text: string): FilePresetId | null {
  const haystack = text.toLowerCase();
  if (/\bpdf\b|פידיאף/.test(haystack)) {
    return "pdf";
  }
  if (/excel|xlsx|xls|csv|אקסל|גיליון/.test(haystack)) {
    return "excel";
  }
  if (/וידאו|סרטון|video|mp4/.test(haystack)) {
    return "video";
  }
  if (/תמונות|תמונה|צילום|jpg|jpeg|png|webp/.test(haystack)) {
    return "images";
  }
  return null;
}

export function resolveFileMimeTypes({
  label,
  userMessage,
  incoming,
}: {
  label: string;
  userMessage: string;
  incoming: string[];
}) {
  const explicit = detectExplicitFilePreset(`${userMessage} ${label}`);
  if (explicit) {
    return [...FILE_PRESET_MIME[explicit]];
  }
  const safeIncoming = incoming.filter((type) => SAFE_MIME.has(type));
  if (safeIncoming.length === 1 && safeIncoming[0] === "application/pdf") {
    return [...FILE_PRESET_MIME.all];
  }
  if (safeIncoming.length > 0) {
    return sanitizeMimeTypes(safeIncoming);
  }
  return [...FILE_PRESET_MIME.all];
}
