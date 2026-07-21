"use client";

import { useEffect, useRef, useState } from "react";
import type { Recommendation } from "@/lib/types";
import { track } from "@/lib/analytics";
import { hasNotified, markNotified } from "@/lib/arrival-probe";

/**
 * ArrivalProbe (web) — 미서비스(KR provider 0) 상세의 입고 알림 프로브.
 *
 * 설계: james-vpn-instore-country-availability-design (Approach A, 계측 전용).
 *  - 타국(US/JP/GB) flatrate pill: 라이브 콜 1회, 3s 타임아웃 + abort. 실패/지연/0이면
 *    pill 없이 버튼만.
 *  - "한국에 들어오면 알려드릴게요" 버튼: 라이브 콜과 무관하게 즉시 노출. 탭 시 PostHog
 *    계측 + 로컬 저장. 실발송 없음. 재탭 dedup + 재진입 시 "알림 신청됨" 유지.
 *  - arrival_probe_shown: 조회 settle 시점 1회 (pill_shown 확정 후, 버튼은 이미 렌더됨).
 *
 * 부모(DetailBody)가 flag(isArrivalProbeEnabled) + providers.length===0 게이팅.
 * rec 당 remount 되도록 부모가 key={rec.tmdbId} 부여 → state/effect 자연 리셋.
 */

const FETCH_TIMEOUT_MS = 3000;

type ForeignCountry = { code: string; name: string };

export function ArrivalProbe({ rec }: { rec: Recommendation }) {
  const mediaType = rec.type === "movie" ? "movie" : "tv";
  const [countries, setCountries] = useState<ForeignCountry[]>([]);
  const [resolved, setResolved] = useState(false);
  const [notified, setNotified] = useState(false);
  const shownRef = useRef(false);

  // 재진입 시 로컬 저장된 "신청됨" 상태 복원.
  // setState 는 microtask 로 미뤄 react-hooks/set-state-in-effect 준수 (DetailBody 패턴).
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setNotified(hasNotified(rec.tmdbId, rec.type));
    });
    return () => {
      cancelled = true;
    };
  }, [rec.tmdbId, rec.type]);

  // 타국 가용성 라이브 콜 — 3s 타임아웃 + abort 체이닝 (Discover 스트림 타임아웃 전례).
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let cancelled = false;
    const url = `/api/tmdb/foreign-availability?work_id=${rec.tmdbId}&type=${
      rec.type === "movie" ? "movie" : "series"
    }`;

    fetch(url, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { countries?: ForeignCountry[] } | null) => {
        if (cancelled) return;
        setCountries(Array.isArray(data?.countries) ? data!.countries : []);
      })
      .catch(() => {
        // 실패/타임아웃 → pill 없이 버튼만
      })
      .finally(() => {
        if (!cancelled) setResolved(true);
      });

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [rec.tmdbId, rec.type]);

  // arrival_probe_shown — 조회 settle 후 1회 (pill_shown 확정 시점, 버튼 이미 렌더).
  useEffect(() => {
    if (!resolved || shownRef.current) return;
    shownRef.current = true;
    track("arrival_probe_shown", {
      tmdb_id: rec.tmdbId,
      media_type: mediaType,
      pill_shown: countries.length > 0,
    });
  }, [resolved, countries.length, rec.tmdbId, mediaType]);

  function onNotifyTap() {
    if (notified) return;
    setNotified(true);
    markNotified(rec.tmdbId, rec.type);
    track("arrival_notify_tapped", {
      tmdb_id: rec.tmdbId,
      media_type: mediaType,
      foreign_countries: countries.map((c) => c.code).join(",") || null,
    });
  }

  return (
    <div className="mt-3">
      {/* ux W1 — 캡션("해외 스트리밍") 삭제: 순한글 eyebrow 는 DESIGN.md L109 위반,
          pill 국가명이 자명 + "Where to watch" ChapterMark 가 이미 앵커 (Quiet Ink 여백).
          ux W2 — fetch settle 전 pill row 높이 예약 skeleton (pop-in 시 CTA 밀림 방지).
          타국 0/실패 시 collapse (역시프트는 드문 케이스로 수용 — 리뷰 합의). */}
      {!resolved && !notified ? (
        <div className="mb-2.5 flex gap-2" aria-hidden>
          {[0, 1].map((i) => (
            <div
              key={i}
              className="w-14 h-6 rounded-full bg-surface"
              style={{ opacity: 0.5 }}
            />
          ))}
        </div>
      ) : countries.length > 0 ? (
        <div className="mb-2.5 flex flex-wrap gap-2">
          {countries.map((c) => (
            <span
              key={c.code}
              className="px-2.5 py-1 text-xs rounded-full bg-surface-raised text-secondary"
            >
              {c.name}
            </span>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={onNotifyTap}
        disabled={notified}
        aria-pressed={notified}
        aria-label={
          notified ? "입고 알림 신청됨" : "한국에 들어오면 알림 받기"
        }
        className={`w-full min-h-[44px] rounded-full px-4 py-3 text-sm font-medium transition-transform ${
          notified
            ? "bg-surface text-muted"
            : "bg-surface-raised text-primary active:scale-[0.98]"
        }`}
        style={
          notified
            ? undefined
            : { border: "1px solid var(--accent-border)" }
        }
      >
        {notified ? "알림 신청됨" : "한국에 들어오면 알려드릴게요"}
      </button>
    </div>
  );
}
