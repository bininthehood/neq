/**
 * Hybrid Onboarding (9단계 통합 progress) — OnboardingV2Controller integration test.
 *
 * Persona inline mount + 외부 StepHeader 가 통합 1~9 진행률을 정확히 표시하는지,
 * embedded subStep callback 이 sub-step 1~5 (context_select → summary) 를 4~8 로
 * 매핑하는지, back 버튼이 정책대로 노출/숨김 되는지 검증.
 *
 * 2026-06-16: notify 단계 제거 → TOTAL_STEPS 6→5, UNIFIED 10→9. OTT 가 마지막 단계.
 *
 * Playwright 미구축 (devDep 만 존재) → vitest + RTL 로 동등 커버리지.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// === Mocks ===
const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockTrack = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/contexts/PersonaContext", () => ({
  usePersona: () => ({ refresh: mockRefresh }),
}));

vi.mock("@/lib/analytics", () => ({
  track: (...args: unknown[]) => mockTrack(...(args as [])),
}));

vi.mock("@/lib/account-prefs", () => ({
  getAccountPrefs: () => ({
    tasteGenres: [],
    subscribedOtt: [],
  }),
}));

// 단계 컴포넌트 모두 mock — 실제 구현은 별도 spec 으로 검증됨.
vi.mock("../OnboardingStepWelcome", () => ({
  default: ({ onNext }: { onNext: () => void }) => (
    <button data-testid="welcome-next" onClick={onNext}>
      welcome
    </button>
  ),
}));

vi.mock("../OnboardingStepHello", () => ({
  default: ({ onNext }: { onNext: (name: string) => void }) => (
    <button data-testid="hello-next" onClick={() => onNext("tester")}>
      hello
    </button>
  ),
}));

vi.mock("../OnboardingStepGenre", () => ({
  default: ({
    onNext,
  }: {
    onNext: (opts?: { random?: boolean }) => void;
  }) => (
    <button data-testid="genre-next" onClick={() => onNext()}>
      genre
    </button>
  ),
}));

vi.mock("../OnboardingStepOTT", () => ({
  default: ({ onNext }: { onNext: () => void }) => (
    <button data-testid="ott-next" onClick={onNext}>
      ott
    </button>
  ),
}));

vi.mock("../PersonaSurveyController", () => ({
  default: ({
    onComplete,
    onCancel,
    embedded,
  }: {
    onComplete: (id: string) => void;
    onCancel: () => void;
    embedded?: { onSubStepChange: (n: number) => void };
  }) => (
    <div data-testid="persona-controller">
      <button
        data-testid="persona-sub-1"
        onClick={() => embedded?.onSubStepChange(1)}
      >
        sub1
      </button>
      <button
        data-testid="persona-sub-2"
        onClick={() => embedded?.onSubStepChange(2)}
      >
        sub2
      </button>
      <button
        data-testid="persona-sub-3"
        onClick={() => embedded?.onSubStepChange(3)}
      >
        sub3
      </button>
      <button
        data-testid="persona-sub-4"
        onClick={() => embedded?.onSubStepChange(4)}
      >
        sub4
      </button>
      <button
        data-testid="persona-sub-5"
        onClick={() => embedded?.onSubStepChange(5)}
      >
        sub5
      </button>
      <button data-testid="persona-complete" onClick={() => onComplete("p-1")}>
        complete
      </button>
      <button data-testid="persona-cancel" onClick={onCancel}>
        cancel
      </button>
    </div>
  ),
}));

import OnboardingV2Controller from "../OnboardingV2Controller";

beforeEach(() => {
  mockPush.mockClear();
  mockRefresh.mockClear();
  mockTrack.mockClear();
  localStorage.clear();
  sessionStorage.clear();
});

function advanceTo(step: 0 | 1 | 2 | 3 | 4) {
  if (step >= 1) fireEvent.click(screen.getByTestId("welcome-next"));
  if (step >= 2) fireEvent.click(screen.getByTestId("hello-next"));
  if (step >= 3) fireEvent.click(screen.getByTestId("genre-next"));
  if (step >= 4) fireEvent.click(screen.getByTestId("persona-complete"));
}

describe("Hybrid onboarding — 통합 9단계 progress", () => {
  it("step 0 (welcome) — 라벨 '1 / 9', back 버튼 hidden", () => {
    render(<OnboardingV2Controller />);
    expect(screen.getByText("1 / 9")).toBeTruthy();
    expect(screen.queryByLabelText("이전 단계")).toBeNull();
  });

  it("step 1 (hello) — '2 / 9', back visible", () => {
    render(<OnboardingV2Controller />);
    advanceTo(1);
    expect(screen.getByText("2 / 9")).toBeTruthy();
    expect(screen.getByLabelText("이전 단계")).toBeTruthy();
  });

  it("step 2 (genre) — '3 / 9', back visible", () => {
    render(<OnboardingV2Controller />);
    advanceTo(2);
    expect(screen.getByText("3 / 9")).toBeTruthy();
  });

  it("step 3 persona — sub 1~5 가 4~8 로 매핑된다", () => {
    render(<OnboardingV2Controller />);
    advanceTo(3);
    // 진입 초기 personaSubStep=1 → '4 / 9'
    expect(screen.getByText("4 / 9")).toBeTruthy();

    fireEvent.click(screen.getByTestId("persona-sub-2"));
    expect(screen.getByText("5 / 9")).toBeTruthy();

    fireEvent.click(screen.getByTestId("persona-sub-3"));
    expect(screen.getByText("6 / 9")).toBeTruthy();

    fireEvent.click(screen.getByTestId("persona-sub-4"));
    expect(screen.getByText("7 / 9")).toBeTruthy();

    fireEvent.click(screen.getByTestId("persona-sub-5"));
    expect(screen.getByText("8 / 9")).toBeTruthy();
  });

  it("persona subStep≥2 — back 버튼 hidden (사용자가 persona 내부 phase 로 돌아가지 못함)", () => {
    render(<OnboardingV2Controller />);
    advanceTo(3);
    // subStep=1 — back visible
    expect(screen.getByLabelText("이전 단계")).toBeTruthy();
    fireEvent.click(screen.getByTestId("persona-sub-2"));
    expect(screen.queryByLabelText("이전 단계")).toBeNull();
    fireEvent.click(screen.getByTestId("persona-sub-3"));
    expect(screen.queryByLabelText("이전 단계")).toBeNull();
    fireEvent.click(screen.getByTestId("persona-sub-5"));
    expect(screen.queryByLabelText("이전 단계")).toBeNull();
  });

  it("persona subStep=1 일 때 back → step=2 (genre) 로 복귀", () => {
    render(<OnboardingV2Controller />);
    advanceTo(3);
    expect(screen.getByText("4 / 9")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("이전 단계"));
    expect(screen.getByText("3 / 9")).toBeTruthy();
    expect(screen.getByTestId("genre-next")).toBeTruthy();
  });

  it("step 4 (ott) — '9 / 9', back visible", () => {
    render(<OnboardingV2Controller />);
    advanceTo(4);
    expect(screen.getByText("9 / 9")).toBeTruthy();
    expect(screen.getByLabelText("이전 단계")).toBeTruthy();
  });

});

describe("Persona 완료/취소 분기", () => {
  it("onComplete → step=4 (ott) 로 이동 + persona_created=true 추적", () => {
    render(<OnboardingV2Controller />);
    advanceTo(3);
    fireEvent.click(screen.getByTestId("persona-complete"));
    expect(screen.getByText("9 / 9")).toBeTruthy();
    const completedCall = mockTrack.mock.calls.find(
      (c) => c[0] === "onboarding_step_completed" && c[1]?.step === "persona",
    );
    expect(completedCall?.[1]?.persona_created).toBe(true);
  });

  it("onCancel → step=4 (ott) 로 이동 + persona_created=false 추적", () => {
    render(<OnboardingV2Controller />);
    advanceTo(3);
    fireEvent.click(screen.getByTestId("persona-cancel"));
    expect(screen.getByText("9 / 9")).toBeTruthy();
    const completedCall = mockTrack.mock.calls.find(
      (c) => c[0] === "onboarding_step_completed" && c[1]?.step === "persona",
    );
    expect(completedCall?.[1]?.persona_created).toBe(false);
  });
});

describe("finalize — OTT 완료 시", () => {
  it("onboarding_completed 발사 + persona.refresh + localStorage 마킹 + /onboarding/complete push", () => {
    render(<OnboardingV2Controller />);
    advanceTo(4);
    fireEvent.click(screen.getByTestId("ott-next"));

    expect(
      mockTrack.mock.calls.some((c) => c[0] === "onboarding_completed"),
    ).toBe(true);
    expect(mockRefresh).toHaveBeenCalled();
    expect(localStorage.getItem("neq_onboarded")).toBe("true");
    expect(localStorage.getItem("neq_onboarding_done")).toBe("true");
    expect(mockPush).toHaveBeenCalledWith("/onboarding/complete");
  });
});

describe("Persona 건너뛰기 (P0 trap 차단)", () => {
  it("persona subStep=1 일 때는 건너뛰기 버튼이 보이지 않는다 (back 으로 나갈 수 있음)", () => {
    render(<OnboardingV2Controller />);
    advanceTo(3);
    expect(screen.queryByLabelText("취향 만들기 건너뛰기")).toBeNull();
  });

  it("persona subStep≥2 에서 건너뛰기 버튼 노출 — LLM 행 / rate-limit trap 차단", () => {
    render(<OnboardingV2Controller />);
    advanceTo(3);
    fireEvent.click(screen.getByTestId("persona-sub-2"));
    expect(screen.getByLabelText("취향 만들기 건너뛰기")).toBeTruthy();
    fireEvent.click(screen.getByTestId("persona-sub-5"));
    expect(screen.getByLabelText("취향 만들기 건너뛰기")).toBeTruthy();
  });

  it("건너뛰기 confirm 후 → goNext (persona_created=false, skipped_from_header=true)", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<OnboardingV2Controller />);
    advanceTo(3);
    fireEvent.click(screen.getByTestId("persona-sub-3"));
    fireEvent.click(screen.getByLabelText("취향 만들기 건너뛰기"));
    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.getByText("9 / 9")).toBeTruthy(); // OTT step
    const personaCompletion = mockTrack.mock.calls.find(
      (c) => c[0] === "onboarding_step_completed" && c[1]?.step === "persona",
    );
    expect(personaCompletion?.[1]?.persona_created).toBe(false);
    expect(personaCompletion?.[1]?.skipped_from_header).toBe(true);
    confirmSpy.mockRestore();
  });

  it("confirm 취소 시 현재 단계 유지 (header progress 변화 없음)", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<OnboardingV2Controller />);
    advanceTo(3);
    fireEvent.click(screen.getByTestId("persona-sub-4"));
    expect(screen.getByText("7 / 9")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("취향 만들기 건너뛰기"));
    expect(screen.getByText("7 / 9")).toBeTruthy(); // 그대로
    confirmSpy.mockRestore();
  });
});

describe("personaSubStep 리셋 (P1#5 회귀)", () => {
  it("persona 끝낸 후 OTT 에서 back → persona 진입 시 헤더 4/10 (stale 8/10 회귀 없음)", () => {
    render(<OnboardingV2Controller />);
    advanceTo(3);
    fireEvent.click(screen.getByTestId("persona-sub-5")); // 8/10
    fireEvent.click(screen.getByTestId("persona-complete")); // → 9/10 (OTT)
    expect(screen.getByText("9 / 9")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("이전 단계")); // back → persona
    // personaSubStep 가 리셋됐어야 함. PersonaSurveyController 가 mount 되며
    // useEffect 로 onSubStepChange(1) 호출. 리셋이 없으면 5 가 stale 상태로 남아 8/10 표시.
    expect(screen.getByText("4 / 9")).toBeTruthy();
    expect(screen.queryByText("8 / 9")).toBeNull();
  });
});
