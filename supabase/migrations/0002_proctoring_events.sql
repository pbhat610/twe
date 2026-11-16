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
