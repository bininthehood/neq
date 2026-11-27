/**
 * Reanimated × DynamicColorIOS 정적 가드 (Night Pool 0단계 스파이크 결과).
 *
 * `colors.*`(iOS DynamicColorIOS) 가 `<Animated.*>` 의 style 로 들어가면 Reanimated 4.1.7 이
 * 크래시("Invalid color value")하고, useAnimatedStyle 반환이면 조용히 안 그려진다.
 * → <Animated.*> 의 style/contentContainerStyle 에 직접 쓴 `colors.*` 와, 거기서 참조하는
 *   `styles.X` StyleSheet 키 안의 `colors.*` 를 찾아 실패시킨다. 해결: useThemeColors() hex 를 inline.
 *
 * ponytail: 정규식 기반 — 변수로 빼서 넘긴 스타일·worklet 내부 참조는 못 잡는다.
 * 그쪽은 라이트·다크 스크린샷 E2E(D8 ②)가 잡는다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

/** s[i] === '{' → 짝 '}' 위치 */
function closing(s: string, i: number): number {
  let d = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') d++;
    else if (s[j] === '}' && --d === 0) return j;
  }
  return s.length;
}

function styleBlock(s: string, name: string): string {
  const m = new RegExp(`\\n  ${name}: \\{`).exec(s);
  if (!m) return '';
  const i = s.indexOf('{', m.index);
  return s.slice(i, closing(s, i) + 1);
}

function violations(file: string): string[] {
  const s = readFileSync(file, 'utf8');
  if (!s.includes('react-native-reanimated')) return [];
  const out: string[] = [];
  for (const tag of s.matchAll(/<Animated\.[A-Za-z]+/g)) {
    const start = tag.index! + tag[0].length;
    const tagEnd = s.indexOf('<', start); // 다음 JSX 태그 전까지가 이 태그의 속성
    let attrs = '';
    const re = /(style|contentContainerStyle)=\{/g;
    re.lastIndex = start;
    for (let m = re.exec(s); m && (tagEnd === -1 || m.index < tagEnd); m = re.exec(s)) {
      const end = closing(s, m.index + m[0].length - 1);
      attrs += s.slice(m.index, end);
      re.lastIndex = end;
    }
    const found = [...attrs.matchAll(/colors\.\w+/g)].map((m) => m[0]);
    for (const [, name] of attrs.matchAll(/styles\.(\w+)/g)) {
      found.push(...[...styleBlock(s, name).matchAll(/colors\.\w+/g)].map((m) => `styles.${name}→${m[0]}`));
    }
    if (found.length) {
      const line = s.slice(0, tag.index).split('\n').length;
      out.push(`${relative(ROOT, file)}:${line} ${tag[0]} ${found.join(', ')}`);
    }
  }
  return out;
}

describe('Animated.* 에 동적 colors.* 금지', () => {
  it('app·components·contexts 전체', () => {
    const files = ['app', 'components', 'contexts'].flatMap((d) => walk(join(ROOT, d)));
    expect(files.length).toBeGreaterThan(10);
    expect(files.flatMap(violations)).toEqual([]);
  });
});
