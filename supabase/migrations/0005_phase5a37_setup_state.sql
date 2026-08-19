-- Phase 5A3.7: guided setup proposal stored separately from draft_definition,
-- with its own setup_revision so concurrent setup turns cannot clobber state.
-- Paste in the Supabase SQL editor. Do not run via CLI.

alter table public.workflows
  add column if not exists setup_state jsonb;

alter table public.workflows
  add column if not exists setup_revision bigint not null default 0;

drop function if exists public.apply_workflow_setup_turn(uuid, uuid, bigint, jsonb, uuid, text);
drop function if exists public.apply_workflow_setup_proposal(uuid, uuid, bigint);

create or replace function public.apply_workflow_setup_turn(
  p_workflow_id uuid,
  p_user_id uuid,
  p_expected_draft_revision bigint,
  p_expected_setup_revision bigint,
  p_setup_state jsonb,
  p_client_turn_id uuid,
  p_assistant_content text
)
returns table (draft_revision bigint, setup_revision bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_draft_revision bigint;
  current_setup_revision bigint;
  current_status text;
begin
  select w.draft_revision, w.setup_revision, w.status
    into current_draft_revision, current_setup_revision, current_status
  from public.workflows w
  where w.id = p_workflow_id
    and w.user_id = p_user_id
    and w.deleted_at is null
  for update;

  if not found then
    raise exception 'not_found';
  end if;

  if current_status = 'completed' then
    raise exception 'completed';
  end if;

  if exists (
    select 1
    from public.workflow_messages m
    where m.workflow_id = p_workflow_id
      and m.client_turn_id = p_client_turn_id
      and m.role = 'assistant'
  ) then
    return query select current_draft_revision, current_setup_revision;
    return;
  end if;

  if current_draft_revision is distinct from p_expected_draft_revision then
    raise exception 'revision_conflict';
  end if;

  if current_setup_revision is distinct from p_expected_setup_revision then
    raise exception 'revision_conflict';
  end if;

  update public.workflows
  set
    setup_state = p_setup_state,
    setup_revision = current_setup_revision + 1
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
  )
  on conflict (workflow_id, client_turn_id, role) do nothing;

  return query select current_draft_revision, current_setup_revision + 1;
end;
$$;

create or replace function public.apply_workflow_setup_proposal(
  p_workflow_id uuid,
  p_user_id uuid,
  p_expected_draft_revision bigint,
  p_expected_setup_revision bigint
)
returns table (draft_revision bigint, setup_revision bigint, draft_definition jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_draft_revision bigint;
  current_setup_revision bigint;
  current_status text;
  current_setup jsonb;
  proposal jsonb;
  next_setup jsonb;
begin
  select w.draft_revision, w.setup_revision, w.status, w.setup_state
    into current_draft_revision, current_setup_revision, current_status, current_setup
  from public.workflows w
  where w.id = p_workflow_id
    and w.user_id = p_user_id
    and w.deleted_at is null
  for update;

  if not found then
    raise exception 'not_found';
  end if;

  if current_status = 'completed' then
    raise exception 'completed';
  end if;

  if current_draft_revision is distinct from p_expected_draft_revision then
    raise exception 'revision_conflict';
  end if;

  if current_setup_revision is distinct from p_expected_setup_revision then
    raise exception 'revision_conflict';
  end if;

  if current_setup is null or current_setup->>'status' is distinct from 'review' then
    raise exception 'not_review';
  end if;

  if (current_setup->>'baseDraftRevision')::bigint is distinct from current_draft_revision then
    raise exception 'setup_conflict';
  end if;

  proposal := current_setup->'proposal';
  if proposal is null then
    raise exception 'invalid_proposal';
  end if;

  next_setup := jsonb_set(current_setup, '{status}', '"completed"');
  next_setup := jsonb_set(next_setup, '{updatedAt}', to_jsonb(now()::text));

  update public.workflows
  set
    draft_definition = proposal,
    draft_revision = current_draft_revision + 1,
    setup_state = next_setup,
    setup_revision = current_setup_revision + 1,
    name = case
      when current_status = 'draft' and coalesce(proposal->>'name', '') <> ''
        then proposal->>'name'
      else name
    end
  where id = p_workflow_id
    and user_id = p_user_id;

  return query select current_draft_revision + 1, current_setup_revision + 1, proposal;
end;
$$;

revoke all on function public.apply_workflow_setup_turn(uuid, uuid, bigint, bigint, jsonb, uuid, text) from public;
revoke all on function public.apply_workflow_setup_turn(uuid, uuid, bigint, bigint, jsonb, uuid, text) from anon;
revoke all on function public.apply_workflow_setup_turn(uuid, uuid, bigint, bigint, jsonb, uuid, text) from authenticated;
grant execute on function public.apply_workflow_setup_turn(uuid, uuid, bigint, bigint, jsonb, uuid, text) to service_role;

revoke all on function public.apply_workflow_setup_proposal(uuid, uuid, bigint, bigint) from public;
revoke all on function public.apply_workflow_setup_proposal(uuid, uuid, bigint, bigint) from anon;
revoke all on function public.apply_workflow_setup_proposal(uuid, uuid, bigint, bigint) from authenticated;
grant execute on function public.apply_workflow_setup_proposal(uuid, uuid, bigint, bigint) to service_role;
