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
import { TIMEZONE } from "@/lib/workflow/schema";
import {
  definedText,
  eventModeLabel,
  fieldCountLabel,
  mailboxSummary,
  nextRunSummary,
  recipientSummary,
  reminderSummary,
  scheduleSummary,
} from "@/lib/workflow/studio-display";
import { cn } from "@/lib/utils";

const SELECT_CLASS =
  "h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring";

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

export function StudioSummaryTab({
  draft,
  mailboxEmail,
  nextRunAt,
  conversationIssues,
  externalIssues,
  readOnly,
  onEdit,
  onOpenForm,
}: {
  draft: WorkflowDraftDefinition;
  mailboxEmail: string | null;
  nextRunAt: string | null;
  conversationIssues: CompletionIssue[];
  externalIssues: CompletionIssue[];
  readOnly: boolean;
  onEdit: (draft: WorkflowDraftDefinition, locks: EditorLockKey[]) => void;
  onOpenForm: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const gmail = externalIssues.find((issue) => issue.category === "mailbox");
  const scheduleIssues = conversationIssues.filter((issue) => issue.category === "schedule" || issue.key === "event_mode_missing");
  const eventIssue = conversationIssues.find((issue) => issue.key === "event_mode_missing");
  const recipientIssues = conversationIssues.filter((issue) => issue.category === "recipient");
  const fieldIssue = conversationIssues.find((issue) => issue.key === "fields_missing");
  const reminderSuggestion =
    conversationIssues.length === 0 && shouldOfferReminder(draft) ? he.studio.reminderOffer : undefined;

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      <CardShell
        label={he.workflow.name}
        editing={open === "name"}
        readOnly={readOnly}
        onToggle={() => setOpen(open === "name" ? null : "name")}
      >
        {open === "name" ? (
          <Input
            className="h-10"
            defaultValue={draft.name}
            onBlur={(event) => {
              onEdit({ ...draft, name: event.target.value }, ["name"]);
              setOpen(null);
            }}
          />
        ) : (
          <p className="text-sm font-medium leading-6">{definedText(draft.name)}</p>
        )}
      </CardShell>

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
        onToggle={() => setOpen(open === "recipients" ? null : "recipients")}
      >
        {open === "recipients" ? (
          <RecipientsEditor draft={draft} onEdit={onEdit} />
        ) : (
          <p className="text-sm font-medium leading-6">{recipientSummary(draft)}</p>
        )}
      </CardShell>

      <CardShell
        label={he.studio.eventModeLabel}
        missing={eventIssue?.message}
        editing={open === "event"}
        readOnly={readOnly}
        onToggle={() => setOpen(open === "event" ? null : "event")}
      >
        {open === "event" ? (
          <select
            className={SELECT_CLASS}
            value={draft.schedule?.type ?? ""}
            onChange={(event) => {
              onEdit({ ...draft, schedule: scheduleFromType(event.target.value) }, ["schedule"]);
              setOpen(null);
            }}
          >
            <option value="">{he.studio.notSet}</option>
            <option value="weekly">{he.studio.eventMode.weekly}</option>
            <option value="monthly">{he.studio.eventMode.monthly}</option>
            <option value="once">{he.studio.eventMode.once}</option>
            <option value="manual">{he.studio.eventMode.manual}</option>
            <option value="send_now">{he.studio.eventMode.sendNow}</option>
          </select>
        ) : (
          <p className="text-sm font-medium leading-6">{eventModeLabel(draft.schedule)}</p>
        )}
      </CardShell>

      <CardShell
        label={he.workflow.schedule}
        missing={firstMessage(scheduleIssues.filter((issue) => issue.key !== "event_mode_missing"))}
        editing={open === "schedule"}
        readOnly={readOnly}
        onToggle={() => setOpen(open === "schedule" ? null : "schedule")}
      >
        {open === "schedule" ? (
          <ScheduleEditor draft={draft} onEdit={onEdit} />
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

      <CardShell
        label={he.workflow.reminder}
        suggestion={reminderSuggestion}
        editing={open === "reminder"}
        readOnly={readOnly}
        onToggle={() => setOpen(open === "reminder" ? null : "reminder")}
      >
        {open === "reminder" ? (
          <ReminderEditor draft={draft} onEdit={onEdit} />
        ) : (
          <p className="text-sm font-medium leading-6">{reminderSummary(draft)}</p>
        )}
      </CardShell>

      <CardShell label={he.studio.nextRun} editing={false} readOnly={readOnly} hideChange>
        <p className="text-sm font-medium leading-6">
          {nextRunAt ? formatIsraelDateTime(nextRunAt) : nextRunSummary(draft.schedule)}
        </p>
      </CardShell>
    </div>
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
  onEdit,
}: {
  draft: WorkflowDraftDefinition;
  onEdit: (draft: WorkflowDraftDefinition, locks: EditorLockKey[]) => void;
}) {
  const recipients = draft.recipients.length > 0 ? draft.recipients : [{ name: "", email: "" }];

  function commit(next: WorkflowDraftDefinition["recipients"]) {
    onEdit({ ...draft, recipients: next, recipientMode: "fixed" }, ["recipients"]);
  }

  return (
    <div className="space-y-2">
      {recipients.map((recipient, index) => (
        <div key={`${index}-${recipient.email}`} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            className="h-10"
            placeholder={he.studio.recipientName}
            defaultValue={recipient.name ?? ""}
            onBlur={(event) => {
              const next = recipients.map((item, itemIndex) =>
                itemIndex === index ? { ...item, name: event.target.value } : item,
              );
              commit(next);
            }}
          />
          <Input
            className="h-10"
            dir="ltr"
            placeholder={he.studio.recipientEmail}
            defaultValue={recipient.email ?? ""}
            onBlur={(event) => {
              const next = recipients.map((item, itemIndex) =>
                itemIndex === index ? { ...item, email: event.target.value } : item,
              );
              commit(next);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            className="h-10"
            onClick={() => commit(recipients.filter((_, itemIndex) => itemIndex !== index))}
          >
            {he.studio.removeRecipient}
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="h-9"
        onClick={() => commit([...recipients, { name: "", email: "" }])}
      >
        {he.studio.addRecipient}
      </Button>
    </div>
  );
}

function ScheduleEditor({
  draft,
  onEdit,
}: {
  draft: WorkflowDraftDefinition;
  onEdit: (draft: WorkflowDraftDefinition, locks: EditorLockKey[]) => void;
}) {
  const schedule = draft.schedule;
  if (!schedule || schedule.type === "manual" || schedule.type === "send_now") {
    return <p className="text-sm text-muted-foreground">{scheduleSummary(schedule)}</p>;
  }

  function commit(next: DraftSchedule) {
    onEdit({ ...draft, schedule: next }, ["schedule"]);
  }

  return (
    <div className="space-y-2">
      {schedule.type === "weekly" ? (
        <select
          className={SELECT_CLASS}
          value={schedule.weekday ?? ""}
          onChange={(event) => commit({ ...schedule, weekday: event.target.value === "" ? null : Number(event.target.value) })}
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
        <Input
          className="h-10"
          type="number"
          min={1}
          max={31}
          defaultValue={schedule.day ?? ""}
          onBlur={(event) => {
            const day = Number(event.target.value);
            commit({ ...schedule, day: Number.isFinite(day) && day >= 1 && day <= 31 ? day : null });
          }}
        />
      ) : null}
      {schedule.type === "once" ? (
        <Input
          className="h-10"
          type="date"
          defaultValue={schedule.date ?? ""}
          onBlur={(event) => commit({ ...schedule, date: event.target.value || null })}
        />
      ) : null}
      <Input
        className="h-10"
        type="time"
        defaultValue={schedule.time ?? ""}
        onBlur={(event) => commit({ ...schedule, time: event.target.value || null, timezone: TIMEZONE })}
      />
    </div>
  );
}

function ReminderEditor({
  draft,
  onEdit,
}: {
  draft: WorkflowDraftDefinition;
  onEdit: (draft: WorkflowDraftDefinition, locks: EditorLockKey[]) => void;
}) {
  return (
    <div className="space-y-2">
      <select
        className={SELECT_CLASS}
        value={
          draft.reminderDecision === "declined" || !draft.reminder.enabled
            ? "none"
            : String(draft.reminder.afterHours ?? 48)
        }
        onChange={(event) => {
          if (event.target.value === "none") {
            onEdit(
              {
                ...draft,
                reminder: { enabled: false, afterHours: null, afterMinutes: null },
                reminderDecision: "declined",
              },
              ["reminder"],
            );
            return;
          }
          onEdit(
            {
              ...draft,
              reminder: { enabled: true, afterHours: Number(event.target.value), afterMinutes: null },
              reminderDecision: "enabled",
            },
            ["reminder"],
          );
        }}
      >
        <option value="none">{he.workflow.reminderOff}</option>
        <option value="24">{he.studio.reminderAfterDay}</option>
        <option value="48">{he.studio.reminderAfterTwoDays}</option>
        <option value="168">{he.studio.reminderAfterWeek}</option>
      </select>
    </div>
  );
}
