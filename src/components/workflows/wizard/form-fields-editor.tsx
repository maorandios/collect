"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { he } from "@/lib/i18n/he";
import { isUnconfiguredField, unconfiguredField } from "@/lib/workflow/draft-fields";
import type { DraftField, WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import { buildFieldFromEditor } from "@/lib/workflow/field-editor";
import { fileLimitsSimpleLabel } from "@/lib/workflow/studio-display";
import { syncProposalEmail } from "@/lib/workflow/setup-email";
import type { WorkflowField } from "@/lib/workflow/schema";

const SELECT_CLASS =
  "h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring";

const TYPE_CHOICES: Array<{ type: WorkflowField["type"]; label: string }> = [
  { type: "file", label: he.studio.setup.inputTypeFile },
  { type: "short_text", label: he.studio.setup.inputTypeShortText },
  { type: "long_text", label: he.studio.setup.inputTypeLongText },
  { type: "number", label: he.studio.setup.inputTypeNumber },
  { type: "date", label: he.studio.setup.inputTypeDate },
  { type: "confirmation", label: he.studio.setup.inputTypeConfirmation },
];

export function FormFieldsEditor({
  draft,
  readOnly,
  onChange,
}: {
  draft: WorkflowDraftDefinition;
  readOnly: boolean;
  onChange: (draft: WorkflowDraftDefinition) => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  function commit(fields: DraftField[]) {
    onChange(syncProposalEmail({ ...draft, fields }));
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
    commit(
      draft.fields.map((item) =>
        item.id === field.id
          ? buildFieldFromEditor(
              {
                type,
                label: field.label,
                required: field.required,
                helpText: field.helpText ?? "",
              },
              field.id,
            )
          : item,
      ),
    );
  }

  function setAllFiles() {
    commit(
      draft.fields.map((field) =>
        buildFieldFromEditor(
          {
            type: "file",
            label: field.label,
            required: field.required,
            helpText: field.helpText ?? "",
          },
          field.id,
        ),
      ),
    );
  }

  return (
    <div className="space-y-3">
      {draft.fields.map((field, index) => (
        <div
          key={field.id}
          className={
            isUnconfiguredField(field)
              ? "rounded-xl border border-border bg-muted/70 p-4"
              : "rounded-xl border border-border bg-surface p-4"
          }
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-2">
              {readOnly ? (
                <p className="text-sm font-medium">{field.label}</p>
              ) : (
                <Input
                  className="h-10"
                  value={field.label}
                  onChange={(event) =>
                    commit(
                      draft.fields.map((item) =>
                        item.id === field.id ? { ...item, label: event.target.value || item.label } : item,
                      ),
                    )
                  }
                />
              )}
              {isUnconfiguredField(field) ? (
                <p className="text-xs text-muted-foreground">{he.wizard.inputUnconfigured}</p>
              ) : field.type === "file" ? (
                <p className="text-xs text-muted-foreground">
                  {fileLimitsSimpleLabel({
                    allowedMimeTypes: field.allowedMimeTypes,
                    maxFileSizeMb: field.maxFileSizeMb,
                  })}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">{he.workflow.fieldTypes[field.type]}</p>
              )}
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
          {readOnly ? null : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <select
                className={SELECT_CLASS}
                value={isUnconfiguredField(field) ? "" : field.type}
                onChange={(event) => {
                  const type = event.target.value as WorkflowField["type"];
                  if (type) {
                    assignType(field, type);
                  }
                }}
              >
                <option value="">{he.wizard.inputUnconfigured}</option>
                {TYPE_CHOICES.map((choice) => (
                  <option key={choice.type} value={choice.type}>
                    {choice.label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(event) =>
                    commit(
                      draft.fields.map((item) =>
                        item.id === field.id ? { ...item, required: event.target.checked } : item,
                      ),
                    )
                  }
                />
                {he.studio.requiredToggle}
              </label>
            </div>
          )}
        </div>
      ))}
      {readOnly ? null : (
        <>
          {adding ? (
            <div className="flex gap-2">
              <Input
                className="h-10"
                value={newLabel}
                placeholder={he.studio.fieldLabel}
                onChange={(event) => setNewLabel(event.target.value)}
              />
              <Button
                type="button"
                className="h-10"
                disabled={!newLabel.trim()}
                onClick={() => {
                  commit([...draft.fields, unconfiguredField(crypto.randomUUID(), newLabel.trim())]);
                  setNewLabel("");
                  setAdding(false);
                }}
              >
                {he.studio.addField}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-10"
                onClick={() => {
                  setAdding(false);
                  setNewLabel("");
                }}
              >
                {he.actions.cancel}
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" className="h-10" onClick={() => setAdding(true)}>
              {he.studio.addField}
            </Button>
          )}
          {draft.fields.length > 0 ? (
            <Button type="button" variant="outline" className="h-10" onClick={setAllFiles}>
              {he.wizard.setAllFiles}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
