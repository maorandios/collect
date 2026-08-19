import { he } from "@/lib/i18n/he";
import { FILE_PRESET_IDS, FILE_PRESET_MIME, type FilePresetId } from "@/lib/workflow/file-presets";
import type { WorkflowField } from "@/lib/workflow/schema";

export type FieldEditorInput = {
  id?: string;
  type: WorkflowField["type"];
  label: string;
  required: boolean;
  helpText?: string;
  filePreset?: FilePresetId;
  maxFiles?: number;
  maxFileSizeMb?: number;
};

export function validateFieldEditor(input: FieldEditorInput) {
  if (!input.label.trim()) {
    return he.studio.setup.fieldLabelRequired;
  }
  return null;
}

export function buildFieldFromEditor(input: FieldEditorInput, id: string): WorkflowField {
  const label = input.label.trim();
  if (input.type === "file") {
    const preset = input.filePreset ?? "all";
    return {
      id,
      type: "file",
      label,
      required: input.required,
      helpText: input.helpText?.trim() || null,
      allowedMimeTypes: [...FILE_PRESET_MIME[preset]],
      maxFiles: input.maxFiles && input.maxFiles > 0 ? input.maxFiles : 1,
      maxFileSizeMb: input.maxFileSizeMb && input.maxFileSizeMb > 0 ? input.maxFileSizeMb : 10,
    };
  }
  return {
    id,
    type: input.type,
    label,
    required: input.required,
    helpText: input.helpText?.trim() || null,
  };
}

export { FILE_PRESET_IDS };
