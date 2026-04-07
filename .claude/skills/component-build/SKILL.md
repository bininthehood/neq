---
name: component-build
description: "Neko React 컴포넌트 구현, 스와이프 카드 애니메이션, 상태 관리, 모바일 최적화. '컴포넌트 만들어', '애니메이션 추가', '상태 관리', '페이지 구현', '스와이프 개선', '새 기능 추가' 요청 시 사용."
---

# Component Build — Neko 프론트엔드 구현 가이드

## 기술 스택
- Next.js 16 App Router (`src/app/`)
- React 19 (`"use client"` 필요 시만)
- Tailwind CSS 4 (CSS 변수 기반)
- TypeScript strict

## 프로젝트 구조

```
src/
├── app/
│   ├── layout.tsx          — 루트 레이아웃 (폰트, 글로벌 스타일)
│   ├── page.tsx            — 리다이렉트 (→ /discover 또는 /onboarding)
│   ├── globals.css         — CSS 변수, Tailwind 설정
│   ├── onboarding/page.tsx — 작품 선택 (3-5개)
│   ├── discover/page.tsx   — 스와이프 카드 (핵심 화면)
│   ├── saved/page.tsx      — 저장한 작품 그리드
│   └── api/
│       ├── recommend/route.ts — 추천 생성
│       ├── search/route.ts    — TMDB 검색
│       └── trending/route.ts  — 트렌딩
├── components/
│   ├── BottomNav.tsx       — 하단 네비게이션
│   └── Icons.tsx           — SVG 아이콘
└── lib/
    ├── types.ts            — 공유 타입
    ├── store.ts            — localStorage 상태
    ├── tmdb.ts             — TMDB API
    ├── recommend.ts        — OpenAI 추천
    └── rate-limit.ts       — IP 기반 rate limit
```

## 스타일링 규칙

### CSS 변수 사용 (하드코딩 금지)
```tsx
// 올바름
style={{ background: "var(--surface)", color: "var(--text-primary)" }}

// 잘못됨
style={{ background: "#171412", color: "#F5F0EB" }}
```

### 인터랙션 피드백
```tsx
// 모든 버튼에 active 피드백
className="active:scale-95 transition-transform"

// 큰 버튼
className="active:scale-[0.98] transition-all"
```

### 모바일 최적화
- `h-dvh` — 모바일 동적 뷰포트 높이
- `touchAction: "pan-y"` 또는 `"none"` — 스크롤 제어
- `overscrollBehavior: "none"` — 바운스 방지
- `draggable={false}` — 이미지 드래그 방지

## 스와이프 카드 패턴

discover/page.tsx의 스와이프 시스템:
1. `onTouchStart` → 시작점 기록, 드래그 시작
2. `onTouchMove` → 방향 잠금 (10px 이상 이동 시), offsetX 업데이트
3. `onTouchEnd` → |offsetX| > 80이면 카드 전환, 아니면 원위치
4. 카드 exit 애니메이션: `translateX(±500px) rotate(±25deg)`, 300ms, 스프링 bezier

## 새 컴포넌트 추가 시 체크리스트
- [ ] DESIGN.md 읽었는가
- [ ] CSS 변수 사용하는가 (하드코딩 색상 없는가)
- [ ] 터치 타겟 최소 44x44px인가
- [ ] active:scale 피드백 있는가
- [ ] SSR 안전한가 (`typeof window` 가드)
- [ ] `"use client"` 필요한 경우에만 붙였는가
