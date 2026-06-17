-- Somthingreat Supabase setup / migration
-- Run this in Supabase > SQL Editor.
-- This keeps progress recoverable by email, even if an auth user is deleted and recreated.

create extension if not exists pgcrypto;

create table if not exists public.workout_profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  current_auth_user_id uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workout_states_v2 (
  profile_id uuid primary key references public.workout_profiles(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

-- Keep the old V4 table available only for one-time migration/fallback.
-- New app code writes to workout_states_v2.
create table if not exists public.workout_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

-- Optional one-time migration for existing users still present in auth.users.
insert into public.workout_profiles (email, current_auth_user_id, updated_at)
select lower(u.email), u.id, now()
from auth.users u
where u.email is not null
on conflict (email) do update set
  current_auth_user_id = excluded.current_auth_user_id,
  deleted_at = null,
  updated_at = now();

insert into public.workout_states_v2 (profile_id, state, updated_at)
select p.id, ws.state, ws.updated_at
from public.workout_states ws
join public.workout_profiles p on p.current_auth_user_id = ws.user_id
on conflict (profile_id) do update set
  state = excluded.state,
  updated_at = excluded.updated_at;

alter table public.workout_profiles enable row level security;
alter table public.workout_states_v2 enable row level security;
alter table public.workout_states enable row level security;

drop policy if exists "Users can read their recovery profile" on public.workout_profiles;
create policy "Users can read their recovery profile"
on public.workout_profiles
for select
to authenticated
using (lower(email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "Users can create their recovery profile" on public.workout_profiles;
create policy "Users can create their recovery profile"
on public.workout_profiles
for insert
to authenticated
with check (lower(email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "Users can reconnect their recovery profile" on public.workout_profiles;
create policy "Users can reconnect their recovery profile"
on public.workout_profiles
for update
to authenticated
using (lower(email) = lower(auth.jwt() ->> 'email'))
with check (lower(email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "Users can read their recovered workout state" on public.workout_states_v2;
create policy "Users can read their recovered workout state"
on public.workout_states_v2
for select
to authenticated
using (
  exists (
    select 1 from public.workout_profiles p
    where p.id = profile_id
      and lower(p.email) = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "Users can insert their recovered workout state" on public.workout_states_v2;
create policy "Users can insert their recovered workout state"
on public.workout_states_v2
for insert
to authenticated
with check (
  exists (
    select 1 from public.workout_profiles p
    where p.id = profile_id
      and lower(p.email) = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "Users can update their recovered workout state" on public.workout_states_v2;
create policy "Users can update their recovered workout state"
on public.workout_states_v2
for update
to authenticated
using (
  exists (
    select 1 from public.workout_profiles p
    where p.id = profile_id
      and lower(p.email) = lower(auth.jwt() ->> 'email')
  )
)
with check (
  exists (
    select 1 from public.workout_profiles p
    where p.id = profile_id
      and lower(p.email) = lower(auth.jwt() ->> 'email')
  )
);

-- Old table policies kept for legacy read/migration fallback.
drop policy if exists "Users can read their own workout state" on public.workout_states;
create policy "Users can read their own workout state"
on public.workout_states
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own workout state" on public.workout_states;
create policy "Users can insert their own workout state"
on public.workout_states
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own workout state" on public.workout_states;
create policy "Users can update their own workout state"
on public.workout_states
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Admin dashboard read access for grascam@gmail.com.
-- Safe to run again. This only broadens SELECT access for the admin email.
drop policy if exists "Users can read their recovery profile" on public.workout_profiles;
create policy "Users can read their recovery profile"
on public.workout_profiles
for select
to authenticated
using (
  lower(email) = lower(auth.jwt() ->> 'email')
  or lower(auth.jwt() ->> 'email') = 'grascam@gmail.com'
);

drop policy if exists "Users can read their recovered workout state" on public.workout_states_v2;
create policy "Users can read their recovered workout state"
on public.workout_states_v2
for select
to authenticated
using (
  lower(auth.jwt() ->> 'email') = 'grascam@gmail.com'
  or exists (
    select 1 from public.workout_profiles p
    where p.id = profile_id
      and lower(p.email) = lower(auth.jwt() ->> 'email')
  )
);


-- Keep workout_profiles in sync with Supabase Auth users.
-- Run this in Supabase SQL Editor so the Admin dashboard can list users
-- even before they have completed onboarding or saved a workout.
create or replace function public.handle_auth_user_workout_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null then
    insert into public.workout_profiles (email, current_auth_user_id, deleted_at, updated_at)
    values (lower(new.email), new.id, null, now())
    on conflict (email) do update set
      current_auth_user_id = excluded.current_auth_user_id,
      deleted_at = null,
      updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_workout_profile on auth.users;
create trigger on_auth_user_workout_profile
after insert or update of email
on auth.users
for each row
execute function public.handle_auth_user_workout_profile();

-- Backfill profiles for users who already exist in Supabase Auth.
insert into public.workout_profiles (email, current_auth_user_id, deleted_at, updated_at)
select lower(u.email), u.id, null, now()
from auth.users u
where u.email is not null
on conflict (email) do update set
  current_auth_user_id = excluded.current_auth_user_id,
  deleted_at = null,
  updated_at = now();
