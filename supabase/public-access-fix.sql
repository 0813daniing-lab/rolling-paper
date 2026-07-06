-- 공개 링크를 로그인 없이 조회/작성 가능하게 하는 RLS 정책 보강용 SQL입니다.
alter table public.tracks enable row level security;
alter table public.students enable row level security;
alter table public.letters enable row level security;

drop policy if exists "tracks public select" on public.tracks;
create policy "tracks public select" on public.tracks
for select to anon, authenticated
using (true);

drop policy if exists "students public select" on public.students;
create policy "students public select" on public.students
for select to anon, authenticated
using (true);

drop policy if exists "letters public select" on public.letters;
create policy "letters public select" on public.letters
for select to anon, authenticated
using (true);

drop policy if exists "letters public insert" on public.letters;
create policy "letters public insert" on public.letters
for insert to anon, authenticated
with check (true);

drop policy if exists "letters public update" on public.letters;
create policy "letters public update" on public.letters
for update to anon, authenticated
using (true)
with check (true);
