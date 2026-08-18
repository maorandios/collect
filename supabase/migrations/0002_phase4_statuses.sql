-- Phase 4: completed workflows and skipped jobs.
-- Paste in the Supabase SQL editor. Do not run via CLI.

alter table public.workflows
  drop constraint if exists workflows_status_check;

alter table public.workflows
  add constraint workflows_status_check
  check (status in ('draft', 'active', 'paused', 'completed'));

alter table public.jobs
  drop constraint if exists jobs_status_check;

alter table public.jobs
  add constraint jobs_status_check
  check (status in ('pending', 'processing', 'succeeded', 'failed', 'skipped'));
