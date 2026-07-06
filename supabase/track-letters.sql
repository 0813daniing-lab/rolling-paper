-- 전체에게 쓰는 편지 탭용 테이블 및 RLS 정책입니다.

create table if not exists public.track_letters (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks(id) on delete cascade,
  writer_name text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table public.track_letters enable row level security;

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
