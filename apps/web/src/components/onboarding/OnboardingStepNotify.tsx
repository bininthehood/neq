"use client";

import { useState } from "react";
import { NOTIF_OPTIONS, type NotifOption } from "./data";
import { updateNotificationPrefs } from "@/lib/account-prefs";
import { subscribePush } from "@/lib/push";
import { isNotificationsEnabled } from "@/lib/env";
import { track } from "@/lib/analytics";

/**
 * Onboarding V2 — Step 5: Notify (웹).
 *
 * 4종 알림 토글 + Web Push 권한 요청.
 *  - 사용자가 1개 이상 켜고 "다음" 누르면 → Notification.requestPermission()
 *    granted 시 subscribePush() 로 Service Worker 구독
 *  - 거부되면 토글만 저장 (subscription null), 다음 단계 진행
 *  - flag 미활성 (`NEXT_PUBLIC_NOTIFICATIONS_ENABLED=false`) 이어도 토글은 저장됨.
 *    실제 Push 발송은 서버 cron 에서 flag/VAPID 게이트로 차단.
 *
 * 디자인 산출물 StepNotif 매핑 (iOS-style switch).
 *
 * Q4=A: native 는 별도 컴포넌트 (`apps/native/components/OnboardingStepNotify.tsx`)
 *      에서 "iOS 출시 후 활성화" 라벨 + 푸시 구독 발급 X 처리.
 */

interface Props {
  onNext: (opts?: { skipped?: boolean }) => void;
}

type Settings = Record<NotifOption["id"], boolean>;

function defaultSettings(): Settings {
  return Object.fromEntries(
    NOTIF_OPTIONS.map((n) => [n.id, n.defaultOn]),
  ) as Settings;
}

export default function OnboardingStepNotify({ onNext }: Props) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [submitting, setSubmitting] = useState(false);

  const toggle = (id: NotifOption["id"]) => {
    setSettings((s) => ({ ...s, [id]: !s[id] }));
  };

  const anyEnabled = Object.values(settings).some(Boolean);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);

    // 1. 4종 토글을 account_prefs.notificationPrefs 에 저장 (즉시)
    updateNotificationPrefs((prev) => ({
      ...prev,
      weeklyRec: settings.weeklyRec,
      newRelease: settings.newRelease,
      ottExpiry: settings.ottExpiry,
      monthlyReport: settings.monthlyReport,
    }));

    // 2. 1개 이상 켜져있고 flag ON 일 때만 push 구독 시도
    //    - 구독 실패해도 prefs 는 보존되어 추후 settings 에서 재시도 가능
    if (anyEnabled && isNotificationsEnabled()) {
      try {
        await subscribePush();
      } catch {
        // subscribePush 자체가 reason 으로 분기 — 여기 catch 는 안전망
      }
    } else if (!anyEnabled) {
      // 모두 OFF 인데 사용자가 진행한 경우 — 권한 요청 X
      track("notification_blocked", { timing: "onboarding-skip" });
    }

    setSubmitting(false);
    onNext();
  };

  // 보조 액션: 모든 토글 OFF + 권한 요청 skip + 다음 단계.
  // Notification.requestPermission() 호출 자체를 안 함 (사용자 의사 명시).
  const skipAllNotifications = () => {
    if (submitting) return;
    updateNotificationPrefs((prev) => ({
      ...prev,
      weeklyRec: false,
      newRelease: false,
      ottExpiry: false,
      monthlyReport: false,
    }));
    track("notification_blocked", { timing: "onboarding-skip-all" });
    onNext({ skipped: true });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-7 pt-6 shrink-0">
        <p
          className="font-display italic text-[26px] leading-[1.2] mb-2"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
        >
          어떤 알림을 받을까요?
        </p>
        <p className="text-sm" style={{ color: "var(--text-secondary)", lineHeight: 1.55 }}>
          나중에 설정에서 언제든 바꿀 수 있어요
        </p>
      </div>

      {/* 토글 리스트 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-7 pt-5 pb-4">
        <div className="flex flex-col">
          {NOTIF_OPTIONS.map((n) => {
            const on = settings[n.id];
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => toggle(n.id)}
                className="flex items-center gap-3 py-4 text-left"
                style={{
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div className="flex-1">
                  <div className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                    {n.title}
                  </div>
                  <div className="text-[11px] leading-[1.45]" style={{ color: "var(--text-muted)" }}>
                    {n.desc}
                  </div>
                </div>
                {/* iOS-style switch */}
                <div
                  role="switch"
                  aria-checked={on}
                  className="relative shrink-0"
                  style={{
                    width: 44,
                    height: 26,
                    borderRadius: 13,
                    background: on ? "var(--accent)" : "var(--border)",
                    transition: "background var(--duration-quick, 150ms) var(--ease-move, cubic-bezier(0.45, 0, 0.55, 1))",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 2,
                      left: on ? 20 : 2,
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      background: "#fff",
                      transition: "left var(--duration-quick, 150ms) var(--ease-spring, cubic-bezier(0.34, 1.3, 0.64, 1))",
                      boxShadow: "var(--shadow-sm)",
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {!isNotificationsEnabled() && (
          <p
            className="text-[11px] mt-4"
            style={{ color: "var(--text-muted)", lineHeight: 1.5 }}
          >
            ※ 알림 발송은 곧 시작해요. 지금 설정하면 시작 시점에 자동 적용돼요.
          </p>
        )}
      </div>

      {/* CTA */}
      <div className="px-6 pb-8 pt-3 shrink-0 flex flex-col gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="w-full py-4 text-base font-semibold rounded-lg transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
          style={{
            background: "var(--accent)",
            color: "var(--bg)",
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? "준비 중..." : "시작하기"}
        </button>
        <button
          type="button"
          onClick={skipAllNotifications}
          disabled={submitting}
          className="w-full py-3 text-sm transition-transform active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2 rounded-md"
          style={{ color: "var(--text-secondary)" }}
        >
          알림 받지 않기
        </button>
      </div>
    </div>
  );
}
