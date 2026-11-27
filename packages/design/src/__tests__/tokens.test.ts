/**
 * Night Pool 토큰 계약 (계획 D6).
 *  ① tokens.ts palette ↔ tokens.css 다크(:root)·라이트(prefers-color-scheme: light) 값 일치
 *  ② 정해진 글자·배경 쌍 대비 (WCAG 2.x 상대 휘도)
 *  ③ 삭제된 accent 계열이 ts·css 어디에도 없음
 * 실행: apps/web vitest 가 include 로 이 파일을 잡는다 (packages/design 에는 러너 없음).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { palette, colors } from '../tokens';

const css = readFileSync(join(__dirname, '..', 'tokens.css'), 'utf8');
const ts = readFileSync(join(__dirname, '..', 'tokens.ts'), 'utf8');

// palette 키 → CSS 변수명. overlay 만 웹 관례상 `--bg-overlay-*`.
const cssVar = (key: string) => {
  const kebab = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  return kebab.startsWith('overlay') ? `--bg-${kebab}` : `--${kebab}`;
};

const lightStart = css.indexOf('@media (prefers-color-scheme: light)');
const darkBlock = css.slice(0, lightStart);
const lightBlock = css.slice(lightStart, css.indexOf('\n}\n', lightStart));

const readVar = (block: string, name: string) =>
  block.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
const norm = (v: string | undefined) => v?.replace(/\s+/g, '').toLowerCase();

describe('tokens.ts ↔ tokens.css', () => {
  it('light 블록이 존재한다', () => {
    expect(lightStart).toBeGreaterThan(0);
  });

  for (const theme of ['dark', 'light'] as const) {
    const block = theme === 'dark' ? darkBlock : lightBlock;
    it(`${theme}: 모든 palette 키가 같은 값의 CSS 변수로 있다`, () => {
      for (const [key, value] of Object.entries(palette[theme])) {
        expect(norm(readVar(block, cssVar(key))), `${theme} ${cssVar(key)}`).toBe(norm(value));
      }
    });
  }

  it('dark·light 키 집합이 같다', () => {
    expect(Object.keys(palette.light).sort()).toEqual(Object.keys(palette.dark).sort());
  });

  it('하위 호환 colors 는 dark 값과 같다', () => {
    for (const [key, value] of Object.entries(palette.dark)) {
      expect((colors as Record<string, string>)[key]).toBe(value);
    }
  });
});

// ── 대비 ────────────────────────────────────────────
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// rgba(r,g,b,a) 를 불투명 hex 바탕 위에 합성한 hex
const over = (rgba: string, base: string) => {
  const [r, g, b, a] = rgba.match(/[\d.]+/g)!.map(Number);
  const hex = [r, g, b]
    .map((c, i) => Math.round(c * a + parseInt(base.slice(1 + i * 2, 3 + i * 2), 16) * (1 - a)))
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('');
  return `#${hex}`;
};

describe('대비', () => {
  it('계산기 자체 검사: 흑백 21:1', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  for (const theme of ['dark', 'light'] as const) {
    const p = palette[theme];
    it(`${theme}: 본문 글자 ≥ 4.5, muted ≥ 3.0`, () => {
      expect(contrast(p.textPrimary, p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.textSecondary, p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.textMuted, p.bg)).toBeGreaterThanOrEqual(3.0);
    });
    it(`${theme}: lime 채움 위 textInverse ≥ 4.5`, () => {
      expect(contrast(p.textInverse, p.lime)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${theme}: 글자용 limeText·aquaText·danger ≥ 4.5`, () => {
      expect(contrast(p.limeText, p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.aquaText, p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.danger, p.bg)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${theme}: 작은 보조 글자 textMeta ≥ 4.5 (bg·surface·raised)`, () => {
      expect(contrast(p.textMeta, p.surfaceRaised)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.textMeta, p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.textMeta, p.surface)).toBeGreaterThanOrEqual(4.5);
    });
  }

  // 3단계 라이트 전용 규칙 (계획 3단계 · DESIGN.md 라이트 표)
  describe('light 전용', () => {
    const p = palette.light;
    const surfaces = { bg: p.bg, surface: p.surface, surfaceRaised: p.surfaceRaised };
    for (const [name, bg] of Object.entries(surfaces)) {
      it(`본문 textPrimary·textSecondary·textMeta on ${name} ≥ 4.5`, () => {
        expect(contrast(p.textPrimary, bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.textSecondary, bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.textMeta, bg)).toBeGreaterThanOrEqual(4.5);
      });
      it(`큰 글자·힌트 textMuted on ${name} ≥ 3.0`, () => {
        expect(contrast(p.textMuted, bg)).toBeGreaterThanOrEqual(3.0);
      });
    }
    it('라임은 글자로 못 쓴다(bg 대비 < 3) → 테두리·글자는 limeText(≥ 3.0 UI, ≥ 4.5 글자)', () => {
      expect(contrast(p.lime, p.bg)).toBeLessThan(3.0);
      expect(contrast(p.limeText, p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.limeText, p.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.limeText, p.surfaceRaised)).toBeGreaterThanOrEqual(3.0);
    });
    it('aquaText 링크·현재 탭 on bg·surface·raised, 옅은 아쿠아 면(aquaDim) 위 ≥ 4.5', () => {
      expect(contrast(p.aquaText, p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.aquaText, p.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.aquaText, p.surfaceRaised)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.aquaText, over(p.aquaDim, p.bg))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.aquaText, over(p.aquaDim, p.surface))).toBeGreaterThanOrEqual(4.5);
    });
    it('워드마크는 DESIGN.md 결정값 (#58DCCB / #007B72)', () => {
      expect(palette.dark.wordmark).toBe('#58DCCB');
      expect(p.wordmark).toBe('#007B72');
    });
  });
});

describe('accent 삭제 (D5)', () => {
  it('tokens.ts 에 accent 키가 없다', () => {
    expect(Object.keys(colors).some((k) => /accent/i.test(k))).toBe(false);
    expect(ts).not.toMatch(/\baccent\w*\s*:/);
  });
  it('tokens.css 에 --accent 변수가 없다', () => {
    expect(css).not.toMatch(/--accent/);
  });
});
