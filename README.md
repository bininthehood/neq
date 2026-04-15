# neq,

> 당신의 취향을 발견하세요. 알고리즘 밖의 OTT 작품을 찾아드려요.

[https://neko-ecru.vercel.app](https://neko-ecru.vercel.app)

## 무엇을 하는 앱인가요

OTT에는 볼 게 많은데, 오히려 뭘 볼지 못 고르는 경험. neq,는 좋아하는 작품 3개만 알려주면 숨겨진 명작을 큐레이션해주는 PWA입니다.

- **좋아하는 작품 3개 선택** → 취향 파악
- **스와이프로 탐색** → 카드를 넘기며 발굴의 재미
- **저장 + 시청 피드백** → 추천이 점점 정확해짐
- **오늘 뭐 볼까 버튼** → Saved에서 한 편 추천

넷플릭스, 디즈니+, 웨이브, 티빙, 쿠팡플레이, 왓챠, 애플TV+ 등 한국에서 볼 수 있는 OTT를 전부 대상으로 합니다.

## 핵심 가치

- **발굴성**: 알고리즘이 안 보여주는 숨겨진 명작 70% 이상
- **빠른 결정**: 긴 설명보다 스와이프 기반 탐색
- **취향 학습**: 시청 피드백(인생작/괜찮았어/별로였어/안맞았어)으로 프롬프트 개인화
- **수제 느낌**: AI slop 패턴 배제, Warm Cinema 디자인 시스템

## 주요 기능

### Discover
- 부채꼴 카드 덱: 최대 15장 버퍼 + 프리페치로 끊김 없는 탐색
- 제스처: 좌우 스와이프(다음/이전), 하단 탭(디테일), 중앙 탭(봤어요?)
- 필터: 유형(영화/시리즈) · 국가(국내/해외) · OTT (다중 선택) 드롭다운 칩
- Pull-to-refresh로 새 추천 요청
- 디테일 바텀시트: 감독, 출연, 줄거리, OTT 딥링크, 공유

### Saved
- OTT별 그룹핑 토글
- 필터 탭: 전체 / 안 본 작품 / 시청 완료 / 아카이브
- 시청 완료 작품 아카이브 기능
- "오늘 뭐 볼까?" 버튼으로 랜덤 픽

### 추천 엔진
- OpenAI GPT-4o 기반 큐레이션
- TMDB API로 메타데이터 + OTT 가용성 검증
- 시청 피드백을 프롬프트에 주입해 개인화
- 제외 목록: 이미 본 작품 + 저장한 작품 최대 150개
- 다양성 규칙: 장르 3개 이상, 시대 혼합, 숨겨진 명작 70%

### PWA
- 오프라인 폴백 (Service Worker)
- 앱 아이콘 + 스플래시 스크린
- iOS/Android 홈 화면 설치
- 리마인더 배너 (24시간마다 안 본 작품 안내)

## 기술 스택

- **Framework**: Next.js 16 (App Router) + Turbopack
- **UI**: React 19 + Tailwind CSS v4
- **Language**: TypeScript
- **AI**: OpenAI GPT-4o
- **Data**: TMDB API (메타데이터, OTT 가용성)
- **Storage**: localStorage (Phase 1)
- **Deploy**: Vercel
- **Analytics**: Vercel Analytics

## 디자인 시스템

**Warm Cinema** — 영화관의 따뜻한 간접 조명을 모티프로 한 디자인 시스템. 자세한 내용은 [DESIGN.md](./DESIGN.md) 참조.

- 타이포그래피: Fraunces (디스플레이) + Pretendard Variable (한글 본문) + Outfit (숫자)
- 컬러: 워며 블랙 (#0C0A09) + 번트 오렌지 (#E87B35)
- 모션: 스프링 물리 기반 카드 스와이프

## 개발 환경

```bash
# 환경 변수
cp .env.example .env
# OPENAI_API_KEY, TMDB_API_KEY 설정

# 의존성 설치
npm install

# 개발 서버
npm run dev    # localhost:3000

# 빌드
npm run build
npm start
```

## 프로젝트 구조

```
src/
├── app/           # 페이지 (discover, saved, profile, api)
├── components/    # 컴포넌트 (Icons, BottomNav, Reminder, discover/)
├── hooks/         # 커스텀 훅 (useSwipeGesture, useDetailSheet, useRecommendations)
└── lib/           # 로직 (store, recommend, tmdb, ott-links, types)
```

## 로드맵

- [x] MVP: Onboarding + Discover + Saved
- [x] 디자인 시스템 적용 (M0)
- [x] 성능 최적화 (M1)
- [x] 컴포넌트 리팩토링 (M2)
- [x] 추천 품질 개선 (M3)
- [x] PWA 강화 (M4)
- [x] 폴리시 (M5)
- [x] 리브랜딩 (Neko → neq,)
- [ ] DB 연동 (Supabase) — 사용자 리텐션 확인 후
- [ ] 카카오 로그인
- [ ] 영화/시리즈 외 문화 전반 확장
