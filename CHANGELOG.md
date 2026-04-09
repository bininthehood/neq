# Changelog

All notable changes to Neko will be documented in this file.

## [0.1.1.0] - 2026-04-09

### Fixed
- localStorage 파싱 실패 시 앱 크래시 방지 — safeParse 래퍼로 모든 JSON.parse 호출 보호
- 필터 빠르게 변경 시 이전 응답이 현재 상태를 덮어쓰는 race condition — AbortController로 stale fetch 취소
- 컴포넌트 unmount 후 setTimeout이 state를 set하는 문제 — 타이머 ref 추적 + cleanup

## [0.1.0.0] - 2026-04-09

### Added
- 커스텀 404 페이지 — Warm Cinema 디자인 시스템 적용, /discover로 복귀 링크
- 스와이프 튜토리얼 오버레이 — 첫 사용자에게 제스처 안내 (패스, 이전 카드, 새로고침)
- API 에러 핸들링 — try/catch + 사용자 친화적 에러 메시지 + 재시도 버튼
- Vercel Analytics 통합 — 페이지뷰 자동 추적
- .env.example 템플릿

### Changed
- 타입 안전성 개선 — `any` 타입을 `Record<string, string>`, `Recommendation`으로 교체
- 튜토리얼 오버레이 DESIGN.md 준수 — 타이포 스케일 정렬, 비대칭 레이아웃, 한글 레이블 통일
