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
