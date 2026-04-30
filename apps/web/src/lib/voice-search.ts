/**
 * Voice Search — Web Speech API 래퍼 (D10b).
 *
 * SearchSheet 의 mic 아이콘에서 사용. webkitSpeechRecognition / SpeechRecognition
 * 양쪽을 polyfill 처럼 다룬다.
 *
 * 제약:
 *   - HTTPS 또는 localhost 필요 (브라우저 정책)
 *   - 일부 브라우저 미지원 (Safari iOS 일부 / Firefox 데스크톱 등)
 *   - SSR 안전: typeof window 가드
 *
 * 디자인 산출물: _workspace/design-handoff/_incoming/neq-design-day25/neko-search-screen.jsx L201~247
 */

// ─── 타입 (lib.dom 의 SpeechRecognition 은 일부 환경에서 부재) ───

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message?: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((ev: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionCtor {
  new (): SpeechRecognitionInstance;
}

interface VoiceWindow {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
  isSecureContext?: boolean;
  location?: { hostname?: string };
}

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as VoiceWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ─── 지원 검출 ───

/**
 * 현재 브라우저가 음성 인식을 지원하는지 검사한다.
 * - SpeechRecognition 또는 webkitSpeechRecognition 존재 + isSecureContext (HTTPS / localhost)
 * - SSR 환경 → false
 */
export function isVoiceSearchSupported(): boolean {
  if (typeof window === "undefined") return false;
  const ctor = getCtor();
  if (!ctor) return false;
  const w = window as unknown as VoiceWindow;
  // isSecureContext 가 없는 환경 (jsdom 등) → ctor 만 확인
  if (typeof w.isSecureContext === "boolean") {
    if (!w.isSecureContext) {
      // localhost 는 secure context 로 인정되지만 환경에 따라 false 인 경우 보수적으로 hostname 체크
      const host = w.location?.hostname ?? "";
      if (host !== "localhost" && host !== "127.0.0.1") return false;
    }
  }
  return true;
}

// ─── start ───

export interface StartVoiceRecognitionOpts {
  /** 인식 언어. 기본 'ko-KR'. */
  lang?: "ko-KR" | "en-US" | string;
  /** 중간/최종 결과 콜백 — `isFinal` true 일 때 최종 transcript */
  onResult: (transcript: string, isFinal: boolean) => void;
  /** 오류 콜백 — error 명 (e.g. "no-speech", "not-allowed") */
  onError: (err: string) => void;
  /** 인식 종료 콜백 (성공/오류 모두 후행) */
  onEnd: () => void;
}

export interface VoiceRecognitionHandle {
  /** 진행 중인 인식을 즉시 중단. onEnd 가 호출된다. */
  stop: () => void;
}

/**
 * 음성 인식을 시작한다.
 * 호출자는 미리 `isVoiceSearchSupported()` 로 가드해야 한다 — 미지원 시 throw.
 *
 * @returns stop 핸들. 화면 unmount / 사용자 취소 시 호출.
 */
export function startVoiceRecognition(
  opts: StartVoiceRecognitionOpts,
): VoiceRecognitionHandle {
  const ctor = getCtor();
  if (!ctor) {
    throw new Error("SpeechRecognition is not supported in this environment");
  }

  const recog = new ctor();
  recog.lang = opts.lang ?? "ko-KR";
  recog.continuous = false;
  recog.interimResults = true;
  recog.maxAlternatives = 1;

  recog.onresult = (ev: SpeechRecognitionEvent) => {
    // 가장 최근 결과만 표면화 (interim → final 흐름)
    let transcript = "";
    let isFinal = false;
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const result = ev.results[i];
      if (!result || result.length === 0) continue;
      transcript += result[0].transcript;
      if (result.isFinal) isFinal = true;
    }
    if (transcript.length > 0) {
      opts.onResult(transcript, isFinal);
    }
  };

  recog.onerror = (ev: SpeechRecognitionErrorEvent) => {
    opts.onError(ev.error || "unknown");
  };

  recog.onend = () => {
    opts.onEnd();
  };

  try {
    recog.start();
  } catch (err) {
    // start() 가 이미 인식 중일 때 throw 하는 경우가 있음 — onError 로 우회
    opts.onError(err instanceof Error ? err.message : "start-failed");
    opts.onEnd();
  }

  return {
    stop: () => {
      try {
        recog.stop();
      } catch {
        // 이미 종료된 경우 — 무시
      }
    },
  };
}
