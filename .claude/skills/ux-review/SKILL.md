---
name: ux-review
description: "Neko UI/UX 리뷰, DESIGN.md(Warm Cinema) 준수 검증, 스와이프 인터랙션 감사, 모바일 터치 UX 검증, anti-slop 체크. '디자인 리뷰', 'UX 검토', 'DESIGN.md 체크', '스와이프 개선', '터치 UX' 요청 시 사용."
---

# UX Review — Warm Cinema 디자인 시스템 검증

Neko 코드의 UI/UX를 DESIGN.md 기준으로 검증하는 스킬.

## 리뷰 전 필수
1. `DESIGN.md` 전문을 읽어라 — 이것이 모든 판단의 기준
2. 리뷰 대상 파일을 읽어라
3. `src/app/globals.css`에서 CSS 변수 정의를 확인하라

## 검증 영역

### 1. 색상
| 용도 | CSS 변수 | 값 | 위반 예시 |
|------|---------|------|----------|
| 배경 | `--bg` | #0C0A09 | `#000000`, `#000` 사용 |
| 서피스 | `--surface` | #171412 | 임의의 어두운 색상 |
| 텍스트 | `--text-primary` | #F5F0EB | `#FFFFFF`, `#FFF` 사용 |
| 액센트 | `--accent` | #E87B35 | 보라, 초록, 파랑 CTA |

### 2. 타이포그래피
| 용도 | 클래스 | 위반 예시 |
|------|-------|----------|
| 헤드라인 | `font-display` (Fraunces) | sans-serif 헤드라인 |
| 본문 | 기본 (Pretendard) | Arial, sans-serif |
| 숫자 | `font-data` (Outfit) | 기본 폰트로 숫자 |

### 3. 스와이프 인터랙션
- 카드 exit: `cubic-bezier(0.34, 1.56, 0.64, 1)` — 스프링 오버슈트
- 스와이프 임계값: 80px (offsetX > 80)
- 방향 잠금: 10px 이상 이동 시 수평/수직 결정
- 드래그 중 회전: `rotate(${offsetX * 0.05}deg)`

### 4. 터치 타겟
- 최소 44x44px — 액션 버튼, 필터 칩, 네비게이션 항목 모두
- `active:scale-*` 피드백 필수

### 5. Anti-Slop
절대 금지 항목:
- 보라 그라디언트
- 균일한 둥근 모서리 (모든 곳에 `rounded-2xl`)
- 3열 아이콘 그리드
- 센터 정렬 일변도
- 그라디언트 버튼

## 리포트 형식

```
## UX Review Report — {대상 파일/기능}

### PASS
- [PASS] discover/page.tsx:170 — 카드 스프링 물리학 올바른 cubic-bezier 사용

### FAIL
- [FAIL] component.tsx:45 — 텍스트 색상 #FFFFFF 직접 사용 (DESIGN.md: --text-primary #F5F0EB)
  수정: `color: "var(--text-primary)"`

### WARN
- [WARN] component.tsx:80 — 터치 타겟 36x36px (최소 44x44px 미달)
  수정: `className="w-11 h-11"`
```
