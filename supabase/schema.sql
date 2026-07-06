create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  manager_name text not null,
  track_name text not null,
  batch_name text not null,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.tracks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks(id) on delete cascade,
  name text not null,
  role text not null default '수강생',
  slug text not null,
  created_at timestamptz not null default now(),
  unique(track_id, slug)
);

alter table public.students add column if not exists role text not null default '수강생';

create table if not exists public.letters (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  writer_name text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.track_letters (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks(id) on delete cascade,
  writer_name text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table public.profiles enable row level security;
alter table public.tracks enable row level security;
alter table public.students enable row level security;
alter table public.letters enable row level security;
alter table public.track_letters enable row level security;

drop policy if exists "profiles select own" on public.profiles;
drop policy if exists "profiles insert own" on public.profiles;
drop policy if exists "profiles update own" on public.profiles;

create policy "profiles select own" on public.profiles
for select to authenticated
using (auth.uid() = id);

create policy "profiles insert own" on public.profiles
for insert to authenticated
with check (auth.uid() = id);

create policy "profiles update own" on public.profiles
for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "tracks owner all" on public.tracks;
drop policy if exists "tracks public select" on public.tracks;

create policy "tracks owner all" on public.tracks
for all to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "tracks public select" on public.tracks
for select to anon, authenticated
using (true);

drop policy if exists "students owner all" on public.students;
drop policy if exists "students public select" on public.students;

create policy "students owner all" on public.students
for all to authenticated
using (
  exists (
    select 1 from public.tracks
    where tracks.id = students.track_id
    and tracks.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.tracks
    where tracks.id = students.track_id
    and tracks.owner_id = auth.uid()
  )
);

create policy "students public select" on public.students
for select to anon, authenticated
using (true);

drop policy if exists "letters owner all" on public.letters;
drop policy if exists "letters public select" on public.letters;
drop policy if exists "letters public insert" on public.letters;
drop policy if exists "letters public update" on public.letters;

create policy "letters owner all" on public.letters
for all to authenticated
using (
  exists (
    select 1 from public.tracks
    where tracks.id = letters.track_id
    and tracks.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.tracks
    where tracks.id = letters.track_id
    and tracks.owner_id = auth.uid()
  )
);

create policy "letters public select" on public.letters
for select to anon, authenticated
using (true);

create policy "letters public insert" on public.letters
for insert to anon, authenticated
with check (true);

create policy "letters public update" on public.letters
for update to anon, authenticated
using (true)
with check (true);


drop policy if exists "track letters owner all" on public.track_letters;
drop policy if exists "track letters public select" on public.track_letters;
drop policy if exists "track letters public insert" on public.track_letters;
drop policy if exists "track letters public update" on public.track_letters;

create policy "track letters owner all" on public.track_letters
for all to authenticated
using (
  exists (
    select 1 from public.tracks
    where tracks.id = track_letters.track_id
    and tracks.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.tracks
    where tracks.id = track_letters.track_id
    and tracks.owner_id = auth.uid()
  )
);

create policy "track letters public select" on public.track_letters
for select to anon, authenticated
using (true);

create policy "track letters public insert" on public.track_letters
for insert to anon, authenticated
with check (true);

create policy "track letters public update" on public.track_letters
for update to anon, authenticated
using (true)
with check (true);
