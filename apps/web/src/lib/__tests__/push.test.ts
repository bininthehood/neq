/**
 * push.ts 단위 테스트
 *
 * - flag-off / no-vapid / unsupported / permission-denied / subscribe-failed
 * - 성공 path : pushManager.subscribe + fetch + setPushSubscription
 * - server-failed path : LocalStorage 유지, ok:true + reason:"server-failed"
 * - unsubscribe : sub.unsubscribe + setPushSubscription(null)
 * - getCurrentPushSubscription : 구독 없을 때 null
 *
 * env / global 모킹은 vi.stubEnv + vi.stubGlobal 사용.
 * 매 테스트마다 vi.resetModules() 로 push.ts 의 process.env 캡처를 다시 시킨다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// supabase 모듈 mock — push.ts 가 ensureAuth + supabase.auth.getSession 호출
// 실제 SupabaseClient 생성을 회피 (env URL 없이도 테스트 가능)
vi.mock("../supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-access-token" } },
      }),
    },
  },
  ensureAuth: vi.fn().mockResolvedValue(undefined),
}));

// ─── 헬퍼: VAPID 키 (urlBase64) ───
//   "test"(4 chars) → 'dGVzdA==' → urlBase64: 'dGVzdA' (padding 제거)
const TEST_VAPID = "dGVzdA";

// ─── 공용 mock 컨테이너 ───
let mockSubscribe = vi.fn();
let mockGetSubscription = vi.fn();
let mockUnsubscribe = vi.fn();
let mockNotificationRequestPermission = vi.fn();
let mockFetch = vi.fn();

function installNavigatorAndWindow(opts: {
  hasServiceWorker?: boolean;
  hasPushManager?: boolean;
  hasNotification?: boolean;
} = {}) {
  const {
    hasServiceWorker = true,
    hasPushManager = true,
    hasNotification = true,
  } = opts;

  // navigator.serviceWorker.ready → registration with pushManager
  const registration = {
    pushManager: {
      subscribe: mockSubscribe,
      getSubscription: mockGetSubscription,
    },
  };

  const navigatorMock: Record<string, unknown> = {};
  if (hasServiceWorker) {
    navigatorMock.serviceWorker = {
      ready: Promise.resolve(registration),
    };
  }
  vi.stubGlobal("navigator", navigatorMock);

  // window.PushManager + Notification — typeof check 통과시키기 위해
  // globalThis 에 직접 셋. (jsdom 의 window === globalThis)
  if (hasPushManager) {
    // @ts-expect-error 테스트 전용 셋
    globalThis.PushManager = function () {};
  } else {
    // @ts-expect-error 테스트 전용 삭제
    delete globalThis.PushManager;
  }

  if (hasNotification) {
    const NotificationStub = function () {} as unknown as typeof Notification;
    (NotificationStub as unknown as {
      requestPermission: typeof mockNotificationRequestPermission;
    }).requestPermission = mockNotificationRequestPermission;
    vi.stubGlobal("Notification", NotificationStub);
  } else {
    // @ts-expect-error 테스트 전용 삭제
    delete globalThis.Notification;
  }
}

beforeEach(() => {
  // 깨끗한 상태
  localStorage.clear();
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();

  // mock 재설정
  mockSubscribe = vi.fn();
  mockGetSubscription = vi.fn();
  mockUnsubscribe = vi.fn();
  mockNotificationRequestPermission = vi.fn();
  mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);

  // env.ts 가 top-level 에서 require 하는 server-only 변수 (테스트 stub)
  vi.stubEnv("TMDB_API_KEY", "test-tmdb-key");
  vi.stubEnv("OPENAI_API_KEY", "test-openai-key");

  // 기본: flag ON + VAPID 키 셋
  vi.stubEnv("NEXT_PUBLIC_NOTIFICATIONS_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", TEST_VAPID);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ─── flag / VAPID / 환경 검사 ───

describe("subscribePush — 사전 조건 실패", () => {
  it("NEXT_PUBLIC_NOTIFICATIONS_ENABLED=false 시 flag-off", async () => {
    vi.stubEnv("NEXT_PUBLIC_NOTIFICATIONS_ENABLED", "false");
    installNavigatorAndWindow();
    const { subscribePush } = await import("../push");

    const res = await subscribePush();
    expect(res).toEqual({ ok: false, reason: "flag-off" });
  });

  it("VAPID public key 가 비어있으면 no-vapid", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    installNavigatorAndWindow();
    const { subscribePush } = await import("../push");

    const res = await subscribePush();
    expect(res).toEqual({ ok: false, reason: "no-vapid" });
  });

  it("serviceWorker 미지원 시 unsupported", async () => {
    installNavigatorAndWindow({ hasServiceWorker: false });
    const { subscribePush } = await import("../push");

    const res = await subscribePush();
    expect(res).toEqual({ ok: false, reason: "unsupported" });
  });

  it("PushManager 미지원 시 unsupported", async () => {
    installNavigatorAndWindow({ hasPushManager: false });
    const { subscribePush } = await import("../push");

    const res = await subscribePush();
    expect(res).toEqual({ ok: false, reason: "unsupported" });
  });

  it("Notification 미지원 시 unsupported", async () => {
    installNavigatorAndWindow({ hasNotification: false });
    const { subscribePush } = await import("../push");

    const res = await subscribePush();
    expect(res).toEqual({ ok: false, reason: "unsupported" });
  });
});

// ─── 권한 거부 ───

describe("subscribePush — 권한 거부", () => {
  it("Notification.requestPermission='denied' 시 permission-denied", async () => {
    installNavigatorAndWindow();
    mockNotificationRequestPermission.mockResolvedValue("denied");

    const { subscribePush } = await import("../push");
    const res = await subscribePush();

    expect(res).toEqual({ ok: false, reason: "permission-denied" });
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it("requestPermission='default' 도 permission-denied", async () => {
    installNavigatorAndWindow();
    mockNotificationRequestPermission.mockResolvedValue("default");

    const { subscribePush } = await import("../push");
    const res = await subscribePush();

    expect(res).toEqual({ ok: false, reason: "permission-denied" });
  });
});

// ─── 성공 path ───

describe("subscribePush — 성공", () => {
  const fakeSubJson = {
    endpoint: "https://example.com/push/abc",
    expirationTime: null,
    keys: { p256dh: "p256dh-test", auth: "auth-test" },
  };

  function installSuccessfulSubscribe() {
    installNavigatorAndWindow();
    mockNotificationRequestPermission.mockResolvedValue("granted");
    mockSubscribe.mockResolvedValue({
      toJSON: () => fakeSubJson,
    });
  }

  it("정상 subscribe + 서버 동기화 성공 → ok:true", async () => {
    installSuccessfulSubscribe();
    mockFetch.mockResolvedValue({ ok: true });

    const { subscribePush } = await import("../push");
    const res = await subscribePush();

    expect(res.ok).toBe(true);
    expect(res.reason).toBeUndefined();
    expect(res.subscription).toEqual(fakeSubJson);

    // pushManager.subscribe 호출 검증 (userVisibleOnly + applicationServerKey)
    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    const call = mockSubscribe.mock.calls[0][0];
    expect(call.userVisibleOnly).toBe(true);
    expect(call.applicationServerKey).toBeInstanceOf(Uint8Array);

    // fetch /api/notifications/subscribe 호출 검증
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/notifications/subscribe");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ subscription: fakeSubJson });

    // LocalStorage 검증
    const { getAccountPrefs } = await import("../account-prefs");
    expect(getAccountPrefs().notificationPrefs.pushSubscription).toEqual(
      fakeSubJson,
    );
  });

  it("서버 응답 ok:false → ok:true + reason:server-failed (LocalStorage 유지)", async () => {
    installSuccessfulSubscribe();
    mockFetch.mockResolvedValue({ ok: false });

    const { subscribePush } = await import("../push");
    const res = await subscribePush();

    expect(res.ok).toBe(true);
    expect(res.reason).toBe("server-failed");
    expect(res.subscription).toEqual(fakeSubJson);

    const { getAccountPrefs } = await import("../account-prefs");
    expect(getAccountPrefs().notificationPrefs.pushSubscription).toEqual(
      fakeSubJson,
    );
  });

  it("fetch throw → ok:true + reason:server-failed (LocalStorage 유지)", async () => {
    installSuccessfulSubscribe();
    mockFetch.mockRejectedValue(new Error("network down"));

    const { subscribePush } = await import("../push");
    const res = await subscribePush();

    expect(res.ok).toBe(true);
    expect(res.reason).toBe("server-failed");

    const { getAccountPrefs } = await import("../account-prefs");
    expect(getAccountPrefs().notificationPrefs.pushSubscription).toEqual(
      fakeSubJson,
    );
  });

  it("pushManager.subscribe throw → subscribe-failed (LocalStorage 미변경)", async () => {
    installNavigatorAndWindow();
    mockNotificationRequestPermission.mockResolvedValue("granted");
    mockSubscribe.mockRejectedValue(new Error("subscribe blocked"));

    const { subscribePush } = await import("../push");
    const res = await subscribePush();

    expect(res).toEqual({ ok: false, reason: "subscribe-failed" });
    expect(mockFetch).not.toHaveBeenCalled();

    const { getAccountPrefs } = await import("../account-prefs");
    expect(getAccountPrefs().notificationPrefs.pushSubscription).toBeNull();
  });
});

// ─── unsubscribePush ───

describe("unsubscribePush", () => {
  it("기존 subscription 이 있으면 unsubscribe 호출 + LocalStorage null", async () => {
    installNavigatorAndWindow();
    mockGetSubscription.mockResolvedValue({ unsubscribe: mockUnsubscribe });
    mockUnsubscribe.mockResolvedValue(true);

    // 사전 셋: LocalStorage 에 구독이 있는 상태
    const { setPushSubscription } = await import("../account-prefs");
    setPushSubscription({
      endpoint: "https://example.com/x",
      keys: { p256dh: "a", auth: "b" },
    });

    const { unsubscribePush } = await import("../push");
    const ok = await unsubscribePush();

    expect(ok).toBe(true);
    expect(mockUnsubscribe).toHaveBeenCalled();

    const { getAccountPrefs } = await import("../account-prefs");
    expect(getAccountPrefs().notificationPrefs.pushSubscription).toBeNull();
  });

  it("subscription 이 없어도 LocalStorage 는 null 로 정리", async () => {
    installNavigatorAndWindow();
    mockGetSubscription.mockResolvedValue(null);

    const { setPushSubscription } = await import("../account-prefs");
    setPushSubscription({
      endpoint: "https://example.com/x",
      keys: { p256dh: "a", auth: "b" },
    });

    const { unsubscribePush } = await import("../push");
    const ok = await unsubscribePush();

    expect(ok).toBe(true);
    expect(mockUnsubscribe).not.toHaveBeenCalled();

    const { getAccountPrefs } = await import("../account-prefs");
    expect(getAccountPrefs().notificationPrefs.pushSubscription).toBeNull();
  });

  it("serviceWorker 미지원 시 false", async () => {
    installNavigatorAndWindow({ hasServiceWorker: false });

    const { unsubscribePush } = await import("../push");
    const ok = await unsubscribePush();
    expect(ok).toBe(false);
  });
});

// ─── getCurrentPushSubscription ───

describe("getCurrentPushSubscription", () => {
  it("구독 없을 때 null", async () => {
    installNavigatorAndWindow();
    mockGetSubscription.mockResolvedValue(null);

    const { getCurrentPushSubscription } = await import("../push");
    const res = await getCurrentPushSubscription();
    expect(res).toBeNull();
  });

  it("구독 있을 때 toJSON 결과 반환", async () => {
    installNavigatorAndWindow();
    const fake = {
      endpoint: "https://example.com/y",
      keys: { p256dh: "p", auth: "a" },
    };
    mockGetSubscription.mockResolvedValue({ toJSON: () => fake });

    const { getCurrentPushSubscription } = await import("../push");
    const res = await getCurrentPushSubscription();
    expect(res).toEqual(fake);
  });

  it("serviceWorker 미지원 시 null", async () => {
    installNavigatorAndWindow({ hasServiceWorker: false });

    const { getCurrentPushSubscription } = await import("../push");
    const res = await getCurrentPushSubscription();
    expect(res).toBeNull();
  });
});
