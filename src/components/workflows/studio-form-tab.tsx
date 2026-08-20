"use client";

import { useState } from "react";

import { FormRenderer } from "@/components/forms/form-renderer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { he } from "@/lib/i18n/he";
import { configuredFields, isUnconfiguredField } from "@/lib/workflow/draft-fields";
import type { DraftField, WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import { buildFieldFromEditor, validateFieldEditor, type FieldEditorInput } from "@/lib/workflow/field-editor";
import type { EditorLockKey } from "@/lib/workflow/editor-locks";
import { fileLimitsSimpleLabel } from "@/lib/workflow/studio-display";
import type { WorkflowField } from "@/lib/workflow/schema";

const SELECT_CLASS =
  "h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring";

const FIELD_TYPES: Array<WorkflowField["type"]> = [
  "short_text",
  "long_text",
  "number",
  "date",
  "confirmation",
  "file",
];

const UNCONFIGURED_TYPE_CHOICES: Array<{ type: WorkflowField["type"]; label: string }> = [
  { type: "file", label: he.studio.setup.inputTypeFile },
  { type: "short_text", label: he.studio.setup.inputTypeShortText },
  { type: "long_text", label: he.studio.setup.inputTypeLongText },
  { type: "number", label: he.studio.setup.inputTypeNumber },
  { type: "date", label: he.studio.setup.inputTypeDate },
  { type: "confirmation", label: he.studio.setup.inputTypeConfirmation },
];

export function StudioFormTab({
  draft,
  senderName,
  readOnly,
  onEdit,
}: {
  draft: WorkflowDraftDefinition;
  senderName: string;
  readOnly: boolean;
  onEdit: (draft: WorkflowDraftDefinition, locks: EditorLockKey[]) => void | Promise<boolean>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const previewFields = configuredFields(draft.fields);

  function commit(fields: DraftField[]) {
    onEdit({ ...draft, fields }, ["fields"]);
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...draft.fields];
    const target = index + direction;
    if (target < 0 || target >= next.length) {
      return;
    }
    const current = next[index];
    const swap = next[target];
    if (!current || !swap) {
      return;
    }
    next[index] = swap;
    next[target] = current;
    commit(next);
  }

  function assignType(field: DraftField, type: WorkflowField["type"]) {
    const next = buildFieldFromEditor(
      {
        type,
        label: field.label,
        required: field.required,
        helpText: field.helpText ?? "",
      },
      field.id,
    );
    commit(draft.fields.map((item) => (item.id === field.id ? next : item)));
  }

  return (
    <div className="space-y-6">
      <FormRenderer
        mode="preview"
        senderName={senderName}
        definition={{
          name: draft.name,
          email: draft.email,
          fields: previewFields,
        }}
      />
      <div className="space-y-3">
        {draft.fields.map((field, index) =>
          isUnconfiguredField(field) ? (
            <div key={field.id} className="rounded-xl border border-border bg-muted/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{field.label || he.studio.notSet}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{he.studio.setup.chooseInputType}</p>
                </div>
                {readOnly ? null : (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="ghost" className="h-8" onClick={() => move(index, -1)}>
                      {he.studio.moveUp}
                    </Button>
                    <Button type="button" variant="ghost" className="h-8" onClick={() => move(index, 1)}>
                      {he.studio.moveDown}
                    </Button>
                    {pendingDelete === field.id ? (
                      <>
                        <Button
                          type="button"
                          variant="destructive"
                          className="h-8"
                          onClick={() => {
                            commit(draft.fields.filter((item) => item.id !== field.id));
                            setPendingDelete(null);
                          }}
                        >
                          {he.studio.deleteField}
                        </Button>
                        <Button type="button" variant="ghost" className="h-8" onClick={() => setPendingDelete(null)}>
                          {he.actions.cancel}
                        </Button>
                      </>
                    ) : (
                      <Button type="button" variant="ghost" className="h-8" onClick={() => setPendingDelete(field.id)}>
                        {he.studio.deleteField}
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {pendingDelete === field.id ? <p className="mt-2 text-xs text-destructive">{he.studio.confirmDeleteField}</p> : null}
              {readOnly ? null : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {UNCONFIGURED_TYPE_CHOICES.map((choice) => (
                    <Button
                      key={choice.type}
                      type="button"
                      variant="outline"
                      className="h-8"
                      onClick={() => assignType(field, choice.type)}
                    >
                      {choice.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          ) : (
          <div key={field.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{field.label || he.studio.notSet}</p>
                {field.type === "file" ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fileLimitsSimpleLabel({
                      allowedMimeTypes: field.allowedMimeTypes,
                      maxFileSizeMb: field.maxFileSizeMb,
                    })}
                  </p>
                ) : null}
              </div>
              {readOnly ? null : (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="ghost" className="h-8" onClick={() => move(index, -1)}>
                    {he.studio.moveUp}
                  </Button>
                  <Button type="button" variant="ghost" className="h-8" onClick={() => move(index, 1)}>
                    {he.studio.moveDown}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8"
                    onClick={() => setEditingId(editingId === field.id ? null : field.id)}
                  >
                    {he.studio.editField}
                  </Button>
                  {pendingDelete === field.id ? (
                    <>
                      <Button
                        type="button"
                        variant="destructive"
                        className="h-8"
                        onClick={() => {
                          commit(draft.fields.filter((item) => item.id !== field.id));
                          setPendingDelete(null);
                        }}
                      >
                        {he.studio.deleteField}
                      </Button>
                      <Button type="button" variant="ghost" className="h-8" onClick={() => setPendingDelete(null)}>
                        {he.actions.cancel}
                      </Button>
                    </>
                  ) : (
                    <Button type="button" variant="ghost" className="h-8" onClick={() => setPendingDelete(field.id)}>
                      {he.studio.deleteField}
                    </Button>
                  )}
                </div>
              )}
            </div>
            {pendingDelete === field.id ? <p className="mt-2 text-xs text-destructive">{he.studio.confirmDeleteField}</p> : null}
            {editingId === field.id ? (
              <FieldEditor
                field={field}
                submitLabel={he.studio.saveEdit}
                onSave={(next) => {
                  commit(draft.fields.map((item) => (item.id === field.id ? next : item)));
                  setEditingId(null);
                }}
              />
            ) : null}
          </div>
          ),
        )}
        {readOnly ? null : (
          <Button type="button" variant="outline" className="h-10" onClick={() => setAdding(true)}>
            {he.studio.addField}
          </Button>
        )}
      </div>
      {adding ? (
        <FieldEditorDialog
          onCancel={() => setAdding(false)}
          onAdd={(field) => {
            commit([...draft.fields, field]);
            setAdding(false);
          }}
        />
      ) : null}
    </div>
  );
}

function FieldEditorDialog({
  onCancel,
  onAdd,
}: {
  onCancel: () => void;
  onAdd: (field: WorkflowField) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6">
        <p className="text-lg font-medium">{he.studio.setup.addFieldTitle}</p>
        <FieldEditor
          field={null}
          submitLabel={he.studio.setup.addFieldAction}
          error={error}
          onSave={(field) => {
            const message = validateFieldEditor({
              type: field.type,
              label: field.label,
              required: field.required,
              helpText: field.helpText ?? "",
              maxFiles: field.type === "file" ? field.maxFiles : undefined,
              maxFileSizeMb: field.type === "file" ? field.maxFileSizeMb : undefined,
            });
            if (message) {
              setError(message);
              return;
            }
            onAdd({ ...field, id: "pending" });
          }}
        />
        <Button type="button" variant="ghost" className="mt-3 h-9" onClick={onCancel}>
          {he.actions.cancel}
        </Button>
      </div>
    </div>
  );
}

function FieldEditor({
  field,
  onSave,
  submitLabel,
  error,
}: {
  field: WorkflowField | null;
  onSave: (field: WorkflowField) => void;
  submitLabel: string;
  error?: string | null;
}) {
  const [label, setLabel] = useState(field?.label ?? "");
  const [type, setType] = useState<WorkflowField["type"]>(field?.type ?? "short_text");
  const [required, setRequired] = useState(field?.required ?? true);
  const [helpText, setHelpText] = useState(field?.helpText ?? "");
  const [localError, setLocalError] = useState<string | null>(error ?? null);
  const [maxFiles, setMaxFiles] = useState(field?.type === "file" ? field.maxFiles : 1);
  const [maxFileSizeMb, setMaxFileSizeMb] = useState(field?.type === "file" ? field.maxFileSizeMb : 10);

  function save() {
    const input: FieldEditorInput = {
      type,
      label,
      required,
      helpText,
      maxFiles,
      maxFileSizeMb,
    };
    const message = validateFieldEditor(input);
    if (message) {
      setLocalError(message);
      return;
    }
    setLocalError(null);
    onSave(buildFieldFromEditor(input, field?.id && field.id !== "pending" ? field.id : "pending"));
  }

  return (
    <div className="mt-4 space-y-3">
      <Input className="h-10" value={label} onChange={(event) => setLabel(event.target.value)} placeholder={he.studio.fieldLabel} />
      <select className={SELECT_CLASS} value={type} onChange={(event) => setType(event.target.value as WorkflowField["type"])}>
        {FIELD_TYPES.map((item) => (
          <option key={item} value={item}>
            {he.workflow.fieldTypes[item]}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} />
        {he.studio.requiredToggle}
      </label>
      <Input className="h-10" value={helpText} onChange={(event) => setHelpText(event.target.value)} placeholder={he.studio.helpTextLabel} />
      {type === "file" ? (
        <>
          <Input
            className="h-10"
            type="number"
            min={1}
            value={maxFiles}
            onChange={(event) => setMaxFiles(Number(event.target.value) || 1)}
          />
          <Input
            className="h-10"
            type="number"
            min={1}
            value={maxFileSizeMb}
            onChange={(event) => setMaxFileSizeMb(Number(event.target.value) || 10)}
          />
        </>
      ) : null}
      {localError || error ? <p className="text-sm text-destructive">{localError ?? error}</p> : null}
      <Button type="button" className="h-9" onClick={save}>
        {submitLabel}
      </Button>
    </div>
  );
}
