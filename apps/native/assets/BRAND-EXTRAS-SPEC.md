# neq, — Splash / OG / Loading 스펙 (외부 의뢰 3건)

확정 자산 기반 · #C4A35A on #12110E · Warm Vignette 톤

## A · Splash (확정: Warm Vignette)
- 배경: `radial-gradient(120% 90% at 50% 38%, #1c1813, #12110E 56%, #0c0b09)` + amber glow + 5% film grain
- 워드마크: `neq-wordmark-final.svg` 중앙, 폭 ~56–62%
- export: `assets/exports/splash-1170x2532.png` (+ 1284×2778 / 1080×2340 동일 비율 재렌더)
- 정적 런치스크린의 콤마 위치를 흡수 0ms 프레임과 일치 → 이음매 없는 진입

## B · OG image
- `assets/exports/og-1200x630.png` (1.91:1 · 링크 프리뷰) — 좌측 워드마크 + 카피, 우측 콤마 모티프
- `assets/exports/og-1200x1200.png` (1:1 · IG/범용) — 중앙 정렬 + neq.me
- 카피: **"당신의 취향을 발견하세요"** / 보조 **"알고리즘 밖의 OTT 작품을 발견하세요"**
- meta: og:image(+width/height), twitter:card=summary_large_image

## C · Loading (확정: C2 Aperture Breath)
렌즈 조리개 호흡 — 동심원 3겹 + 중앙 빛점. 콤마/스피너 없음.

| 요소 | 애니메이션 | 타이밍 |
|------|-----------|--------|
| ring r1 (38%) | scale 0.92→1.04→0.92, opacity .5→1→.5 | 2.4s ease-in-out loop |
| ring r2 (56%) | 동일, delay 0.18s, opacity 상한 .3 | |
| ring r3 (74%) | 동일, delay 0.36s, opacity 상한 .16 | |
| center dot | opacity .55→1→.55, glow blur 14px | 2.4s |

- easing: `--ease-soft` (sinusoidal 근사), 무한 루프, seamless
- 색: 링 `rgba(196,163,90, .16~.5)`, dot `#C4A35A`
- 컨텍스트: 검색 / 범용 대기 (기본). 메시지 예: "취향을 살펴보는 중"
- reduced-motion: 정지 (링 1.0 / opacity 고정)
- Lottie/Reanimated: 3 ring 레이어 scale+opacity 키프레임 + dot opacity. 8KB 미만.

## 비주얼 언어 일관성
A·B·C 모두 단일 amber + 영화의 빛(glow/iris/projector) + Quiet Ink 여백. anti-slop 준수(네온·그라디언트 버튼·이모지·스피너 없음).
