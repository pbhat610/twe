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
