"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatIsraelDateTime } from "@/lib/dates";
import { he } from "@/lib/i18n/he";
import type { CompletionIssue } from "@/lib/workflow/completion";
import { shouldOfferReminder } from "@/lib/workflow/completion";
import type { DraftSchedule, WorkflowDraftDefinition } from "@/lib/workflow/draft-schema";
import type { EditorLockKey } from "@/lib/workflow/editor-locks";
import type { WorkflowStatus } from "@/lib/workflow/lifecycle";
import { TIMEZONE } from "@/lib/workflow/schema";
import {
  definedText,
  eventModeLabel,
  fieldCountLabel,
  mailboxSummary,
  monthlyEditorDayValue,
  recipientSummary,
  reminderSummary,
  scheduleSummary,
  shouldShowNextSendCard,
} from "@/lib/workflow/studio-display";
import { cn } from "@/lib/utils";

const SELECT_CLASS =
  "h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring";

type CardMode = "view" | "editing" | "saving";

function CardShell({
  label,
  missing,
  suggestion,
  children,
  onToggle,
  editing,
  readOnly,
  hideChange,
}: {
  label: string;
  missing?: string;
  suggestion?: string;
  children: ReactNode;
  onToggle?: () => void;
  editing: boolean;
  readOnly: boolean;
  hideChange?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-surface p-4",
        missing ? "border-[#e7b6a0] bg-[#fff7f2]" : suggestion ? "border-[#d8d4c8] bg-[#f7f6f2]" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">{label}</p>
          {missing ? (
            <span className="rounded-full bg-[#f4d3c4] px-2 py-0.5 text-[11px] text-[#8a3b1d]">{he.studio.missingTag}</span>
          ) : null}
          {suggestion && !missing ? (
            <span className="rounded-full bg-[#eceae3] px-2 py-0.5 text-[11px] text-muted-foreground">
              {he.studio.suggestionTag}
            </span>
          ) : null}
        </div>
        {!readOnly && onToggle && !hideChange ? (
          <button type="button" className="text-xs text-primary hover:underline" onClick={onToggle}>
            {editing ? he.actions.cancel : he.studio.change}
          </button>
        ) : null}
      </div>
      <div className="mt-2">{children}</div>
      {missing ? <p className="mt-2 text-xs text-[#8a3b1d]">{missing}</p> : null}
      {suggestion && !missing ? <p className="mt-2 text-xs text-muted-foreground">{suggestion}</p> : null}
    </div>
  );
}

function firstMessage(issues: CompletionIssue[]) {
  return issues[0]?.message;
}

function EditorActions({
  saving,
  onSave,
  onCancel,
}: {
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-3 flex gap-2">
      <Button type="button" className="h-9" disabled={saving} onClick={onSave}>
        {saving ? he.loading.saving : he.actions.save}
      </Button>
      <Button type="button" variant="ghost" className="h-9" disabled={saving} onClick={onCancel}>
        {he.actions.cancel}
      </Button>
    </div>
  );
}

export function StudioSummaryTab({
  draft,
  mailboxEmail,
  nextRunAt,
  status,
  conversationIssues,
  externalIssues,
  readOnly,
  onEdit,
  onOpenForm,
}: {
  draft: WorkflowDraftDefinition;
  mailboxEmail: string | null;
  nextRunAt: string | null;
  status: WorkflowStatus;
  conversationIssues: CompletionIssue[];
  externalIssues: CompletionIssue[];
  readOnly: boolean;
  onEdit: (draft: WorkflowDraftDefinition, locks: EditorLockKey[]) => Promise<boolean>;
  onOpenForm: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [mode, setMode] = useState<CardMode>("view");
  const gmail = externalIssues.find((issue) => issue.category === "mailbox");
  const scheduleIssues = conversationIssues.filter((issue) => issue.category === "schedule" || issue.key === "event_mode_missing");
  const eventIssue = conversationIssues.find((issue) => issue.key === "event_mode_missing");
  const recipientIssues = conversationIssues.filter((issue) => issue.category === "recipient");
  const fieldIssue = conversationIssues.find((issue) => issue.key === "fields_missing");
  const reminderSuggestion =
    conversationIssues.length === 0 && shouldOfferReminder(draft) ? he.studio.reminderOffer : undefined;
  const showNextSend = shouldShowNextSendCard(status, draft.schedule);

  function start(card: string) {
    setOpen(card);
    setMode("editing");
  }

  function cancel() {
    setOpen(null);
    setMode("view");
  }

  async function save(next: WorkflowDraftDefinition, locks: EditorLockKey[]) {
    setMode("saving");
    try {
      const ok = await onEdit(next, locks);
      if (ok) {
        setOpen(null);
        setMode("view");
        return;
      }
      setMode("editing");
    } catch {
      setMode("editing");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      <NameCard
        draft={draft}
        open={open === "name"}
        saving={mode === "saving" && open === "name"}
        readOnly={readOnly}
        onStart={() => start("name")}
        onCancel={cancel}
        onSave={(name) => save({ ...draft, name }, ["name"])}
      />

      <CardShell
        label={he.workflow.mailbox}
        missing={gmail && !mailboxEmail ? gmail.message : undefined}
        editing={false}
        readOnly={readOnly}
        hideChange
      >
        <p className="text-sm font-medium leading-6">{mailboxSummary(mailboxEmail)}</p>
        {gmail?.settingsHref ? (
          <Link href={gmail.settingsHref} className="mt-2 inline-block text-sm text-primary hover:underline">
            {he.actions.connectGmail}
          </Link>
        ) : null}
      </CardShell>

      <CardShell
        label={he.workflow.recipients}
        missing={firstMessage(recipientIssues)}
        editing={open === "recipients"}
        readOnly={readOnly}
        onToggle={() => (open === "recipients" ? cancel() : start("recipients"))}
      >
        {open === "recipients" ? (
          <RecipientsEditor
            draft={draft}
            saving={mode === "saving"}
            onSave={(recipients) => save({ ...draft, recipients, recipientMode: "fixed" }, ["recipients"])}
            onCancel={cancel}
          />
        ) : (
          <p className="text-sm font-medium leading-6">{recipientSummary(draft)}</p>
        )}
      </CardShell>

      <EventModeCard
        draft={draft}
        missing={eventIssue?.message}
        open={open === "event"}
        saving={mode === "saving" && open === "event"}
        readOnly={readOnly}
        onStart={() => start("event")}
        onCancel={cancel}
        onSave={(schedule) => save({ ...draft, schedule }, ["schedule"])}
      />

      <CardShell
        label={he.workflow.schedule}
        missing={firstMessage(scheduleIssues.filter((issue) => issue.key !== "event_mode_missing"))}
        editing={open === "schedule"}
        readOnly={readOnly}
        onToggle={() => (open === "schedule" ? cancel() : start("schedule"))}
      >
        {open === "schedule" ? (
          <ScheduleEditor
            draft={draft}
            saving={mode === "saving"}
            onSave={(schedule) => save({ ...draft, schedule }, ["schedule"])}
            onCancel={cancel}
          />
        ) : (
          <p className="text-sm font-medium leading-6">{scheduleSummary(draft.schedule)}</p>
        )}
      </CardShell>

      <CardShell
        label={he.workflow.fields}
        missing={fieldIssue?.message}
        editing={false}
        readOnly={readOnly}
        onToggle={onOpenForm}
      >
        <p className="text-sm font-medium leading-6">{fieldCountLabel(draft.fields.length)}</p>
      </CardShell>

      <ReminderCard
        draft={draft}
        suggestion={reminderSuggestion}
        open={open === "reminder"}
        saving={mode === "saving" && open === "reminder"}
        readOnly={readOnly}
        onStart={() => start("reminder")}
        onCancel={cancel}
        onSave={(reminder, reminderDecision) => save({ ...draft, reminder, reminderDecision }, ["reminder"])}
      />

      {showNextSend ? (
        <CardShell label={he.studio.nextRun} editing={false} readOnly={readOnly} hideChange>
          <p className="text-sm font-medium leading-6">
            {status === "paused" ? he.studio.nextSendPaused : nextRunAt ? formatIsraelDateTime(nextRunAt) : he.studio.notSet}
          </p>
        </CardShell>
      ) : null}
    </div>
  );
}

function NameCard({
  draft,
  open,
  saving,
  readOnly,
  onStart,
  onCancel,
  onSave,
}: {
  draft: WorkflowDraftDefinition;
  open: boolean;
  saving: boolean;
  readOnly: boolean;
  onStart: () => void;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(draft.name);
  return (
    <CardShell
      label={he.workflow.name}
      editing={open}
      readOnly={readOnly}
      onToggle={() => {
        if (open) {
          setName(draft.name);
          onCancel();
          return;
        }
        setName(draft.name);
        onStart();
      }}
    >
      {open ? (
        <>
          <Input className="h-10" value={name} onChange={(event) => setName(event.target.value)} />
          <EditorActions saving={saving} onSave={() => onSave(name)} onCancel={() => { setName(draft.name); onCancel(); }} />
        </>
      ) : (
        <p className="text-sm font-medium leading-6">{definedText(draft.name)}</p>
      )}
    </CardShell>
  );
}

function EventModeCard({
  draft,
  missing,
  open,
  saving,
  readOnly,
  onStart,
  onCancel,
  onSave,
}: {
  draft: WorkflowDraftDefinition;
  missing?: string;
  open: boolean;
  saving: boolean;
  readOnly: boolean;
  onStart: () => void;
  onCancel: () => void;
  onSave: (schedule: DraftSchedule | undefined) => void;
}) {
  const [type, setType] = useState(draft.schedule?.type ?? "");
  return (
    <CardShell
      label={he.studio.eventModeLabel}
      missing={missing}
      editing={open}
      readOnly={readOnly}
      onToggle={() => {
        if (open) {
          setType(draft.schedule?.type ?? "");
          onCancel();
          return;
        }
        setType(draft.schedule?.type ?? "");
        onStart();
      }}
    >
      {open ? (
        <>
          <select className={SELECT_CLASS} value={type} onChange={(event) => setType(event.target.value)}>
            <option value="">{he.studio.notSet}</option>
            <option value="weekly">{he.studio.eventMode.weekly}</option>
            <option value="monthly">{he.studio.eventMode.monthly}</option>
            <option value="once">{he.studio.eventMode.once}</option>
            <option value="manual">{he.studio.eventMode.manual}</option>
            <option value="send_now">{he.studio.eventMode.sendNow}</option>
          </select>
          <EditorActions
            saving={saving}
            onSave={() => {
              if (type === draft.schedule?.type) {
                onSave(draft.schedule);
                return;
              }
              onSave(scheduleFromType(type));
            }}
            onCancel={() => {
              setType(draft.schedule?.type ?? "");
              onCancel();
            }}
          />
        </>
      ) : (
        <p className="text-sm font-medium leading-6">{eventModeLabel(draft.schedule)}</p>
      )}
    </CardShell>
  );
}

function ReminderCard({
  draft,
  suggestion,
  open,
  saving,
  readOnly,
  onStart,
  onCancel,
  onSave,
}: {
  draft: WorkflowDraftDefinition;
  suggestion?: string;
  open: boolean;
  saving: boolean;
  readOnly: boolean;
  onStart: () => void;
  onCancel: () => void;
  onSave: (
    reminder: WorkflowDraftDefinition["reminder"],
    reminderDecision: WorkflowDraftDefinition["reminderDecision"],
  ) => void;
}) {
  const initial =
    draft.reminderDecision === "declined" || !draft.reminder.enabled ? "none" : String(draft.reminder.afterHours ?? 48);
  const [value, setValue] = useState(initial);
  return (
    <CardShell
      label={he.workflow.reminder}
      suggestion={suggestion}
      editing={open}
      readOnly={readOnly}
      onToggle={() => {
        if (open) {
          setValue(initial);
          onCancel();
          return;
        }
        setValue(initial);
        onStart();
      }}
    >
      {open ? (
        <>
          <select className={SELECT_CLASS} value={value} onChange={(event) => setValue(event.target.value)}>
            <option value="none">{he.workflow.reminderOff}</option>
            <option value="24">{he.studio.reminderAfterDay}</option>
            <option value="48">{he.studio.reminderAfterTwoDays}</option>
            <option value="168">{he.studio.reminderAfterWeek}</option>
          </select>
          <EditorActions
            saving={saving}
            onSave={() => {
              if (value === "none") {
                onSave({ enabled: false, afterHours: null, afterMinutes: null }, "declined");
                return;
              }
              onSave({ enabled: true, afterHours: Number(value), afterMinutes: null }, "enabled");
            }}
            onCancel={() => {
              setValue(initial);
              onCancel();
            }}
          />
        </>
      ) : (
        <p className="text-sm font-medium leading-6">{reminderSummary(draft)}</p>
      )}
    </CardShell>
  );
}

function scheduleFromType(type: string): DraftSchedule | undefined {
  if (type === "weekly") {
    return { type: "weekly", weekday: null, time: null, timezone: TIMEZONE };
  }
  if (type === "monthly") {
    return { type: "monthly", day: null, time: null, timezone: TIMEZONE };
  }
  if (type === "once") {
    return { type: "once", date: null, time: null, timezone: TIMEZONE };
  }
  if (type === "manual") {
    return { type: "manual" };
  }
  if (type === "send_now") {
    return { type: "send_now" };
  }
  return undefined;
}

function RecipientsEditor({
  draft,
  saving,
  onSave,
  onCancel,
}: {
  draft: WorkflowDraftDefinition;
  saving: boolean;
  onSave: (recipients: WorkflowDraftDefinition["recipients"]) => void;
  onCancel: () => void;
}) {
  const [recipients, setRecipients] = useState(
    draft.recipients.length > 0 ? draft.recipients : [{ name: "", email: "" }],
  );

  return (
    <div className="space-y-2">
      {recipients.map((recipient, index) => (
        <div key={`${index}-${recipient.email}`} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            className="h-10"
            placeholder={he.studio.recipientName}
            value={recipient.name ?? ""}
            onChange={(event) => {
              setRecipients(
                recipients.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, name: event.target.value } : item,
                ),
              );
            }}
          />
          <Input
            className="h-10"
            dir="ltr"
            placeholder={he.studio.recipientEmail}
            value={recipient.email ?? ""}
            onChange={(event) => {
              setRecipients(
                recipients.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, email: event.target.value } : item,
                ),
              );
            }}
          />
          <Button
            type="button"
            variant="ghost"
            className="h-10"
            onClick={() => setRecipients(recipients.filter((_, itemIndex) => itemIndex !== index))}
          >
            {he.studio.removeRecipient}
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" className="h-9" onClick={() => setRecipients([...recipients, { name: "", email: "" }])}>
        {he.studio.addRecipient}
      </Button>
      <EditorActions saving={saving} onSave={() => onSave(recipients)} onCancel={onCancel} />
    </div>
  );
}

function ScheduleEditor({
  draft,
  saving,
  onSave,
  onCancel,
}: {
  draft: WorkflowDraftDefinition;
  saving: boolean;
  onSave: (schedule: DraftSchedule) => void;
  onCancel: () => void;
}) {
  const [schedule, setSchedule] = useState<DraftSchedule | undefined>(draft.schedule);
  if (!schedule || schedule.type === "manual" || schedule.type === "send_now") {
    return <p className="text-sm text-muted-foreground">{scheduleSummary(schedule)}</p>;
  }

  return (
    <div className="space-y-2">
      {schedule.type === "weekly" ? (
        <select
          className={SELECT_CLASS}
          value={schedule.weekday ?? ""}
          onChange={(event) =>
            setSchedule({ ...schedule, weekday: event.target.value === "" ? null : Number(event.target.value) })
          }
        >
          <option value="">{he.studio.weekdayNotSet}</option>
          <option value="0">{he.workflow.sunday}</option>
          <option value="1">{he.workflow.monday}</option>
          <option value="2">{he.workflow.tuesday}</option>
          <option value="3">{he.workflow.wednesday}</option>
          <option value="4">{he.workflow.thursday}</option>
          <option value="5">{he.workflow.friday}</option>
          <option value="6">{he.workflow.saturday}</option>
        </select>
      ) : null}
      {schedule.type === "monthly" ? (
        <select
          className={SELECT_CLASS}
          value={monthlyEditorDayValue(schedule)}
          onChange={(event) => {
            if (event.target.value === "end_of_month") {
              setSchedule({ ...schedule, day: 31, monthlyDayMode: "end_of_month" });
              return;
            }
            const day = Number(event.target.value);
            setSchedule({
              ...schedule,
              day: Number.isFinite(day) && day >= 1 && day <= 31 ? day : null,
              monthlyDayMode: "specific_day",
            });
          }}
        >
          <option value="">{he.studio.monthDayNotSet}</option>
          <option value="end_of_month">{he.studio.setup.monthDayEnd}</option>
          {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
            <option key={day} value={String(day)}>
              {day}
            </option>
          ))}
        </select>
      ) : null}
      {schedule.type === "once" ? (
        <Input
          className="h-10"
          type="date"
          value={schedule.date ?? ""}
          onChange={(event) => setSchedule({ ...schedule, date: event.target.value || null })}
        />
      ) : null}
      <Input
        className="h-10"
        type="time"
        value={schedule.time ?? ""}
        onChange={(event) => setSchedule({ ...schedule, time: event.target.value || null, timezone: TIMEZONE })}
      />
      <EditorActions
        saving={saving}
        onSave={() => onSave(schedule)}
        onCancel={() => {
          setSchedule(draft.schedule);
          onCancel();
        }}
      />
    </div>
  );
}
