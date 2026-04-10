"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import BottomNav from "@/components/BottomNav";
import { NeqSpinner } from "@/components/Icons";

interface Favorite {
  id: number;
  title: string;
  posterUrl: string | null;
}

interface Props {
  favorites: Favorite[];
}

const MESSAGES = [
  "취향을 분석하고 있어요...",
  "숨겨진 명작을 찾는 중이에요...",
  "OTT 가용성을 확인하고 있어요...",
  "거의 다 왔어요...",
];

export default function FirstLoadingScreen({ favorites }: Props) {
  const [msgIdx, setMsgIdx] = useState(0);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      setMsgIdx((i) => (i + 1) % MESSAGES.length);
    }, 2200);
    return () => clearInterval(iv);
  }, []);

  // 포스터 있는 것만 사용 (최대 5개)
  const postersToShow = favorites.filter((f) => f.posterUrl).slice(0, 5);

  return (
    <div className="h-dvh flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 shrink-0">
        <span className="font-display text-lg text-accent">neq,</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-8">
        {/* 포스터 부채꼴 회상 */}
        {postersToShow.length > 0 && (
          <div className="relative flex items-center justify-center" style={{ height: 220, width: 260 }}>
            {postersToShow.map((fav, i) => {
              const total = postersToShow.length;
              const angleSpread = 30; // 총 펼침 각도
              const anglePerCard = total > 1 ? angleSpread / (total - 1) : 0;
              const startAngle = -angleSpread / 2;
              const rotation = startAngle + i * anglePerCard;
              const xOffset = (i - (total - 1) / 2) * 20;

              return (
                <div
                  key={fav.id}
                  className="absolute transition-all ease-out"
                  style={{
                    transform: entered
                      ? `translateX(${xOffset}px) rotate(${rotation}deg)`
                      : `translateX(0px) rotate(0deg) scale(0.9)`,
                    opacity: entered ? 1 : 0,
                    transitionDuration: "700ms",
                    transitionDelay: `${i * 120}ms`,
                    zIndex: i,
                  }}
                >
                  {fav.posterUrl ? (
                    <Image
                      src={fav.posterUrl}
                      alt={fav.title}
                      width={120}
                      height={180}
                      className="object-cover rounded-lg shadow-2xl"
                      unoptimized
                      style={{
                        border: "2px solid var(--border)",
                        boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
                      }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {/* 스피너 + 메시지 */}
        <div className="flex flex-col items-center gap-4">
          <NeqSpinner size={32} />
          <div className="text-center min-h-[44px]">
            <p
              key={msgIdx}
              className="font-display text-base text-foreground animate-fade-in"
            >
              {MESSAGES[msgIdx]}
            </p>
            <p className="text-xs mt-1.5 text-muted">
              처음 한 번만, 잠시 기다려주세요
            </p>
          </div>
        </div>
      </div>

      <BottomNav active="discover" />
    </div>
  );
}
