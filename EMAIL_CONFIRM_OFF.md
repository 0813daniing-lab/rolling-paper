# 이메일 인증 끄기 기준 안내

Supabase에서 Confirm email을 끄면 관리자 회원가입 후 바로 워크스페이스로 이동합니다.

경로:
Supabase → Authentication → Sign In / Providers → Email → Confirm email 끄기 → Save

이미 인증 전에 만든 계정으로 로그인 문제가 생기면:
Authentication → Users에서 해당 계정을 삭제한 뒤 다시 가입하거나, dashboard에서 수동 confirm이 가능한 경우 confirm 처리합니다.
