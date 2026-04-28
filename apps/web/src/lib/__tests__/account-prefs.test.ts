/**
 * account-prefs.ts 단위 테스트
 *
 * - 기본값 반환 (LocalStorage 비어있을 때)
 * - 라운드트립 (set → get)
 * - 부분 업데이트 (updateAccountPrefs / updateNotificationPrefs)
 * - convenience setters (setTasteGenres / setSubscribedOtt / setPushSubscription)
 * - JSON parse 실패 fallback
 * - 누락 필드 forward-compat
 */
import { describe, it, expect, beforeEach } from "vitest";

async function loadModule() {
  return await import("../account-prefs");
}

beforeEach(() => {
  localStorage.clear();
});

describe("getAccountPrefs (default)", () => {
  it("LocalStorage 비어있으면 default 반환", async () => {
    const m = await loadModule();
    const prefs = m.getAccountPrefs();
    expect(prefs.tasteGenres).toEqual([]);
    expect(prefs.subscribedOtt).toEqual([]);
    expect(prefs.notificationPrefs.weeklyRec).toBe(false);
    expect(prefs.notificationPrefs.newRelease).toBe(false);
    expect(prefs.notificationPrefs.ottExpiry).toBe(false);
    expect(prefs.notificationPrefs.monthlyReport).toBe(false);
    expect(prefs.notificationPrefs.pushSubscription).toBeNull();
  });

  it("default 함수가 매번 새 객체를 반환한다 (참조 공유 X)", async () => {
    const m = await loadModule();
    const a = m.defaultAccountPrefs();
    const b = m.defaultAccountPrefs();
    expect(a).not.toBe(b);
    expect(a.notificationPrefs).not.toBe(b.notificationPrefs);
    a.tasteGenres.push("thriller");
    expect(b.tasteGenres).toEqual([]);
  });
});

describe("setAccountPrefs / getAccountPrefs 라운드트립", () => {
  it("저장한 값을 그대로 복원한다", async () => {
    const m = await loadModule();
    const input = {
      tasteGenres: ["thriller", "documentary"],
      subscribedOtt: [8, 337],
      notificationPrefs: {
        weeklyRec: true,
        newRelease: false,
        ottExpiry: true,
        monthlyReport: false,
        pushSubscription: {
          endpoint: "https://example.com/push/abc",
          keys: { p256dh: "p1", auth: "a1" },
        },
      },
    };
    m.setAccountPrefs(input);
    const got = m.getAccountPrefs();
    expect(got).toEqual(input);
  });
});

describe("updateAccountPrefs (부분 업데이트)", () => {
  it("이전 값 보존하며 일부만 갱신한다", async () => {
    const m = await loadModule();
    m.setAccountPrefs({
      tasteGenres: ["thriller"],
      subscribedOtt: [8],
      notificationPrefs: {
        weeklyRec: true,
        newRelease: false,
        ottExpiry: false,
        monthlyReport: false,
        pushSubscription: null,
      },
    });

    m.updateAccountPrefs((prev) => ({
      ...prev,
      tasteGenres: [...prev.tasteGenres, "drama"],
    }));

    const got = m.getAccountPrefs();
    expect(got.tasteGenres).toEqual(["thriller", "drama"]);
    expect(got.subscribedOtt).toEqual([8]);
    expect(got.notificationPrefs.weeklyRec).toBe(true);
  });
});

describe("updateNotificationPrefs", () => {
  it("notificationPrefs 만 갱신하고 다른 필드는 보존한다", async () => {
    const m = await loadModule();
    m.setAccountPrefs({
      tasteGenres: ["thriller"],
      subscribedOtt: [8, 337],
      notificationPrefs: m.defaultNotificationPrefs(),
    });

    m.updateNotificationPrefs((prev) => ({
      ...prev,
      weeklyRec: true,
      monthlyReport: true,
    }));

    const got = m.getAccountPrefs();
    expect(got.notificationPrefs.weeklyRec).toBe(true);
    expect(got.notificationPrefs.monthlyReport).toBe(true);
    expect(got.notificationPrefs.newRelease).toBe(false);
    expect(got.tasteGenres).toEqual(["thriller"]);
    expect(got.subscribedOtt).toEqual([8, 337]);
  });
});

describe("convenience setters", () => {
  it("setTasteGenres 가 다른 필드를 보존한다", async () => {
    const m = await loadModule();
    m.setSubscribedOtt([8, 337]);
    m.setTasteGenres(["thriller", "drama"]);

    const got = m.getAccountPrefs();
    expect(got.tasteGenres).toEqual(["thriller", "drama"]);
    expect(got.subscribedOtt).toEqual([8, 337]);
  });

  it("setSubscribedOtt 가 다른 필드를 보존한다", async () => {
    const m = await loadModule();
    m.setTasteGenres(["thriller"]);
    m.setSubscribedOtt([8, 337, 356]);

    const got = m.getAccountPrefs();
    expect(got.tasteGenres).toEqual(["thriller"]);
    expect(got.subscribedOtt).toEqual([8, 337, 356]);
  });

  it("setPushSubscription 이 notificationPrefs 만 갱신한다", async () => {
    const m = await loadModule();
    m.setTasteGenres(["thriller"]);
    m.setPushSubscription({
      endpoint: "https://fcm.googleapis.com/abc",
      keys: { p256dh: "P", auth: "A" },
    });

    const got = m.getAccountPrefs();
    expect(got.notificationPrefs.pushSubscription).toEqual({
      endpoint: "https://fcm.googleapis.com/abc",
      keys: { p256dh: "P", auth: "A" },
    });
    expect(got.tasteGenres).toEqual(["thriller"]);
    expect(got.notificationPrefs.weeklyRec).toBe(false);
  });

  it("setPushSubscription(null) 로 구독 해제 가능", async () => {
    const m = await loadModule();
    m.setPushSubscription({
      endpoint: "x",
      keys: { p256dh: "P", auth: "A" },
    });
    m.setPushSubscription(null);
    expect(m.getAccountPrefs().notificationPrefs.pushSubscription).toBeNull();
  });
});

describe("JSON parse 실패 fallback", () => {
  it("LocalStorage 에 유효하지 않은 JSON 이 있으면 default 반환", async () => {
    localStorage.setItem("neq_account_prefs", "{not json{{");
    const m = await loadModule();
    const got = m.getAccountPrefs();
    expect(got).toEqual(m.defaultAccountPrefs());
  });

  it("배열 / 잘못된 타입은 default 반환", async () => {
    localStorage.setItem("neq_account_prefs", JSON.stringify(["a", "b"]));
    const m = await loadModule();
    const got = m.getAccountPrefs();
    // 배열도 typeof === "object" 이므로 spread 됨 → 필드 정합성으로 default 채워짐
    expect(got.tasteGenres).toEqual([]);
    expect(got.subscribedOtt).toEqual([]);
    expect(got.notificationPrefs).toEqual(m.defaultNotificationPrefs());
  });
});

describe("누락 필드 forward-compat", () => {
  it("notificationPrefs 가 없는 옛날 데이터도 default 로 보강된다", async () => {
    localStorage.setItem(
      "neq_account_prefs",
      JSON.stringify({
        tasteGenres: ["thriller"],
        subscribedOtt: [8],
        // notificationPrefs 누락
      }),
    );
    const m = await loadModule();
    const got = m.getAccountPrefs();
    expect(got.tasteGenres).toEqual(["thriller"]);
    expect(got.subscribedOtt).toEqual([8]);
    expect(got.notificationPrefs).toEqual(m.defaultNotificationPrefs());
  });

  it("notificationPrefs 일부 누락 필드도 false 로 채워진다", async () => {
    localStorage.setItem(
      "neq_account_prefs",
      JSON.stringify({
        tasteGenres: [],
        subscribedOtt: [],
        notificationPrefs: { weeklyRec: true }, // 다른 필드 누락
      }),
    );
    const m = await loadModule();
    const got = m.getAccountPrefs();
    expect(got.notificationPrefs.weeklyRec).toBe(true);
    expect(got.notificationPrefs.newRelease).toBe(false);
    expect(got.notificationPrefs.ottExpiry).toBe(false);
    expect(got.notificationPrefs.monthlyReport).toBe(false);
    expect(got.notificationPrefs.pushSubscription).toBeNull();
  });

  it("이상한 타입 필드는 default 로 fallback", async () => {
    localStorage.setItem(
      "neq_account_prefs",
      JSON.stringify({
        tasteGenres: [1, 2, "valid", null],         // 숫자/null 섞여있음 → string만 살아남음
        subscribedOtt: ["x", 8, "y", 337],          // string 섞여있음 → number만
        notificationPrefs: { weeklyRec: "yes" },    // boolean 아님 → false
      }),
    );
    const m = await loadModule();
    const got = m.getAccountPrefs();
    expect(got.tasteGenres).toEqual(["valid"]);
    expect(got.subscribedOtt).toEqual([8, 337]);
    expect(got.notificationPrefs.weeklyRec).toBe(false);
  });
});

describe("clearAccountPrefs", () => {
  it("저장된 값을 제거하면 다시 default 반환", async () => {
    const m = await loadModule();
    m.setTasteGenres(["thriller"]);
    expect(m.getAccountPrefs().tasteGenres).toEqual(["thriller"]);
    m.clearAccountPrefs();
    expect(m.getAccountPrefs()).toEqual(m.defaultAccountPrefs());
  });
});
