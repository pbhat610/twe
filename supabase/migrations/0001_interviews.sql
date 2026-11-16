-- +twe AI Interviewer: one row per interview.
-- The full session (plan, turns, analyses, log, report) lives in `data` (jsonb) so
-- the domain model can evolve without migrations; hot fields are columns for listing.
create table if not exists public.interviews (
  id              text primary key,
  invite_token    text not null unique,
  status          text not null check (status in ('invited', 'in_progress', 'completed')),
  job_title       text not null,
  candidate_name  text not null,
  recommendation  text,
  version         integer not null default 1,
  data            jsonb not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists interviews_created_at_idx on public.interviews (created_at desc);

-- Only the server (service-role key) touches this table. RLS on + no policies
-- means the public anon key can read/write nothing.
alter table public.interviews enable row level security;
