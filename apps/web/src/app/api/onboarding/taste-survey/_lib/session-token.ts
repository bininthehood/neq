/**
 * Persona-creation-session token — HMAC stamped opaque token.
 *
 * 목적 (outside voice HIGH #1 반영): rate limit 차원을 "시간당 N 호출" 에서
 * "페르소나 생성 단위 N 호출" 로 변경. 한 페르소나 생성 = 1 token = 최대 N=8
 * 호출 허용 (step 1·2·[3] + summarize + 재시도 마진). token TTL 30분.
 *
 * Token = `${payloadB64url}.${signatureB64url}`
 *   payload = { deviceId, issuedAt }
 *   signature = HMAC-SHA256(payload, TASTE_SURVEY_TOKEN_SECRET)
 *
 * Verify: payload base64url decode → 재계산 signature timing-safe 비교 →
 * issuedAt + 30분 > now() 확인 → deviceId 매칭.
 *
 * 호출 카운트는 별도 (rate-limit.ts 에서 Redis token id 당 INCR).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const TOKEN_TTL_MS = 30 * 60 * 1000; // 30분
export const MAX_CALLS_PER_TOKEN = 8; // step 1·2·[3] + summarize + 재시도 마진 2x

export type TokenVerifyError =
  | 'malformed'
  | 'invalid_signature'
  | 'expired'
  | 'device_mismatch';

export interface TokenPayload {
  deviceId: string;
  issuedAt: number;
}

export interface TokenVerifyResult {
  valid: boolean;
  payload?: TokenPayload;
  error?: TokenVerifyError;
}

function getSecret(): Buffer {
  const secret = process.env.TASTE_SURVEY_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'TASTE_SURVEY_TOKEN_SECRET env var missing or too short (≥32 chars required)',
    );
  }
  return Buffer.from(secret, 'utf8');
}

function base64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(
    input.replace(/-/g, '+').replace(/_/g, '/') + pad,
    'base64',
  );
}

function sign(payload: string): string {
  const sig = createHmac('sha256', getSecret()).update(payload).digest();
  return base64url(sig);
}

/**
 * 신규 token 발급. deviceId 와 현재 시각을 stamp.
 */
export function issueToken(deviceId: string, now: number = Date.now()): string {
  if (!deviceId || typeof deviceId !== 'string') {
    throw new Error('deviceId required');
  }
  const payload: TokenPayload = { deviceId, issuedAt: now };
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const signature = sign(payloadB64);
  return `${payloadB64}.${signature}`;
}

/**
 * Token 검증. deviceId 매칭 + signature 검증 + TTL 확인.
 *
 * timing-safe signature 비교로 timing attack 차단.
 */
export function verifyToken(
  token: string,
  deviceId: string,
  now: number = Date.now(),
): TokenVerifyResult {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return { valid: false, error: 'malformed' };
  }
  const [payloadB64, providedSig] = token.split('.');
  if (!payloadB64 || !providedSig) {
    return { valid: false, error: 'malformed' };
  }

  // Signature 검증 (payload 위변조 차단)
  const expectedSig = sign(payloadB64);
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  const providedBuf = Buffer.from(providedSig, 'utf8');
  if (expectedBuf.length !== providedBuf.length) {
    return { valid: false, error: 'invalid_signature' };
  }
  if (!timingSafeEqual(expectedBuf, providedBuf)) {
    return { valid: false, error: 'invalid_signature' };
  }

  // Payload parse
  let payload: TokenPayload;
  try {
    const json = base64urlDecode(payloadB64).toString('utf8');
    const parsed = JSON.parse(json);
    if (
      !parsed ||
      typeof parsed.deviceId !== 'string' ||
      typeof parsed.issuedAt !== 'number'
    ) {
      return { valid: false, error: 'malformed' };
    }
    payload = parsed;
  } catch {
    return { valid: false, error: 'malformed' };
  }

  // TTL
  if (now - payload.issuedAt > TOKEN_TTL_MS) {
    return { valid: false, payload, error: 'expired' };
  }

  // Device 매칭 (token 도용 차단)
  if (payload.deviceId !== deviceId) {
    return { valid: false, payload, error: 'device_mismatch' };
  }

  return { valid: true, payload };
}
