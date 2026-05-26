import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  issueToken,
  verifyToken,
  TOKEN_TTL_MS,
} from '../_lib/session-token';

const ORIGINAL_SECRET = process.env.TASTE_SURVEY_TOKEN_SECRET;

beforeEach(() => {
  // 32+ byte secret (HMAC-SHA256 권장 길이)
  process.env.TASTE_SURVEY_TOKEN_SECRET =
    'a'.repeat(64); // hex 64자 = 32 byte
});

afterAll(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.TASTE_SURVEY_TOKEN_SECRET;
  } else {
    process.env.TASTE_SURVEY_TOKEN_SECRET = ORIGINAL_SECRET;
  }
});

describe('issueToken', () => {
  it('payload.signature 형식 반환', () => {
    const token = issueToken('device-abc');
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it('deviceId 가 비면 throw', () => {
    expect(() => issueToken('')).toThrow();
    // @ts-expect-error invalid deviceId
    expect(() => issueToken(null)).toThrow();
  });

  it('TASTE_SURVEY_TOKEN_SECRET 없거나 32자 미만이면 throw', () => {
    delete process.env.TASTE_SURVEY_TOKEN_SECRET;
    expect(() => issueToken('device-abc')).toThrow(
      /TASTE_SURVEY_TOKEN_SECRET/,
    );

    process.env.TASTE_SURVEY_TOKEN_SECRET = 'short';
    expect(() => issueToken('device-abc')).toThrow(/32 chars/);
  });
});

describe('verifyToken', () => {
  it('happy path — issue 직후 verify 성공', () => {
    const now = 1_700_000_000_000;
    const token = issueToken('device-abc', now);
    const result = verifyToken(token, 'device-abc', now);
    expect(result.valid).toBe(true);
    expect(result.payload?.deviceId).toBe('device-abc');
    expect(result.payload?.issuedAt).toBe(now);
    expect(result.error).toBeUndefined();
  });

  it('malformed token (no dot) → malformed', () => {
    expect(verifyToken('not-a-valid-token', 'device-abc').error).toBe(
      'malformed',
    );
    expect(verifyToken('', 'device-abc').error).toBe('malformed');
    expect(verifyToken('a.', 'device-abc').error).toBe('malformed');
  });

  it('signature tampered → invalid_signature', () => {
    const token = issueToken('device-abc');
    const [payload] = token.split('.');
    const tampered = `${payload}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    expect(verifyToken(tampered, 'device-abc').error).toBe('invalid_signature');
  });

  it('payload tampered → invalid_signature (sig 재계산 불일치)', () => {
    const token = issueToken('device-abc');
    const [, sig] = token.split('.');
    // 다른 payload + 기존 signature 조합
    const fakePayload = Buffer.from(
      JSON.stringify({ deviceId: 'evil-device', issuedAt: Date.now() }),
      'utf8',
    )
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const tampered = `${fakePayload}.${sig}`;
    expect(verifyToken(tampered, 'evil-device').error).toBe(
      'invalid_signature',
    );
  });

  it('TTL 만료 → expired', () => {
    const issuedAt = 1_700_000_000_000;
    const token = issueToken('device-abc', issuedAt);
    const expired = issuedAt + TOKEN_TTL_MS + 1;
    const result = verifyToken(token, 'device-abc', expired);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('expired');
    expect(result.payload?.deviceId).toBe('device-abc'); // payload 는 노출
  });

  it('TTL boundary — 30분 정확히 = valid', () => {
    const issuedAt = 1_700_000_000_000;
    const token = issueToken('device-abc', issuedAt);
    const result = verifyToken(
      token,
      'device-abc',
      issuedAt + TOKEN_TTL_MS,
    );
    expect(result.valid).toBe(true);
  });

  it('deviceId 불일치 → device_mismatch', () => {
    const token = issueToken('device-abc');
    const result = verifyToken(token, 'device-xyz');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('device_mismatch');
  });

  it('secret 변경 후 verify 시 invalid_signature', () => {
    const token = issueToken('device-abc');
    process.env.TASTE_SURVEY_TOKEN_SECRET = 'b'.repeat(64);
    expect(verifyToken(token, 'device-abc').error).toBe('invalid_signature');
  });
});
