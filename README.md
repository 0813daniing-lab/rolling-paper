# 내일배움캠프 롤링페이퍼, Supabase + GitHub + Vercel 버전

이 프로젝트는 Supabase Auth/DB 저장, GitHub 연결, Vercel 배포를 전제로 만든 Vite React 앱입니다.

## 1. Supabase 세팅

Supabase에서 새 프로젝트 생성 후 SQL Editor에 들어가 `supabase/schema.sql` 전체를 붙여넣고 실행하세요.

## 2. 환경변수

`.env.example`을 복사해서 `.env` 파일을 만들고 값을 넣습니다.

```bash
cp .env.example .env
```

`.env` 안에 Supabase Project URL, anon public key를 넣습니다.

## 3. 로컬 실행

```bash
npm install
npm run dev
```

## 4. GitHub 업로드

```bash
git init
git add .
git commit -m "init rolling paper"
git branch -M main
git remote add origin https://github.com/깃허브아이디/rolling-paper.git
git push -u origin main
```

GitHub에서 빈 repository를 먼저 만들어야 합니다.

## 5. Vercel 연결

Vercel에서 Add New Project, Import Git Repository, 방금 만든 GitHub repo 선택, Environment Variables에 아래 두 개를 넣고 Deploy 하세요.

VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
