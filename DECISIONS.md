# Neko 설계 결정 기록

DEVLOG에 분산된 핵심 설계·제품 결정을 한 곳에 정리합니다.
이 문서는 **"왜 이렇게 됐는가"**의 단일 출처예요. 세부 진행 일지는 [`DEVLOG.md`](./DEVLOG.md) / [`devlog/archive/`](./devlog/archive/) 참조.

각 항목은 **결정 → 근거 → 영향**으로 구성됩니다. 이후 결정을 뒤집을 때는 기존 항목을 제거하지 말고 "개정" 블록을 덧붙여 이력을 남깁니다.

---

## Product / UX

### 1. 스와이프 축 분리: 좌우 = 캐러셀 브라우징 / 위·아래 = 액션 매핑 (2026-04-10, Day 7 / 개정 2026-04-29, Day 21)
- **결정:** 좌 스와이프 = 다음 작품, 우 스와이프 = 이전 카드 오버레이. like/pass/reject 같은 **평가 의미는 좌우 축에 절대 부여하지 않음**. **위·아래 축은 명시적 액션 매핑 허용** (위 = DetailSheet 열기, 아래 = save).
- **근거:** Tinder 문법("스와이프 = 판정")은 "소비 = 평가" 부담을 유발하고, 사용자가 **틀린 선택 공포**로 저장을 미루게 만듦. Neko의 가치는 "발견"이지 "심사"가 아님. **좌우 축 = 브라우징 / 위·아래 축 = 액션** 분리는 평가-액션 구분을 유지하면서 제스처 자유도를 확장. save는 "저장한다"는 명시적 액션이지 평가가 아니므로 #1 원칙과 충돌하지 않음.
- **영향:** 좋아요는 명시적 **버튼** + **아래 스와이프 액션**으로 호출 가능 (둘 다 액션). "별로"/거절 제스처는 여전히 **없음** — 싫으면 그냥 넘기면 됨. 시청 리포트(현 아래 스와이프 자리)는 제거 결정 (Q1=D).
- **참조:** DESIGN.md §Interaction Model 불변식. 아카이브 Day 5-7 참조.
- **개정 이력 (2026-04-29, Day 21):** F7 사용자 피드백("아래 스와이프 = save + 우측하단 save 버튼 흡수 모션") 명확화 결과 반영 — 위·아래 축 = 액션 허용 명시 보강 (Q3=B). 시청 리포트 제거 결정 (Q1=D). 모션 디자인은 디자인팀 위임 (Q2=C, W3 통합 시점). 코드 변경(useSwipeGesture.ts + WatchReactionPanel 제거 + save 흡수 모션)은 W3 디자인 통합(5/12~) 시점.

### 2. 별점순 정렬 의도적 제외 (2026-04-13, Day 8)
- **결정:** 추천 결과 별점순 정렬 기능 **구현하지 않음**.
- **근거:** 별점 정렬은 다양성을 파괴하고 "숨겨진 명작 발굴"이라는 Neko의 존재 이유와 충돌. 넷플릭스가 별점을 제거한 이유와 동일 — 별점은 실제 시청 행동을 예측하지 못함.
- **영향:** 필터는 유형/국가/년도/OTT만 제공. 정렬 옵션 자체 제공 안 함.

### 3. 해요체 톤 일관 유지 (2026-04-10, Day 7)
- **결정:** 모든 UI 카피·추천 이유·에러 메시지는 **해요체**로 통일. "~습니다" 격식체와 반말 모두 금지.
- **근거:** 초기 "~습니다" → 친근함을 위해 반말로 전환했다가 사용자 피드백으로 다시 교정. 해요체가 **담백함 + 존중**의 균형점.
- **영향:** LLM 프롬프트(reason 생성)에도 해요체 강제. DESIGN.md Tone & Voice 섹션에 규칙화.

### 4. Taste Context (페르소나 v1): 같은 사용자의 다른 취향 (2026-04-17, Day 13)
- **결정:** 온보딩 픽과 시청 반응을 **페르소나별로 분리**. saved/archived는 **글로벌 유지**(한 곳에서 전체 조회).
- **근거:** 같은 사람이 평일 저녁엔 예능, 주말엔 시리즈를 보는데 한 컨텍스트가 다른 컨텍스트의 추천을 오염시킴. 넷플릭스 멀티프로필과의 차별점: 가족 공유가 아닌 **한 개인의 모드 분기**.
- **영향:** storage schema v2 도입. v1→v2 원자적 마이그레이션. `contextId` 필드 `@neq/core/types.ts`에 추가.
- **개정 가능성:** 최대 3개 제한은 v1 편의상. 아바타/성격 태그는 Full Persona(Approach B) 추후 확장 후보.

---

## Recommendation Architecture

### 5. Hybrid 파이프라인 채택 (2026-04-13, Day 8)
- **결정:** 추천 파이프라인을 **TMDB /recommendations → 메타 풍부화 → 필터 → LLM 큐레이션 1회(gpt-4o-mini)**의 하이브리드 구조로 확정.
- **근거:** 기존 매번 LLM 호출(gpt-4o) 방식 대비 **~10배 저렴, ~3배 빠름**. LLM은 후보 선별·이유 생성에만 사용, 후보 발굴은 TMDB가 담당.
- **영향:** OpenAI 비용 예측 가능. `apps/web/src/lib/recommend.ts`가 단일 소스.

### 6. Cold Start에서 LLM 스킵 (2026-04-13, Day 8)
- **결정:** favorites가 비어있으면 **LLM 호출 생략**, TMDB trending/discover 결과를 템플릿 reason과 함께 즉시 반환.
- **근거:** 신규 사용자 첫 진입 시 LLM 경로는 **16초**, trending 직접 반환은 **4초**. Cold start는 개인화 가치가 낮고 속도가 훨씬 중요.
- **영향:** 신규 사용자 OpenAI 비용 = **$0**. 피드백 5건 이상부터 LLM 경로 진입.

### 7. loadMore 폐기 + 대량 배치 캐시 (2026-04-13, Day 8)
- **결정:** 서버는 한 번에 50개 반환, 클라이언트는 남은 10장 시 prefetch만.
- **근거:** loadMore 기반 증분 로딩이 모든 추천 버그의 근원이었음 — 중복, 무한루프, stale closure, race condition. stateless 서버 + 클라 캐시 조합에서 **구조적으로 취약**. 인스타/넷플릭스도 대량 배치 + 서버 상태로 해결.
- **영향:** `loadMoreRecs` 함수 완전 제거. `prefetchNextBatch`로 단순화. 추천 관련 버그 대다수 소멸.

### 8. 적응형 큐레이션 모드 (2026-04-13 / 04-16)
- **결정:** 사용자 신호(`totalSignal = totalFeedback + savedCount`) 누적에 따라 LLM 큐레이션 프롬프트 자동 전환.
- **근거:** 초기엔 취향 데이터가 없어 탐색이 필요하고, 쌓일수록 개인화 깊이가 중요. 고정 프롬프트는 양 극단에서 모두 실패.
- **모드:**
  - `≤4`: 탐색 (폭넓은 장르, 취향 30%)
  - `5-9`: 혼합 (취향 50%, 새 장르 50%)
  - `≥10`: 개인화 (취향 깊이 + 의외 30%)
- **영향:** Day 12 `332685b`에서 saved도 signal로 포함 → 개인화 진입 임계값 21+ → 10+로 하향.

---

## Client Architecture

### 9. 이전 카드는 오버레이 레이어 (2026-04-09, Day 5)
- **결정:** 우 스와이프 시 `topIdx`를 드래그 중에 **변경하지 않음**. 이전 카드를 별도 z-20 오버레이로 렌더, `prevOverlayX`로 손가락 1:1 추적, 놓을 때만 30%+ 임계로 전환.
- **근거:** 드래그 중 `topIdx` 변경 → React 리렌더 → 전환 끊김. 오버레이 분리로 60fps 유지.
- **영향:** `SwipeCard.tsx` + `PrevCardOverlay.tsx` 분리. DESIGN.md 불변식에 포함.

### 10. Detail 바텀시트는 fixed 독립 레이어 (2026-04-09, Day 5)
- **결정:** DetailSheet를 scroll-snap 컨테이너에서 분리, `fixed inset-0 z-50 + translateY(%)`로 독립 관리. 핸들바 25% 드래그 / X / Escape로만 닫힘.
- **근거:** 초기엔 카드와 같은 scroll-snap 컨테이너에 있어서 본문 스와이프 시 카드 복귀 버그. 구조적 충돌 → 레이어 완전 분리.
- **영향:** touchAction: none + overscroll-behavior: contain으로 뒤쪽 스크롤 전파 차단.

### 11. 부채꼴 카드 덱 (2026-04-08, Day 4)
- **결정:** `topIdx`부터 3장을 역순 렌더(뒤→앞). 맨 앞 카드만 `dragX/dragY` 적용, 치우면 `topIdx+1`. DOM 생성/삭제 없이 인덱스만 변경.
- **근거:** 3D 원통형 캐러셀 모바일 왜곡 + scroll-snap 중앙정렬 버그. "5차 진화"에서 최종 착지. 전환 애니메이션이 매끄럽고 메모리 안정적.
- **영향:** `isTop` / `depth` prop 기반 SwipeCard 렌더. 깊이별 scale 1 - depth×0.04, yOffset depth×12.

---

## Design System

### 12. Anti-Slop 원칙 (2026-04-10, Day 7)
- **결정:** "AI가 만든 느낌" 방지를 위해 다음 패턴을 **전면 금지**:
  - 균일한 rounded-full pill 배지
  - 동일 크기 버튼 스택
  - 균일 그리드 (3×3, 4×4)
  - 그라디언트 버튼 배경
  - 보라/바이올렛 그라디언트
  - text-[10px] 이하 폰트
  - 이모지를 UI 요소로 사용
  - 제네릭 카피 ("최고의", "완벽한")
- **긍정 원칙:** 감정별 tint / 크기 불균일 / border 최소화 / 비대칭 배치 / 맥락 있는 카피.
- **근거:** 기능보다 **디테일에서 수제 느낌**이 나옴. 제품 차별화의 최대 적은 "AI 디폴트 패턴".
- **영향:** DESIGN.md Anti-Slop 체크리스트. UX 리뷰 에이전트(ux-reviewer)의 첫 번째 검증 기준.

### 13. Warm Cinema → Quiet Ink 전환 (2026-04-15, Day 9)
- **결정:** 오렌지 기반 Warm Cinema 시스템 폐기. **Quiet Ink**(웜 뉴트럴 + 앰버 골드 + Fraunces 세리프)로 전환.
- **근거:** 4인 디자인 팀 Phase 1-4 순차 작업. Phase 4 비평에서 블루 액센트 후보 기각 → 앰버 골드로 경쟁사 차별화(넷플릭스 레드/왓챠 블루와 분리). "독립서점 큐레이션 선반" 무드 확립.
- **영향:** CSS 변수 교체만으로 전체 앱 적용(토큰 기반 설계 덕분). 1차 배포 완료 후 film grain 텍스처, RewindOverlay 톤 등 세부 폴리싱 남음.

### 14. 로고 = "neq," 텍스트 마크 (2026-04-09~10, Day 6)
- **결정:** 프로젝트명을 "Neko" → **"neq,"** 로 리브랜딩. 로고는 Fraunces 세리프 텍스트 마크.
- **근거:** "Neko"의 고양이 연상이 음식·펫 앱 카테고리로 해석될 리스크. "neq,"는 **발음 중립적**, 콤마가 "여운/다음" 암시.
- **영향:** GitHub 레포, localStorage 키(`neq_*`), 컴포넌트명, manifest 전체 교체. 고양이 실루엣 아이콘 폐기.

---

## Data / Infrastructure

### 15. Device ID + Schema Version = 백엔드 마이그레이션 계약 (2026-04-10, Day 7)
- **결정:** `src/lib/device-id.ts`의 익명 UUID + `USER_DATA_SCHEMA_VERSION` + `UserDataExport` 타입을 **미래 `/api/user/sync` 응답 스펙과 동일**하게 설계.
- **근거:** "지금은 localStorage, 나중엔 API"를 한 곳에서 분기 가능하게. store.ts 함수 인터페이스 유지 → 나중엔 sync→async 전환만으로 백엔드 연결.
- **영향:** 데이터 백업 UI는 "AI가 만든 기능" 느낌으로 제거했지만 함수는 store.ts에 보존. v1→v2 persona 마이그레이션도 동일 패턴 재사용.

### 16. Supabase Anonymous Auth로 RLS 실효화 (2026-04-16, Day 12)
- **결정:** `anon key` 직접 접근 + `device_id` RLS 조합 **폐기**. `signInAnonymously()` + `auth.uid()` 기반 정책으로 전환.
- **근거:** Day 10에 방향 A(anon 전면 허용)로 임시 완화했으나 보안 실효성 0. `device_id`가 로컬 소실되면 데이터 복구 불가(cloud backup일 뿐, 크로스 디바이스 아님).
- **영향:** `supabase/002_anonymous_auth.sql`로 RLS 정책 교체. `ensureAuth()` 싱글톤 Promise로 동시성 처리. 기존 profile은 `user_id` 연결로 마이그레이션.

### 17. 측정 = 기능보다 우선 (2026-04-10, Day 7)
- **결정:** PostHog 통합을 **기능 개선보다 먼저**. 22종 이벤트 체계적 인스트루먼테이션. `track()` 헬퍼 + `NekoEvent` 타입으로 단일 출처화.
- **근거:** "이게 좋아졌을까?"를 감으로만 판단하는 함정. 기능 개선 → 측정 불가 → 다음 결정도 감. 숫자 없이는 어떤 이터레이션도 효과 검증 불가.
- **영향:** React Strict Mode 이중 실행 → `trackedRef` 가드 패턴 확립. 모든 새 기능은 analytics 이벤트 포함이 필수.

### 18. 광고는 feature flag + DAU 10K 이후 (2026-04-15, Day 9)
- **결정:** `AD_ENABLED = false` 기본값 유지. 15카드당 1개 AD 카드 삽입 로직은 구현돼 있음. **DAU 10,000+ 진입 후 활성화**.
- **근거:** 너무 이른 수익화는 UX 신뢰 파괴. 카테고리 허용(entertainment/books/music/lifestyle/coupang) / 금지(game/gambling/loan/diet/adult) 사전 규정.
- **영향:** `ad-config.ts`에 명시. AdCard 컴포넌트는 동일 레이아웃 + "AD" 라벨.

---

## Native / Monorepo

### 19. 네이티브 스택: Expo SDK 52+ (2026-04-15, Day 10~11)
- **결정:** PWA → **Expo(React Native) SDK 52+**로 네이티브 전환. Capacitor 기각.
- **근거:**
  - 기존 React 자산 재활용 + iOS/Android 동시
  - EAS Build / Submit / Update(OTA) 제공
  - Appium + XCUITest/UIAutomator2 자동화 재사용 가능
  - iOS 17 Safari 웹뷰 디버거 블로커(Day 10)가 네이티브 전환 시 구조적으로 소멸
- **영향:** `apps/native/`에 독립 Expo 프로젝트. Phase 2 PoC → Phase 3 모노레포 전환 완료. 웹 PWA는 병행 유지.
- **참조 (2026-04-29 추가):** 네이티브 작업의 영역 분리 원칙은 **#22** 참조 — 이관(Migration) / 앱 등록(Store) / 인프라(Infra)는 본질이 다른 별개 영역

### 20. Turborepo 모노레포 + @neq/core 단일 타입 출처 (2026-04-15~16, Day 11~12)
- **결정:** `apps/web/` + `apps/native/` + `packages/core` + `packages/design`의 Turborepo 구조. 타입·API 클라이언트는 **@neq/core에서만 정의**, apps는 re-export만.
- **근거:** 웹/네이티브 타입 drift 방지. 디자인 토큰 단일 관리. Day 12 `eee9821`에서 로컬 정의 전부 삭제 + core로 이관.
- **영향:** `packages/core/types.ts`에 `Recommendation`, `WatchReport`, `RecommendFilter`, `Persona` 등 전부. web은 필수 필드 유지, native는 optional 허용.

---

## External Data Sources

### 21. OTT 가용성은 TMDB(JustWatch) 단일 소스 + 한계 인지 정책 (2026-04-27, Day 18)
- **결정:** OTT 가용성/링크 데이터는 **TMDB watch/providers 단일 소스**만 운영. 외부 데이터 소스(Watchmode/JustWatch B2B/자체 크롤링) 통합 안 함. 누락 OTT는 UX 폴백으로 처리.
- **근거 (Day 18 F8 진단):**
  - TMDB(JustWatch) KR provider: Netflix/Prime/Disney+/AppleTV+/wavve/Tving/Watcha 정상 커버
  - **쿠팡플레이/Seezn 등 일부 한국 OTT 추적 부재** (JustWatch가 1차 raw에서 빠뜨림)
  - **Watchmode 검증 결과**: KR 10개 provider 중 글로벌 OTT만, **한국 토종 0**. 통합 가치 0
  - JustWatch B2B 라이선스: 연 수만 달러 추정 → DAU 10K+ 단계 협상 영역
  - 자체 크롤링: 법적 리스크(이용약관 위반) + 안정성 ↓
- **영향:**
  - **UX 폴백** (W3 디자인 리빌드 통합 시점): detail에 *"OTT 정보는 일부 플랫폼(쿠팡플레이 등)이 누락될 수 있어요"* 디스클레이머 + 외부 검색 redirect
  - **OTT 가격 정보(F2)도 동일 영역**: TMDB 미제공 + JustWatch 라이선스 동일. **가격 자체 보류**. ~~카테고리 라벨(구독/대여/구매)~~ → Day 19 (4/28) 사용자 검증에서 detail UI에 어색하여 **chip 표시 제거** (`4e5eded` UI 롤백). 데이터 레이어의 `category` 필드는 미래 활용 위해 유지
  - **Deep link 전략** (F4, W5): TMDB watchLink hub 우선 + Universal Link, 한국 토종은 web 검색 fallback. 자세한 사항은 `_workspace/ott-deeplink-research.md`
  - **DAU 10K+ 도달 시 재검토** (재확인 2026-04-29, Day 21, Q4=C): 직접 라이선스 협상 또는 사용자 제보 supplement 테이블 옵션 5 활성화. **현 단계에서 옵션 5 (수동 큐레이션) 즉시 구축은 보류** — DAU 10K+ 시점에 라이선스 협상 우선 시도. 옵션 1 (디스클레이머 + 외부 검색 redirect)은 W3 디자인 통합 시 추가

---

## Native Workflow

### 23. 네이티브 알림 — 개발 테스트 단계 보류 (2026-04-29, Day 24)
- **결정:** 네이티브(Expo)에서 push 알림은 **개발 테스트 단계 보류**. iOS 첫 출시 후 1~2주 피드백 수렴 후 재검토. 현 단계는 **PWA Web Push만 유지** (P0-4 코드 완성, VAPID 등록 후 활성화)
- **근거:** 개발 테스트 단계에서 Expo Push (APNs/FCM 키 등록 + token 저장 + send.ts 분기 추가) 작업은 비용 대비 가치 낮음. iOS 베타 사용자가 "앱 알림" 강하게 요청하는 시점에 재결정이 더 합리적
- **영향:**
  - `apps/native/`에 push notification 패키지 추가 X (현 단계)
  - 서버 `apps/web/src/lib/notifications/send.ts` 분기 X (Web Push 전용 그대로)
  - `account_prefs.notificationPrefs` 스키마에 `expoPushToken` 추가 X
  - 네이티브 사용자는 알림 비대상 — iOS 출시 시점 (6/18~) 안내 문구 또는 PWA 우회 권장
- **참조:** `_workspace/native-status-day22.md` §3 P0-4 (옵션 C 채택)

---

### 22. 네이티브 작업의 영역 분리 원칙: 이관 / 앱 등록 / 인프라 (2026-04-29, Day 23)
- **결정:** 네이티브 관련 작업은 **세 영역**(이관 Migration / 앱 등록 Store / 인프라 Infra)으로 **분리해서 우선순위와 시점을 별도 판단**. day20-wrap §Stage 2 같은 "네이티브 이관 준비"라는 묶음 표현은 회피
- **근거 (Day 23 발견):**
  - Day 23 진입 시 메인 세션이 Universal Link / App Links 작업을 "네이티브 이관 준비"로 오인하여 1순위로 잡음 → 사용자 직관("이관 30~40% 상태에서 앱 등록 절차 시기상조")으로 정정
  - 본질이 다른 작업: 이관 = 코드 옮기기 + UI 통합 / 앱 등록 = 행정·키·심사 / Universal Link = 앱 등록의 부분 작업 (도메인 verified deep link)
  - 동일 timeline에 묶일 이유 없음. 의존성·시점·재작업 비용이 영역마다 별개
- **영향:**
  - **이관 작업** (PWA → RN 코드 이식) = **디자인 도착 후** (5/12~). 미리 작업하면 UI 1회 + 디자인 적용 시 1회 = **2배 작업** 발생
  - **앱 등록 작업** (App Store / Play Console 행정·메타데이터·심사) = **출시 임박** (5/22~)
  - **Universal Link / App Links** = 앱 등록 영역. 사용자 input(Team ID/SHA256/도메인) 받으면 1~2h 작업 → 출시 임박 시점에 자연
  - **인프라 작업** (PWA + 백엔드 안정화, apps/native 점검, Supabase 호환) = **언제든 가능**. 디자인 도착 전 적극 진행
- **운영 효과:**
  - day-N-wrap에서 "네이티브" 항목 만나면 어느 영역인지 분리 기재 권장
  - roadmap 단계 분류 시 영역별 timeline 분리 (단계 4 = 인프라 / 단계 5 = 이관 / 단계 6~7 = 앱 등록 + Universal Link)
- **참조:** `_workspace/native-roadmap-clarification.md` — Day 23 보조 세션 분석. 세 영역 분리 표 + 영역별 timeline + roadmap 정정 권장

---

## Appendix: 기각된 대안

| 대안 | 선택 대신 한 것 | 기각 사유 |
|------|----------------|-----------|
| Tinder 스와이프 평가 문법 | 캐러셀 브라우징 | UX 철학 충돌 (#1) |
| 별점순 정렬 필터 | 정렬 옵션 없음 | 다양성 파괴 (#2) |
| 매번 LLM 호출 (gpt-4o) | Hybrid TMDB + LLM 1회 | 비용·속도 10배/3배 (#5) |
| loadMore 증분 로딩 | 대량 배치 + 프리페치 | 버그 근원 (#7) |
| 3D 원통형 카드 캐러셀 | 부채꼴 덱 | 모바일 왜곡/성능 (#11) |
| 보라/그라디언트 풍 Warm Cinema | Quiet Ink | LLM slop 느낌 (#13) |
| Capacitor | Expo RN | 자산 재활용 + EAS OTA (#19) |
| 데이터 백업 UI (프로필 내) | 함수만 보존, UI 제거 | "AI가 만든 기능" 느낌 (#15) |
| anon key + device_id RLS | Supabase anonymous auth | 보안 실효성 0 (#16) |
| Watchmode API 통합 (한국 OTT 보강 목적) | TMDB 단일 + UX 폴백 | KR provider 10개 중 한국 토종 0, 통합 가치 0 (#21) |

---

## 개정 이력
| Date | 항목 | 변경 |
|------|------|------|
| 2026-04-23 | 초기 작성 | Day 1~13 로그에서 20개 결정 추출 |
| 2026-04-29 (Day 21) | #1, #21 | F7 명확화 (Q1~Q3) + F8 강등 재확인 (Q4) 반영. 스와이프 축 분리 명시 보강, 시청 리포트 제거 결정, 쿠팡플레이 옵션 5 보류 |
| 2026-04-29 (Day 23) | #19, #22 | 네이티브 영역 분리 원칙 신규 결정 (#22). #19에 cross-ref 추가. day20-wrap §Stage 2 묶음 분류로 인한 우선순위 혼동 정정 |
| 2026-04-29 (Day 24) | #23 | 네이티브 알림 architecture 결정: Expo Push 개발 테스트 단계 보류. iOS 출시 후 재검토. PWA Web Push 단일 채널 유지 |
