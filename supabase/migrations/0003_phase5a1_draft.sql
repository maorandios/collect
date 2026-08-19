-- Phase 5A1: draft vs published workflow contract, chat message store, atomic draft turn RPC.
-- Paste in the Supabase SQL editor. Do not run via CLI.

alter table public.workflows
  alter column definition drop not null;

alter table public.workflows
  add column if not exists draft_definition jsonb;

alter table public.workflows
  add column if not exists draft_revision bigint not null default 0;

update public.workflows
  set draft_definition = definition
  where draft_definition is null
    and definition is not null;

alter table public.workflows
  drop constraint if exists workflows_published_definition_required;

alter table public.workflows
  add constraint workflows_published_definition_required
  check (status = 'draft' or definition is not null);

create table if not exists public.workflow_messages (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  client_turn_id uuid not null,
  role text not null check (role in ('user', 'assistant', 'error')),
  content text not null,
  created_at timestamptz not null default now(),
  unique (workflow_id, client_turn_id, role)
);

create index if not exists workflow_messages_workflow_created_idx
  on public.workflow_messages (workflow_id, created_at);

alter table public.workflow_messages enable row level security;

drop policy if exists workflow_messages_select_own on public.workflow_messages;
drop policy if exists workflow_messages_insert_own on public.workflow_messages;

create policy workflow_messages_select_own on public.workflow_messages
  for select using (
    exists (
      select 1 from public.workflows w
      where w.id = workflow_messages.workflow_id
        and w.user_id = auth.uid()
    )
  );

revoke all on table public.workflow_messages from anon;
revoke all on table public.workflow_messages from public;
revoke all on table public.workflow_messages from authenticated;
grant select on table public.workflow_messages to authenticated;

create or replace function public.apply_workflow_draft_turn(
  p_workflow_id uuid,
  p_user_id uuid,
  p_expected_revision bigint,
  p_draft_definition jsonb,
  p_client_turn_id uuid,
  p_assistant_content text
)
returns table (new_revision bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_revision bigint;
begin
  select w.draft_revision
    into current_revision
  from public.workflows w
  where w.id = p_workflow_id
    and w.user_id = p_user_id
    and w.deleted_at is null
  for update;

  if not found then
    raise exception 'not_found';
  end if;

  if exists (
    select 1
    from public.workflow_messages
    where workflow_id = p_workflow_id
      and client_turn_id = p_client_turn_id
      and role = 'assistant'
  ) then
    return query select current_revision;
    return;
  end if;

  if current_revision is distinct from p_expected_revision then
    raise exception 'revision_conflict';
  end if;

  update public.workflows
  set
    draft_definition = p_draft_definition,
    draft_revision = draft_revision + 1
  where id = p_workflow_id
    and user_id = p_user_id;

  insert into public.workflow_messages (
    workflow_id,
    user_id,
    client_turn_id,
    role,
    content
  ) values (
    p_workflow_id,
    p_user_id,
    p_client_turn_id,
    'assistant',
    p_assistant_content
  );

  return query select current_revision + 1;
exception
  when unique_violation then
    return query
      select w.draft_revision
      from public.workflows w
      where w.id = p_workflow_id
        and w.user_id = p_user_id;
end;
$$;

revoke all on function public.apply_workflow_draft_turn(uuid, uuid, bigint, jsonb, uuid, text) from public;
revoke all on function public.apply_workflow_draft_turn(uuid, uuid, bigint, jsonb, uuid, text) from anon;
revoke all on function public.apply_workflow_draft_turn(uuid, uuid, bigint, jsonb, uuid, text) from authenticated;
grant execute on function public.apply_workflow_draft_turn(uuid, uuid, bigint, jsonb, uuid, text) to service_role;
