-- +twe AI Interviewer: complete Supabase setup. Run `npm run db:setup` (recommended) or paste into Supabase → SQL Editor. Safe to re-run.

-- ═══ 0001_interviews.sql ═══
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

-- ═══ 0002_proctoring_events.sql ═══
-- Append-only interview integrity log (metadata only; no video/images are stored).
create table if not exists public.proctoring_events (
  id            bigint generated always as identity primary key,
  interview_id  text not null references public.interviews (id) on delete cascade,
  type          text not null,
  severity      text not null check (severity in ('warning', 'critical')),
  turn_id       text,
  detail        text,
  at            timestamptz not null default now()
);

create index if not exists proctoring_events_interview_idx on public.proctoring_events (interview_id, at);

alter table public.proctoring_events enable row level security;

-- ═══ 0003_interview_recordings.sql ═══
-- Private bucket for interview recordings (camera + mic + interviewer voice),
-- stored as ordered 5-second chunks: interview-recordings/<interview_id>/<seq>.webm
-- Only the server (service-role key) reads/writes; recruiters get short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('interview-recordings', 'interview-recordings', false, 3145728, array['video/webm', 'video/mp4'])
on conflict (id) do nothing;

-- Record of the candidate's consent lives on the interview JSON (recording_consent_at).
-- Retention: remove old recordings through the Storage API (storage.from('interview-recordings').remove([...]))
-- in a scheduled job, per your data-retention policy. Deleting rows from storage.objects directly orphans the files.

-- ═══ 0005_candidates.sql ═══
-- Candidates (the official demo candidates are loaded by `npm run db:setup`).
-- The full profile (same shape as data/candidates.json) lives in `data`.
create table if not exists public.candidates (
  candidate_id  text primary key,
  name          text not null,
  data          jsonb not null,
  created_at    timestamptz not null default now()
);

-- Server-only access (service-role / secret key); no policies = no public access.
alter table public.candidates enable row level security;

-- ═══ 0006_assessments.sql ═══
-- Video assessments: pasted JD + structured role + approved questions + call settings.
-- Interviews are created from an assessment for one candidate each.
create table if not exists public.assessments (
  assessment_id  text primary key,
  title          text not null,
  data           jsonb not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists assessments_created_at_idx on public.assessments (created_at desc);
alter table public.assessments enable row level security;

-- Link interviews to their assessment for per-assessment listing.
alter table public.interviews add column if not exists assessment_id text;
create index if not exists interviews_assessment_idx on public.interviews (assessment_id);
