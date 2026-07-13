# neq

> 당신의 취향을 발견하세요. 알고리즘 밖의 OTT 작품을 찾아드려요.

**Web** — [neq.me](https://neq.me) · **iOS** — [App Store](https://apps.apple.com/kr/app/id6773622396)

OTT에는 볼 게 많은데, 오히려 뭘 볼지 못 고르는 경험. neq는 좋아하는 작품 3개만 알려주면 숨겨진 명작을 큐레이션해주는 콘텐츠 발굴 앱입니다. 넷플릭스, 디즈니+, 웨이브, 티빙, 쿠팡플레이, 왓챠, 애플TV+ 등 한국에서 볼 수 있는 OTT 전체를 대상으로 합니다.

- **좋아하는 작품 3개 선택** → 취향 파악
- **스와이프로 탐색** → 카드를 넘기며 발굴
- **저장 + 시청 피드백** → 추천이 점점 정확해짐
- **오늘 뭐 볼까** → Saved에서 한 편 추천

## 주요 기능

| 영역 | 내용 |
| --- | --- |
| Discover | 카드 덱 스와이프 (좌: 다음 / 우: 이전 / 아래: 저장 / 탭: 디테일), 필터 (유형·국가·OTT), 무한 탐색 |
| Detail | 바텀시트 — 감독·출연·줄거리, 인라인 트레일러, OTT 딥링크, 공유 |
| Saved | 장르 필터 칩, 연·월 그룹핑, 시청 완료 아카이브, 랜덤 픽 |
| 취향 학습 | 시청 피드백 4단계 (인생작 / 괜찮았어 / 별로였어 / 안맞았어) → 추천 프롬프트 개인화 |

## 아키텍처

Turborepo 모노레포. 웹 PWA와 네이티브 앱이 추천 로직·타입을 공유합니다.

```
neq/
├── apps/
│   ├── web/         # Next.js 16 PWA (App Router)
│   └── native/      # Expo 앱 (iOS / Android)
├── packages/
│   ├── core/        # 공유 도메인 로직 (추천, 필터, OTT, 장르)
│   └── design/      # 디자인 토큰
├── supabase/        # DB 마이그레이션 (TMDB 미러, pgvector)
├── scripts/         # 크롤러, 미러 sync, 분석·게이트 스크립트
└── .github/workflows/  # 데이터 파이프라인 + 모니터링 cron
```

### 추천 파이프라인

1. **LLM 큐레이션** — OpenAI(gpt-4o-mini)에 취향·시청 피드백·제외 목록을 주입해 후보 생성. 다양성 규칙 (장르·시대 혼합, 숨겨진 명작 위주) 적용
2. **TMDB 미러 enrich** — LLM 응답을 자체 DB 미러로 hydrate. 라이브 TMDB API 왕복 (4.8~12.3s) 대비 평균 ~400ms, 10~25× 단축
3. **스트리밍 응답** — 첫 카드부터 순차 전달, 타임아웃 시 비스트리밍 fallback

### TMDB Mirror

TMDB 전체 카탈로그 (~140만 작품)를 Supabase에 미러링해 추천 enrich를 로컬 조회로 처리합니다.

- `tmdb_catalog` (Daily ID Export 전량) / `tmdb_metadata` (detail + credits + providers) / `tmdb_crawl_queue`
- TTL 관리 — 메타데이터 180일, OTT 가용성(providers) 30일
- GitHub Actions cron 파이프라인: catalog sync → bulk crawl → stale refresh → providers refresh → snapshot
- 미러 vs 라이브 parity 97% (200건 샘플 검증)

## 기술 스택

| 레이어 | 기술 |
| --- | --- |
| Web | Next.js 16 (App Router), React 19, Tailwind CSS v4, PWA (Service Worker) |
| Native | Expo SDK 54, React Native 0.81, Expo Router, Reanimated 4 + Gesture Handler |
| Backend | Supabase (Postgres + pgvector), Vercel |
| AI | OpenAI gpt-4o-mini |
| Data | TMDB API + 자체 미러 |
| Analytics | PostHog |
| Testing | Vitest (단위), Appium + WebdriverIO (iOS 시뮬레이터 E2E 회귀) |

## 개발

```bash
npm install

# 환경 변수
cp apps/web/.env.example apps/web/.env
cp apps/native/.env.example apps/native/.env

# 웹 개발 서버
npm run web:dev        # localhost:3000

# 네이티브 (iOS)
npm run native:ios     # dev client 빌드 + 실행
npm run native:start   # Metro (--dev-client)

# 전체 빌드 / 검사
npm run build
npm run lint
npm run type-check
```

네이티브 E2E는 `apps/native/wdio.conf.ts` 기준 3-way 타겟 (`simulator-devclient` 기본 / `expo-go` / `testflight`)으로 실행합니다.

## 디자인 시스템

**Quiet Ink** — 포스터가 유일한 색채이고, UI는 잉크처럼 배경에 스며드는 미니멀 디자인. 독립서점의 큐레이션 선반 같은 절제된 타이포와 여백을 지향합니다. 상세 토큰과 원칙은 [DESIGN.md](./DESIGN.md) 참조.
