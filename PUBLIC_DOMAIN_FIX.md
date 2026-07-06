# 공개 링크 도메인 고정 수정

문제:
Vercel 대시보드/브랜치 배포 주소에서 앱을 열고 공개 링크를 복사하면
rolling-paper-git-main-...vercel.app 같은 보호된 배포 주소가 공개 링크에 들어갈 수 있습니다.

수정:
공개 링크 복사 버튼이 항상 아래 Production 도메인을 사용합니다.

https://rolling-paper-plum.vercel.app

Vercel에서 다른 도메인을 쓰려면 Environment Variables에 다음 값을 추가하면 됩니다.

VITE_PUBLIC_SITE_URL=https://원하는도메인
