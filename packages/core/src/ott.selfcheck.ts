/**
 * ott.ts scheme-first/web-fallback 분기 self-check.
 * 실행: npx tsx packages/core/src/ott.selfcheck.ts
 * 프레임워크 없음 — assert 만. getOTTOpenCandidates 순서 불변식 검증.
 */
import assert from 'node:assert';
import { getOTTOpenCandidates, getOTTAppScheme } from './ott';

// scheme 보유 provider: 첫 후보가 app(scheme), 마지막이 web 이어야 함
const watcha = getOTTOpenCandidates('Watcha', '오징어 게임');
assert.equal(watcha[0].via, 'app', 'Watcha 첫 후보는 app scheme');
assert.ok(watcha[0].url.startsWith('watcha://'), 'Watcha app 후보는 watcha:// scheme');
assert.equal(watcha[watcha.length - 1].via, 'web', 'Watcha 마지막 후보는 web');
assert.ok(
  watcha[watcha.length - 1].url.startsWith('https://'),
  'web fallback 은 https — canOpenURL 항상 성공 (회귀 0)',
);

// scheme 미보유 provider (Netflix): app 후보 없이 web 만 → 기존 웹 열기 동작 보존
const netflix = getOTTOpenCandidates('Netflix', '오징어 게임');
assert.ok(
  netflix.every((c) => c.via === 'web'),
  'Netflix 는 scheme 없음 → web 후보만 (회귀 0)',
);
assert.equal(getOTTAppScheme('Netflix', 'x'), null, 'scheme 없는 provider 는 null');

// 미등록 provider: 빈 배열
assert.deepEqual(getOTTOpenCandidates('없는OTT', 'x'), [], '미등록 provider 는 빈 배열');

// 인코딩: scheme/web 모두 title 을 URL-encode
assert.ok(watcha[0].url.includes(encodeURIComponent('오징어 게임')), 'title URL 인코딩');

console.log('ott.selfcheck OK');
