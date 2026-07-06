-- 관리자 직급 입력용 컬럼입니다.
alter table public.profiles add column if not exists position text;
