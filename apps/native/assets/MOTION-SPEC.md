# neq, — Motion &amp; Asset Spec

**Identity:** Dramatic comma · single source for icon · loading · wordmark
**Palette:** wordmark/comma `#C4A35A` · iOS bg `#12110E` · Android bg `#0a0a0a`
**Final wordmark:** `assets/neq-wordmark-final.svg` (vector) / `assets/neq-wordmark-final-2x.png` (692×306)

---

## Asset manifest

| File | Use |
|------|-----|
| `assets/neq-wordmark-final.svg` | Production wordmark, any scale |
| `assets/neq-wordmark-final-2x.png` | 692×306 raster (2× of reference) |
| `assets/neq-comma-dramatic.svg` | Standalone comma — icon / loading / absorption |
| `assets/neq-comma-dramatic.png` | 220×392 transparent raster of comma |
| `assets/neq-word-clean.png` | 692×306 "neq" only (no comma) — absorption layer |
| `assets/icons/ios-{1024,512,180,120,60}.png` | iOS app icon set (comma on #12110E) |
| `assets/icons/android-foreground-1024.png` | Android adaptive foreground (transparent comma) |
| `assets/icons/android-background-1024.png` | Android adaptive background (#0a0a0a) |
| `assets/icons/favicon-32.png` | favicon |
| `assets/neq-absorption.lottie.json` | Absorption animation (bodymovin v5, 60fps, 72f = 1.2s) |

---

## Comma geometry (vector)

Standalone comma path (viewBox `0 0 60 132`), single fill `#C4A35A`, no holes:

```
M40 24 C55 24 62 38 58 55 C53 80 36 98 12 118
C28 96 36 82 33 68 C19 71 9 57 13 42 C17 29 28 22 40 24 Z
```

- Bounding box (path space): x 9–62, y 22–118 → w 53, h 96
- Ball terminal top, long dramatic tail descending left.
- In the wordmark it is placed at `translate(282,45) scale(0.844)` within the 346×153 lockup → occupies x≈289.6–334.3, y≈63.6–144.6.

---

## App icon — placement

- Comma height = **64%** of canvas; **optically centered** with **−3% vertical lift** (ball-heavy mass sits low otherwise).
- iOS: full-bleed `#12110E`, no mask.
- Android adaptive: foreground = comma (transparent), background = `#0a0a0a`; keep comma inside center 66% safe area (system circle/squircle crop).
- Min legible verified at 24×24.

---

## Deliverable 02 — Absorption (one-shot, ~1200ms)

Splash → onboarding intro. The tapped icon (comma) "stays", then resolves into the wordmark. **No morph step** — icon comma == wordmark comma (Dramatic).

Comp **300×133**, 60fps, total **72 frames**.

### Comma layer (`assets/neq-comma-dramatic.png`, anchor center)

| Time | Frame | Position (center) | Scale | Easing |
|------|-------|-------------------|-------|--------|
| 0ms | 0 | (151.9, 69.3) | 36.2% | hold |
| ~117ms | 7 | (151.9, 69.3) | 37.3% | breath peak (102%) |
| 250ms | 15 | (151.9, 69.3) | 36.2% | breath return |
| 800ms | 48 | (267.9, 97.3) | 22.3% | cinematic ease-in-out (mass) |
| ~833ms | 50 | (267.9, 97.3) | 21.1% | dip (overshoot down) |
| 1000ms | 60 | (267.9, 97.3) | 21.3% | lock-in |
| 1200ms | 72 | rest | 21.3% | hold |

- Travel + scale-down run together 250→800ms with `cubic-bezier(0.42,0,0.2,1)` — not linear, not bouncy.
- Tiny overshoot 101%→100% at 800–1000ms so it "locks", not slides past.

### "neq" letters layer (`assets/neq-word-clean.png`, anchor center, scale 43.35%)

| Time | Frame | Opacity | x-offset | Note |
|------|-------|---------|----------|------|
| 0–400ms | 0–20 | 0 | −12px | absent; comma owns the stage |
| 400ms | 20 | 0→ | −12px | begins, "called into existence" |
| 1000ms | 50 | 100 | 0 | locked |

- **Stagger (production refinement):** split into n / e / q sublayers, each opacity+slide offset **80ms** apart (n @400, e @480, q @560). The shipped Lottie uses a single grouped `neq` fade+slide; split per-letter in After Effects/Reanimated for the staggered read.
- Letters arrive **at** their locked positions — they do not race the comma.

---

## Deliverable 03 — Loading loop (~2000ms, looping)

Standalone comma only. Breathing, **not a spinner**.

| Time | Scale | Opacity |
|------|-------|---------|
| 0ms | 100% | 100% |
| 1000ms | 103% | 85% |
| 2000ms | 100% | 100% |

- Easing: sinusoidal (`ease-in-out`), no hard transitions. Loop seamless.
- Reduced-motion: static comma at 100% (no animation).

---

## Color application

| Variant | Mark | Background |
|---------|------|-----------|
| Primary | `#C4A35A` | `#12110E` (dark) |
| Inverted | `#12110E` (ink) | `#C4A35A` (accent) |
| Mono | `#FFFFFF` | `#C4A35A` (accent) |

Mark itself is always flat single color — no gradient, no filter, no 3D.

---

## Reduced motion

All animations gate behind `prefers-reduced-motion`. Absorption → show final wordmark immediately. Loading → static comma. Mark visibility never depends on an animation completing.

---

## Notes for the Lottie

`assets/neq-absorption.lottie.json` is a **valid bodymovin v5** starting point with two embedded image layers (comma + neq) and the keyframes above. Verify slot alignment in your editor (Lottie/AE) and split `neq` into 3 letter sublayers for the 80ms stagger before final export.
