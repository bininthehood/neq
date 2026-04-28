import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();

// ─────────────────────────────────────────────
// Web Push (P0-4)
//
// 서버에서 보낸 payload(JSON)를 showNotification 으로 표시.
// notificationclick 시 payload.url 로 새 창/탭 오픈.
//
// SW 에서는 PostHog SDK 가 없으므로 notification_clicked 는
// 페이지 진입 시(`?via=push`) 페이지 측에서 track 한다.
// 스펙: _workspace/notification-triggers-detail.md §7.5
// ─────────────────────────────────────────────

interface NekoPushPayload {
  title?: string;
  body?: string;
  imageUrl?: string;
  url?: string;
  trackingId?: string;
  type?: string;
}

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;
  let payload: NekoPushPayload;
  try {
    payload = event.data.json() as NekoPushPayload;
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Neko", {
      body: payload.body ?? "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: {
        url: payload.url,
        trackingId: payload.trackingId,
        type: payload.type,
      },
      tag: payload.type, // 동일 type 알림은 누적 X (최신만 표시)
      // @ts-expect-error — image 는 일부 브라우저(Chromium)만 지원하는 비표준 필드
      image: payload.imageUrl,
      renotify: false,
    }),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const data = event.notification.data as
    | { url?: string; trackingId?: string; type?: string }
    | undefined;
  const url = data?.url ?? "/";
  event.waitUntil(self.clients.openWindow(url));
});
