/**
 * 익명 디바이스 ID — 계정 없이도 사용자를 식별하기 위한 영구 UUID.
 * 나중에 백엔드 계정이 생기면 이 ID를 user_id에 연결하여 기존 데이터를 유지한다.
 */

const DEVICE_ID_KEY = "neq_device_id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
