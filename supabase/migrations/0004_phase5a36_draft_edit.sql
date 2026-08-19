-- Phase 5A3.6: direct draft edits without storing a chat turn.
-- Paste in the Supabase SQL editor. Do not run via CLI.

create or replace function public.apply_workflow_draft_edit(
  p_workflow_id uuid,
  p_user_id uuid,
  p_expected_revision bigint,
  p_draft_definition jsonb
)
returns table (new_revision bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_revision bigint;
  current_status text;
begin
  select w.draft_revision, w.status
    into current_revision, current_status
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

  if current_revision is distinct from p_expected_revision then
    raise exception 'revision_conflict';
  end if;

  update public.workflows
  set
    draft_definition = p_draft_definition,
    draft_revision = draft_revision + 1,
    name = case
      when current_status = 'draft' and coalesce(p_draft_definition->>'name', '') <> ''
        then p_draft_definition->>'name'
      else name
    end
  where id = p_workflow_id
    and user_id = p_user_id;

  return query select current_revision + 1;
end;
$$;

revoke all on function public.apply_workflow_draft_edit(uuid, uuid, bigint, jsonb) from public;
revoke all on function public.apply_workflow_draft_edit(uuid, uuid, bigint, jsonb) from anon;
revoke all on function public.apply_workflow_draft_edit(uuid, uuid, bigint, jsonb) from authenticated;
grant execute on function public.apply_workflow_draft_edit(uuid, uuid, bigint, jsonb) to service_role;
