-- Collect POC initial schema, RLS, claim functions, and pg_cron tick.

create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  business_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mailboxes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'gmail',
  email text,
  nylas_grant_id text unique,
  status text not null default 'disconnected'
    check (status in ('connected', 'disconnected', 'needs_reauth')),
  last_error text,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.nylas_oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  state text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  definition jsonb not null,
  messages jsonb not null default '[]'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused')),
  sender_mailbox_id uuid references public.mailboxes (id) on delete set null,
  next_run_at timestamptz,
  run_claimed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  mailbox_id uuid references public.mailboxes (id) on delete set null,
  recipient_name text,
  recipient_email text not null,
  scheduled_for timestamptz not null,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'sent', 'opened', 'in_progress', 'completed', 'failed', 'expired')),
  definition_snapshot jsonb not null,
  token_version integer not null default 1,
  token_expires_at timestamptz,
  is_test boolean not null default false,
  sent_at timestamptz,
  opened_at timestamptz,
  completed_at timestamptz,
  reminder_due_at timestamptz,
  reminder_sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_id, recipient_email, scheduled_for)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.requests (id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  is_draft boolean not null default true,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  field_id text not null,
  storage_path text not null,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null
    check (type in ('send_email', 'send_reminder', 'expire_request')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'succeeded', 'failed')),
  run_at timestamptz not null default now(),
  processing_started_at timestamptz,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  payload jsonb not null default '{}'::jsonb,
  last_error text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index mailboxes_user_id_idx on public.mailboxes (user_id);
create index nylas_oauth_states_user_id_idx on public.nylas_oauth_states (user_id);
create index nylas_oauth_states_expires_at_idx on public.nylas_oauth_states (expires_at);
create index workflows_user_id_idx on public.workflows (user_id) where deleted_at is null;
create index workflows_due_idx on public.workflows (next_run_at)
  where deleted_at is null and status = 'active' and next_run_at is not null;
create index requests_user_id_idx on public.requests (user_id, created_at desc);
create index requests_dashboard_idx on public.requests (user_id, created_at desc)
  where is_test = false;
create index requests_status_idx on public.requests (status);
create index files_request_id_idx on public.files (request_id);
create index jobs_due_idx on public.jobs (run_at) where status = 'pending';
create index jobs_processing_idx on public.jobs (processing_started_at)
  where status = 'processing';
create index request_events_request_id_idx on public.request_events (request_id, created_at);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger mailboxes_set_updated_at
  before update on public.mailboxes
  for each row execute function public.set_updated_at();

create trigger workflows_set_updated_at
  before update on public.workflows
  for each row execute function public.set_updated_at();

create trigger requests_set_updated_at
  before update on public.requests
  for each row execute function public.set_updated_at();

create trigger submissions_set_updated_at
  before update on public.submissions
  for each row execute function public.set_updated_at();

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profile on signup
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Atomic claims
-- ---------------------------------------------------------------------------

create or replace function public.claim_due_workflows(p_limit integer default 20)
returns setof public.workflows
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with picked as (
    select w.id
    from public.workflows w
    where w.deleted_at is null
      and w.status = 'active'
      and w.next_run_at is not null
      and w.next_run_at <= now()
      and (
        w.run_claimed_at is null
        or w.run_claimed_at < now() - interval '5 minutes'
      )
    order by w.next_run_at
    limit p_limit
    for update skip locked
  )
  update public.workflows w
  set run_claimed_at = now()
  from picked
  where w.id = picked.id
  returning w.*;
end;
$$;

create or replace function public.claim_due_jobs(p_limit integer default 50)
returns setof public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.jobs
  set
    status = 'pending',
    processing_started_at = null
  where status = 'processing'
    and processing_started_at is not null
    and processing_started_at < now() - interval '5 minutes';

  return query
  with picked as (
    select j.id
    from public.jobs j
    where j.status = 'pending'
      and j.run_at <= now()
      and j.attempts < j.max_attempts
    order by j.run_at
    limit p_limit
    for update skip locked
  )
  update public.jobs j
  set
    status = 'processing',
    processing_started_at = now(),
    attempts = j.attempts + 1
  from picked
  where j.id = picked.id
  returning j.*;
end;
$$;

create or replace function public.invoke_cron_tick()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  app_url text;
  cron_secret text;
begin
  select decrypted_secret into app_url
  from vault.decrypted_secrets
  where name = 'app_url'
  limit 1;

  select decrypted_secret into cron_secret
  from vault.decrypted_secrets
  where name = 'cron_secret'
  limit 1;

  if app_url is null or cron_secret is null then
    raise notice 'Vault secrets app_url/cron_secret are not configured';
    return;
  end if;

  perform net.http_post(
    url := rtrim(app_url, '/') || '/api/cron/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
end;
$$;

do $$
begin
  perform cron.unschedule('collect-cron-tick');
exception
  when others then
    null;
end;
$$;

select cron.schedule(
  'collect-cron-tick',
  '* * * * *',
  $$select public.invoke_cron_tick()$$
);

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('request-files', 'request-files', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.mailboxes enable row level security;
alter table public.nylas_oauth_states enable row level security;
alter table public.workflows enable row level security;
alter table public.requests enable row level security;
alter table public.submissions enable row level security;
alter table public.files enable row level security;
alter table public.jobs enable row level security;
alter table public.request_events enable row level security;

create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_insert_own on public.profiles
  for insert with check (id = auth.uid());

create policy mailboxes_all_own on public.mailboxes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy workflows_all_own on public.workflows
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy requests_all_own on public.requests
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy submissions_via_request on public.submissions
  for all using (
    exists (
      select 1 from public.requests r
      where r.id = submissions.request_id and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.requests r
      where r.id = submissions.request_id and r.user_id = auth.uid()
    )
  );

create policy files_via_request on public.files
  for all using (
    exists (
      select 1 from public.requests r
      where r.id = files.request_id and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.requests r
      where r.id = files.request_id and r.user_id = auth.uid()
    )
  );

create policy request_events_via_request on public.request_events
  for select using (
    exists (
      select 1 from public.requests r
      where r.id = request_events.request_id and r.user_id = auth.uid()
    )
  );

-- jobs and nylas_oauth_states: no client policies (service role only)
-- storage.objects: no client policies; uploads use signed URLs from the server

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default. Revoke it explicitly.
revoke execute on function public.claim_due_workflows(integer) from public;
revoke execute on function public.claim_due_workflows(integer) from anon;
revoke execute on function public.claim_due_workflows(integer) from authenticated;

revoke execute on function public.claim_due_jobs(integer) from public;
revoke execute on function public.claim_due_jobs(integer) from anon;
revoke execute on function public.claim_due_jobs(integer) from authenticated;

revoke execute on function public.invoke_cron_tick() from public;
revoke execute on function public.invoke_cron_tick() from anon;
revoke execute on function public.invoke_cron_tick() from authenticated;
revoke execute on function public.invoke_cron_tick() from service_role;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

grant execute on function public.claim_due_workflows(integer) to service_role;
grant execute on function public.claim_due_jobs(integer) to service_role;

-- invoke_cron_tick is invoked only by pg_cron as the database owner.
-- Do not grant EXECUTE to anon, authenticated, or service_role.
