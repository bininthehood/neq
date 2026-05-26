/**
 * Persona v2 — PersonaSurveyController E2E integration test (T2.15).
 *
 * Playwright 인프라 미구축 + Vitest + RTL 자산 충분 → 컴포넌트 통합 테스트로
 * 동등한 happy-path + edge-case 커버리지 확보. 추후 Playwright 도입 시
 * 동일 시나리오를 브라우저 레벨로 재작성 가능.
 *
 * 검증 시나리오 (design doc 2026-05-24 §125 LLM 동적 설문 흐름):
 *  1. Happy path — 영화/혼자 + step 1 + step 2 (shouldContinue=false) → summary → accept
 *  2. shouldContinue=true → step 3 진입 → summary
 *  3. "다시 받기" → step 2 부터 재진입 (prevAnswers 1개 유지)
 *  4. mid-survey resume modal — sessionStorage progress 발견 시
 *  5. fallback 자동 진입 — fetch 에러 → static survey 사용
 *  6. cancel — abandoned analytics + onCancel
 *  7. createPersona 호출 시 v2 필드 동봉 + 즉시 switchPersona
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SurveyClientError } from '@neq/core';

// === Mocks ===
const mockFetchSurveyStep = vi.fn();
const mockFetchSurveySummary = vi.fn();
const mockCreatePersona = vi.fn(() => 'new-persona-id');
const mockSwitchPersona = vi.fn();
const mockTrack = vi.fn();

vi.mock('@neq/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@neq/core')>();
  return {
    ...actual,
    fetchSurveyStep: (...args: unknown[]) => mockFetchSurveyStep(...(args as [])),
    fetchSurveySummary: (...args: unknown[]) =>
      mockFetchSurveySummary(...(args as [])),
  };
});

vi.mock('@/lib/store', () => ({
  createPersona: (...args: unknown[]) => mockCreatePersona(...(args as [])),
  switchPersona: (...args: unknown[]) => mockSwitchPersona(...(args as [])),
}));

vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...(args as [])),
}));

vi.mock('@/lib/device-id', () => ({
  getDeviceId: () => 'test-device-id',
}));

// === Test fixtures ===
const STEP1_RESPONSE = {
  question: '어떤 페이스를 좋아해요?',
  options: [
    { id: 'a' as const, label: '빠르게 몰입', hint: '긴장감' },
    { id: 'b' as const, label: '천천히 깊게', hint: '여운' },
    { id: 'c' as const, label: '균형', hint: '상황 따라' },
    { id: 'd' as const, label: '잘 모르겠어요' },
  ],
  axisHint: '페이스',
  shouldContinue: false,
  newToken: 'token-abc',
};

const STEP2_RESPONSE_END = {
  question: '어떤 결말이 좋아요?',
  options: [
    { id: 'a' as const, label: '명쾌한 마무리' },
    { id: 'b' as const, label: '여운이 남는 마무리' },
    { id: 'c' as const, label: '반전이 있는 마무리' },
    { id: 'd' as const, label: '무관' },
  ],
  axisHint: '결말',
  shouldContinue: false,
};

const STEP2_RESPONSE_CONTINUE = {
  ...STEP2_RESPONSE_END,
  shouldContinue: true,
};

const STEP3_RESPONSE = {
  question: '어떤 주제를 견딜 수 있어요?',
  options: [
    { id: 'a' as const, label: '무거운 주제' },
    { id: 'b' as const, label: '가벼운 주제' },
    { id: 'c' as const, label: '둘 다' },
    { id: 'd' as const, label: '잘 모르겠어요' },
  ],
  axisHint: '주제 무게',
  shouldContinue: false,
};

const SUMMARY_RESPONSE = {
  tasteSummary:
    '천천히 깊게 보는 영화 팬으로, 여운이 남는 결말을 선호합니다.',
  axes: [
    { name: '페이스', value: '천천히 깊게' },
    { name: '결말', value: '여운이 남는 마무리' },
  ],
};

// === Helpers ===
function importController() {
  return import('../PersonaSurveyController');
}

function pickContextMovieAlone() {
  fireEvent.click(screen.getByRole('radio', { name: '영화' }));
  fireEvent.click(screen.getByRole('radio', { name: '혼자' }));
  fireEvent.click(screen.getByRole('button', { name: '다음' }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  mockFetchSurveyStep.mockReset();
  mockFetchSurveySummary.mockReset();
  mockCreatePersona.mockReset();
  mockCreatePersona.mockReturnValue('new-persona-id');
  mockSwitchPersona.mockReset();
  mockTrack.mockReset();
});

// ─────────────────────────────────────────────────────────
// 1. Happy path — 영화/혼자 + step 1 + step 2 (end) → summary → accept
// ─────────────────────────────────────────────────────────

describe('PersonaSurveyController — 영화/혼자 happy path', () => {
  it('컨텍스트 → step 1 → step 2 (end) → summary → 맞아요 → onComplete', async () => {
    mockFetchSurveyStep
      .mockResolvedValueOnce(STEP1_RESPONSE)
      .mockResolvedValueOnce(STEP2_RESPONSE_END);
    mockFetchSurveySummary.mockResolvedValueOnce(SUMMARY_RESPONSE);

    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const { default: Controller } = await importController();
    render(<Controller onComplete={onComplete} onCancel={onCancel} />);

    // (1) 컨텍스트 선택
    expect(screen.getByText('어떤 페르소나를 만들까요?')).toBeTruthy();
    pickContextMovieAlone();

    // (2) step 1 응답 도착
    await waitFor(() =>
      expect(screen.getByText('어떤 페이스를 좋아해요?')).toBeTruthy(),
    );
    expect(mockFetchSurveyStep).toHaveBeenCalledTimes(1);

    // 옵션 선택 + 다음
    fireEvent.click(screen.getByRole('radio', { name: /천천히 깊게/ }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));

    // (3) step 2 응답 도착 (shouldContinue=false)
    await waitFor(() =>
      expect(screen.getByText('어떤 결말이 좋아요?')).toBeTruthy(),
    );
    expect(mockFetchSurveyStep).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('radio', { name: /여운이 남는/ }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));

    // (4a) favorites_pick step 진입 — design doc step 5. 본 테스트는 skip path.
    await waitFor(() =>
      expect(screen.getByText('좋아하는 작품도 알려주세요')).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: '건너뛰기' }));

    // (4b) summary preview 진입
    await waitFor(() =>
      expect(screen.getByText(SUMMARY_RESPONSE.tasteSummary)).toBeTruthy(),
    );
    expect(mockFetchSurveySummary).toHaveBeenCalledTimes(1);

    // (5) "맞아요" 클릭 → persona 생성 + onComplete
    fireEvent.click(screen.getByRole('button', { name: '맞아요' }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith('new-persona-id'));
    expect(mockCreatePersona).toHaveBeenCalledTimes(1);
    expect(mockSwitchPersona).toHaveBeenCalledWith('new-persona-id');

    // createPersona 호출 인자 검증 — v2 필드 동봉 (T2.14 IRON RULE 정합)
    const callArgs = mockCreatePersona.mock.calls[0] as unknown as [
      string,
      string[],
      unknown[],
      {
        tasteSummary?: string;
        tasteSurveyAnswers?: { question: string; selectedOption: string }[];
        context?: { contentType: string; companion: string };
      },
    ];
    const [name, favorites, favoritesMeta, extras] = callArgs;
    expect(name).toBe('영화 · 혼자');
    expect(favorites).toEqual([]);
    expect(favoritesMeta).toEqual([]);
    expect(extras.tasteSummary).toBe(SUMMARY_RESPONSE.tasteSummary);
    expect(extras.context).toEqual({
      contentType: 'movie',
      companion: 'alone',
    });
    expect(extras.tasteSurveyAnswers).toHaveLength(2);
    expect(extras.tasteSurveyAnswers?.[0].selectedOption).toContain('천천히 깊게');
    expect(extras.tasteSurveyAnswers?.[1].selectedOption).toContain('여운이 남는');

    // analytics 발사 검증 (7 이벤트 중 핵심 4)
    const eventNames = mockTrack.mock.calls.map((c) => c[0]);
    expect(eventNames).toContain('taste_survey_started');
    expect(eventNames).toContain('taste_survey_step_completed');
    expect(eventNames).toContain('taste_summary_generated');
    expect(eventNames).toContain('taste_survey_completed');
  });

  it('newToken 가 step 호출 간 유지된다', async () => {
    mockFetchSurveyStep
      .mockResolvedValueOnce(STEP1_RESPONSE)
      .mockResolvedValueOnce(STEP2_RESPONSE_END);
    mockFetchSurveySummary.mockResolvedValueOnce(SUMMARY_RESPONSE);

    const { default: Controller } = await importController();
    render(<Controller onComplete={vi.fn()} onCancel={vi.fn()} />);

    pickContextMovieAlone();
    await waitFor(() =>
      expect(screen.getByText('어떤 페이스를 좋아해요?')).toBeTruthy(),
    );

    fireEvent.click(screen.getByRole('radio', { name: /천천히/ }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() =>
      expect(screen.getByText('어떤 결말이 좋아요?')).toBeTruthy(),
    );

    // 두 번째 fetchSurveyStep 호출에 token-abc 가 전달돼야
    const secondCall = mockFetchSurveyStep.mock.calls[1];
    expect(secondCall[1]?.token).toBe('token-abc');
  });
});

// ─────────────────────────────────────────────────────────
// 2. shouldContinue=true → step 3
// ─────────────────────────────────────────────────────────

describe('PersonaSurveyController — shouldContinue=true 분기', () => {
  it('step 2 응답에 shouldContinue=true 면 step 3 진입', async () => {
    mockFetchSurveyStep
      .mockResolvedValueOnce(STEP1_RESPONSE)
      .mockResolvedValueOnce(STEP2_RESPONSE_CONTINUE)
      .mockResolvedValueOnce(STEP3_RESPONSE);
    mockFetchSurveySummary.mockResolvedValueOnce(SUMMARY_RESPONSE);

    const { default: Controller } = await importController();
    render(<Controller onComplete={vi.fn()} onCancel={vi.fn()} />);

    pickContextMovieAlone();
    await waitFor(() =>
      expect(screen.getByText('어떤 페이스를 좋아해요?')).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('radio', { name: /천천히/ }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));

    await waitFor(() =>
      expect(screen.getByText('어떤 결말이 좋아요?')).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('radio', { name: /여운/ }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));

    // step 3 진입
    await waitFor(() =>
      expect(
        screen.getByText('어떤 주제를 견딜 수 있어요?'),
      ).toBeTruthy(),
    );
    expect(mockFetchSurveyStep).toHaveBeenCalledTimes(3);
  });
});

// ─────────────────────────────────────────────────────────
// 3. "다시 받기" → step 2 부터 재진입
// ─────────────────────────────────────────────────────────

describe('PersonaSurveyController — 다시 받기', () => {
  it('summary preview 에서 "다시 받기" → step 2 호출 + analytics 발사', async () => {
    mockFetchSurveyStep
      .mockResolvedValueOnce(STEP1_RESPONSE)
      .mockResolvedValueOnce(STEP2_RESPONSE_END)
      // retry 시 step 2 다시 호출
      .mockResolvedValueOnce(STEP2_RESPONSE_END);
    mockFetchSurveySummary.mockResolvedValueOnce(SUMMARY_RESPONSE);

    const { default: Controller } = await importController();
    render(<Controller onComplete={vi.fn()} onCancel={vi.fn()} />);

    pickContextMovieAlone();
    await waitFor(() =>
      expect(screen.getByText('어떤 페이스를 좋아해요?')).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('radio', { name: /천천히/ }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() =>
      expect(screen.getByText('어떤 결말이 좋아요?')).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('radio', { name: /여운/ }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    // favorites_pick — skip
    await waitFor(() =>
      expect(screen.getByText('좋아하는 작품도 알려주세요')).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: '건너뛰기' }));
    await waitFor(() =>
      expect(screen.getByText(SUMMARY_RESPONSE.tasteSummary)).toBeTruthy(),
    );

    fireEvent.click(screen.getByRole('button', { name: '다시 받기' }));

    // step 2 다시 호출
    await waitFor(() => expect(mockFetchSurveyStep).toHaveBeenCalledTimes(3));
    const thirdCall = mockFetchSurveyStep.mock.calls[2];
    expect(thirdCall[0].step).toBe(2);
    // prevAnswers 의 step 1 답만 유지
    expect(thirdCall[0].prevAnswers).toHaveLength(1);

    const eventNames = mockTrack.mock.calls.map((c) => c[0]);
    expect(eventNames).toContain('persona_taste_resurveyed');
  });
});

// ─────────────────────────────────────────────────────────
// 4. mid-survey resume modal
// ─────────────────────────────────────────────────────────

describe('PersonaSurveyController — mid-survey resume', () => {
  it('동일 컨텍스트의 progress 발견 시 resume modal 노출', async () => {
    // 기존 진행 상황 주입 (step 2 까지 진행)
    sessionStorage.setItem(
      'neq_taste_survey_progress:movie-alone',
      JSON.stringify({
        context: { contentType: 'movie', companion: 'alone' },
        prevAnswers: [
          { question: '어떤 페이스?', selectedOption: '천천히 깊게' },
        ],
        step: 2,
      }),
    );

    const { default: Controller } = await importController();
    render(<Controller onComplete={vi.fn()} onCancel={vi.fn()} />);

    pickContextMovieAlone();

    // resume modal 노출
    await waitFor(() =>
      expect(screen.getByText('이어서 하시겠어요?')).toBeTruthy(),
    );
    expect(
      screen.getByRole('button', { name: '이어서' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '처음부터' }),
    ).toBeTruthy();
  });

  it('"처음부터" 선택 → sessionStorage clear + step 1 진입', async () => {
    sessionStorage.setItem(
      'neq_taste_survey_progress:movie-alone',
      JSON.stringify({
        context: { contentType: 'movie', companion: 'alone' },
        prevAnswers: [{ question: 'Q', selectedOption: 'A' }],
        step: 2,
      }),
    );

    mockFetchSurveyStep.mockResolvedValueOnce(STEP1_RESPONSE);

    const { default: Controller } = await importController();
    render(<Controller onComplete={vi.fn()} onCancel={vi.fn()} />);
    pickContextMovieAlone();

    await waitFor(() =>
      expect(screen.getByText('이어서 하시겠어요?')).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: '처음부터' }));

    // step 1 진입 (prevAnswers=[])
    await waitFor(() =>
      expect(screen.getByText('어떤 페이스를 좋아해요?')).toBeTruthy(),
    );
    expect(mockFetchSurveyStep).toHaveBeenCalledTimes(1);
    expect(mockFetchSurveyStep.mock.calls[0][0].prevAnswers).toEqual([]);
    expect(mockFetchSurveyStep.mock.calls[0][0].step).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────
// 5. fallback 자동 진입 — 서버 호출 실패 시
// ─────────────────────────────────────────────────────────

describe('PersonaSurveyController — fallback', () => {
  it('fetchSurveyStep network 에러 시 static survey 자동 진입', async () => {
    // 첫 호출 실패 → controller 가 getStaticSurveyStep 으로 fallback
    mockFetchSurveyStep.mockRejectedValueOnce(
      new SurveyClientError('network', 'down'),
    );

    const { default: Controller } = await importController();
    render(<Controller onComplete={vi.fn()} onCancel={vi.fn()} />);
    pickContextMovieAlone();

    // static-survey 의 영화/혼자 step 1 = "어떤 페이스가 좋아요?"
    await waitFor(() =>
      expect(screen.getByText('어떤 페이스가 좋아요?')).toBeTruthy(),
    );

    const eventNames = mockTrack.mock.calls.map((c) => c[0]);
    expect(eventNames).toContain('taste_survey_fallback_triggered');
  });

  it('rate_limit 에러 → modal 노출 + 진행 차단', async () => {
    mockFetchSurveyStep.mockRejectedValueOnce(
      new SurveyClientError('rate_limit', 'too many', 429),
    );

    const { default: Controller } = await importController();
    render(<Controller onComplete={vi.fn()} onCancel={vi.fn()} />);
    pickContextMovieAlone();

    // 동일 카피가 modal title + description 양쪽에 등장 → role=heading 으로 좁힘
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: '잠시 후 다시 시도해주세요' }),
      ).toBeTruthy(),
    );
    // step 화면 미진입
    expect(screen.queryByText('어떤 페이스를 좋아해요?')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// 6. cancel — abandoned + onCancel
// ─────────────────────────────────────────────────────────

describe('PersonaSurveyController — cancel', () => {
  it('mid-survey 닫기 → abandoned 발사 + onCancel', async () => {
    mockFetchSurveyStep.mockResolvedValueOnce(STEP1_RESPONSE);

    const onCancel = vi.fn();
    const { default: Controller } = await importController();
    render(<Controller onComplete={vi.fn()} onCancel={onCancel} />);

    pickContextMovieAlone();
    await waitFor(() =>
      expect(screen.getByText('어떤 페이스를 좋아해요?')).toBeTruthy(),
    );

    fireEvent.click(screen.getByRole('button', { name: '설문 닫기' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    const eventNames = mockTrack.mock.calls.map((c) => c[0]);
    expect(eventNames).toContain('taste_survey_abandoned');
  });

  it('컨텍스트 선택 전 닫기 → abandoned 안 발사', async () => {
    const onCancel = vi.fn();
    const { default: Controller } = await importController();
    render(<Controller onComplete={vi.fn()} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: '설문 닫기' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    const eventNames = mockTrack.mock.calls.map((c) => c[0]);
    expect(eventNames).not.toContain('taste_survey_abandoned');
  });
});
