-- =============================================================================
-- T-04 / T-09 / T-10 / T-13 — Supabase (Postgres) sync target.
--
-- This mirrors the local SQLite schema, but it is NOT the source of truth. The
-- device's SQLite database is (PRD §2.5 makes offline a hard requirement).
-- Postgres exists to back up the student's history and to serve the parent
-- viewer on a separate device.
--
-- The privacy rule in PRD §2.7 — "a student's specific wrong answers are the
-- student's own learning data, not a surveillance feed for the parent" — is
-- enforced here in row-level security rather than in UI code. A parent session
-- has no SELECT policy on `attempts` at all, so even a compromised client or a
-- hand-written query cannot read item-level error data. UI-level hiding would
-- be a suggestion; this is a guarantee.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Identity
-- -----------------------------------------------------------------------------

create table if not exists public.students (
  id                 uuid primary key default gen_random_uuid(),
  display_name       text not null check (length(display_name) between 1 and 40),
  grade_level        int  not null check (grade_level between 5 and 12),
  program_start_date date not null,
  target_test_date   date not null,
  created_at         timestamptz not null default now()
);

comment on column public.students.display_name is
  'Nickname only. PRD §2.7 forbids storing a legal name; there is deliberately no column for one.';

-- Maps an authenticated user to a role and the student they may see.
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  role         text not null check (role in ('student', 'parent')),
  student_id   uuid not null references public.students(id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_profiles_student on public.profiles(student_id);

-- Helper predicates used by every policy below. SECURITY DEFINER + a pinned
-- search_path so they can read `profiles` without recursing into its own RLS.
create or replace function public.current_student_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select student_id from public.profiles where user_id = auth.uid();
$$;

create or replace function public.current_role_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where user_id = auth.uid();
$$;

create or replace function public.is_student_of(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'student' and student_id = target
  );
$$;

create or replace function public.is_parent_of(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'parent' and student_id = target
  );
$$;

-- -----------------------------------------------------------------------------
-- Learning data
-- -----------------------------------------------------------------------------

create table if not exists public.sessions (
  id                 uuid primary key,
  student_id         uuid not null references public.students(id) on delete cascade,
  date               date not null,
  phase              text not null check (phase in ('A', 'B', 'C', 'D')),
  blocks             jsonb not null,
  started_at         timestamptz,
  completed_at       timestamptz,
  actual_seconds     int not null default 0,
  missed_days_before int not null default 0,
  unique (student_id, date)
);

create index if not exists idx_sessions_student_date
  on public.sessions(student_id, date desc);

create table if not exists public.attempts (
  id                    uuid primary key,
  student_id            uuid not null references public.students(id) on delete cascade,
  item_id               text not null,
  session_id            uuid references public.sessions(id) on delete set null,
  block_kind            text,
  answered_at           timestamptz not null,
  response              text not null,
  correct               boolean not null,
  response_time_ms      int not null,
  grade                 text not null check (grade in ('again', 'hard', 'good', 'easy')),
  stability_before      real,
  difficulty_before     real,
  retrievability_before real,
  elapsed_days          real not null default 0,
  elo_before            real
);

create index if not exists idx_attempts_student_time
  on public.attempts(student_id, answered_at desc);

comment on table public.attempts is
  'Item-level responses. Student-only by RLS — no parent policy exists on this table (PRD §2.7).';

create table if not exists public.fsrs_state (
  student_id     uuid not null references public.students(id) on delete cascade,
  item_id        text not null,
  stability      real not null,
  difficulty     real not null,
  due            timestamptz not null,
  last_review    timestamptz,
  reps           int not null default 0,
  lapses         int not null default 0,
  state          int not null default 0,
  scheduled_days real not null default 0,
  elapsed_days   real not null default 0,
  learning_steps int not null default 0,
  primary key (student_id, item_id)
);

create table if not exists public.elo_state (
  student_id uuid not null references public.students(id) on delete cascade,
  skill_id   text not null,
  ability    real not null default 0,
  attempts   int not null default 0,
  updated_at timestamptz not null,
  primary key (student_id, skill_id)
);

create table if not exists public.bkt_state (
  student_id uuid not null references public.students(id) on delete cascade,
  skill_id   text not null,
  p_known    real not null,
  attempts   int not null default 0,
  updated_at timestamptz not null,
  primary key (student_id, skill_id)
);

create table if not exists public.fsrs_params (
  student_id        uuid primary key references public.students(id) on delete cascade,
  params            jsonb not null,
  optimised_at      timestamptz not null,
  review_count      int not null,
  train_log_loss    real,
  baseline_log_loss real
);

create table if not exists public.test_results (
  id                    uuid primary key,
  student_id            uuid not null references public.students(id) on delete cascade,
  kind                  text not null,
  taken_on              date not null,
  section_scores        jsonb not null,
  domain_scores         jsonb not null,
  total_scaled          int not null,
  confidence_half_width int not null,
  attempt_ids           jsonb not null
);

create index if not exists idx_test_results_student
  on public.test_results(student_id, taken_on desc);

-- The parent's entire read surface. Aggregate only, by construction: this is
-- the scope defined in PRD §2.1 and it contains no item-level data.
create table if not exists public.weekly_digests (
  id           uuid primary key,
  student_id   uuid not null references public.students(id) on delete cascade,
  week_start   date not null,
  payload      jsonb not null,
  generated_at timestamptz not null,
  unique (student_id, week_start)
);

create index if not exists idx_digests_student_week
  on public.weekly_digests(student_id, week_start desc);

-- -----------------------------------------------------------------------------
-- Row-level security
-- -----------------------------------------------------------------------------

alter table public.students       enable row level security;
alter table public.profiles       enable row level security;
alter table public.sessions       enable row level security;
alter table public.attempts       enable row level security;
alter table public.fsrs_state     enable row level security;
alter table public.elo_state      enable row level security;
alter table public.bkt_state      enable row level security;
alter table public.fsrs_params    enable row level security;
alter table public.test_results   enable row level security;
alter table public.weekly_digests enable row level security;

-- A user always sees their own profile row, and nothing else.
create policy profiles_self_read on public.profiles
  for select using (user_id = auth.uid());

-- Both roles may read the student record (the parent needs the nickname and
-- target test date to render the summary header).
create policy students_read on public.students
  for select using (
    public.is_student_of(id) or public.is_parent_of(id)
  );

create policy students_write on public.students
  for update using (public.is_student_of(id))
  with check (public.is_student_of(id));

-- Student-only tables. Note the deliberate absence of any parent policy:
-- with RLS enabled and no matching policy, a parent's select returns zero rows.
do $$
declare t text;
begin
  foreach t in array array[
    'sessions', 'attempts', 'fsrs_state', 'elo_state',
    'bkt_state', 'fsrs_params', 'test_results'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all
         using (public.is_student_of(student_id))
         with check (public.is_student_of(student_id));',
      t || '_student_only', t
    );
  end loop;
end $$;

-- Digests: the student's device writes them, the parent may only read them.
create policy digests_student_write on public.weekly_digests
  for all using (public.is_student_of(student_id))
  with check (public.is_student_of(student_id));

create policy digests_parent_read on public.weekly_digests
  for select using (public.is_parent_of(student_id));
