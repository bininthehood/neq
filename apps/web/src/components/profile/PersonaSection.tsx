"use client";

import { IconCheck, IconClose } from "@/components/Icons";

/**
 * PersonaSection — Profile 페이지의 취향(페르소나) 리스트 + 생성 버튼.
 *
 * 책임: persona list 표시, 활성 표시, 비활성 페르소나 클릭 시 switch, 비-default 페르소나
 * 삭제 버튼 노출. 생성 버튼은 personas.length < 3 일 때만 활성.
 *
 * state owner 는 부모 page (PersonaContext + onSwitch/onDelete 콜백).
 */

interface Persona {
  id: string;
  name: string;
  favorites: string[];
}

interface PersonaSectionProps {
  personas: Persona[];
  activePersonaId: string | null;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
  onCreateClick: () => void;
}

export default function PersonaSection({
  personas,
  activePersonaId,
  onSwitch,
  onDelete,
  onCreateClick,
}: PersonaSectionProps) {
  return (
    <section className="px-5 mb-6">
      <h2 className="text-xs uppercase tracking-wider text-muted font-semibold mb-3">취향</h2>
      <div className="space-y-2">
        {personas.map((p) => (
          <div
            key={p.id}
            role="button"
            tabIndex={0}
            onClick={() => {
              if (p.id !== activePersonaId) onSwitch(p.id);
            }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.currentTarget.click(); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg active:scale-[0.98] transition-transform cursor-pointer"
            style={{
              background: "var(--surface)",
              border: p.id === activePersonaId ? "1px solid var(--accent-border)" : "1px solid var(--border-subtle)",
            }}
          >
            <div className="flex-1 text-left">
              <div className="text-sm font-medium" style={{ color: p.id === activePersonaId ? "var(--accent)" : "var(--text-primary)" }}>
                {p.name}
              </div>
              <div className="text-xs text-muted mt-0.5">
                {p.favorites.slice(0, 3).join(", ")}
                {p.favorites.length > 3 && ` 외 ${p.favorites.length - 3}편`}
              </div>
            </div>
            {p.id === activePersonaId && (
              <IconCheck size={16} color="var(--accent)" />
            )}
            {p.id !== "default" && p.id !== activePersonaId && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(p.id);
                }}
                className="w-11 h-11 flex items-center justify-center rounded-full active:scale-90 transition-transform"
                style={{ background: "var(--danger-dim)" }}
              >
                <IconClose size={12} color="var(--danger)" />
              </button>
            )}
          </div>
        ))}
      </div>
      {personas.length < 3 ? (
        <button
          onClick={onCreateClick}
          className="w-full mt-2 flex items-center justify-center gap-1 px-4 py-3 rounded-lg text-sm active:scale-[0.98] transition-transform"
          style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px dashed var(--border)" }}
        >
          + 새 취향 추가
        </button>
      ) : (
        <p className="text-xs text-muted mt-2 px-1">최대 3개까지 만들 수 있어요</p>
      )}
    </section>
  );
}
