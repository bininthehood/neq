/**
 * voice-search.ts 단위 테스트 — D10b
 *
 * jsdom 환경에서는 SpeechRecognition 이 부재. mock 으로 ctor 를 주입한 뒤
 *   - isVoiceSearchSupported() 분기
 *   - startVoiceRecognition() 옵션 매핑 (lang / interimResults 등)
 *   - onResult / onError / onEnd 호출 흐름
 * 을 검증한다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

interface MockResult {
  isFinal: boolean;
  transcript: string;
}

class MockSpeechRecognition extends EventTarget {
  static instances: MockSpeechRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onend: ((ev: unknown) => void) | null = null;
  startCalls = 0;
  stopCalls = 0;
  shouldThrowOnStart = false;

  constructor() {
    super();
    MockSpeechRecognition.instances.push(this);
  }

  start() {
    this.startCalls++;
    if (this.shouldThrowOnStart) {
      throw new Error("already-started");
    }
  }

  stop() {
    this.stopCalls++;
  }

  abort() {
    /* no-op */
  }

  // 테스트용 헬퍼
  fireResult(results: MockResult[], resultIndex = 0) {
    const ev = {
      resultIndex,
      results: makeResultList(results),
    };
    this.onresult?.(ev);
  }

  fireError(error: string) {
    this.onerror?.({ error });
  }

  fireEnd() {
    this.onend?.({});
  }
}

function makeResultList(results: MockResult[]) {
  const list = results.map((r) => {
    const arr = [{ transcript: r.transcript, confidence: 0.9 }];
    return Object.assign(arr, {
      length: 1,
      isFinal: r.isFinal,
      item: (i: number) => arr[i],
    });
  });
  return Object.assign(list, {
    length: list.length,
    item: (i: number) => list[i],
  });
}

beforeEach(() => {
  MockSpeechRecognition.instances = [];
  // 깨끗한 상태로 시작
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as unknown as { webkitSpeechRecognition?: unknown })
    .webkitSpeechRecognition;
  // jsdom 의 isSecureContext 는 false 일 수 있음 — localhost hostname 가 default
});

afterEach(() => {
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as unknown as { webkitSpeechRecognition?: unknown })
    .webkitSpeechRecognition;
  vi.resetModules();
});

describe("isVoiceSearchSupported", () => {
  it("SpeechRecognition / webkitSpeechRecognition 둘 다 없으면 false", async () => {
    const m = await import("../voice-search");
    expect(m.isVoiceSearchSupported()).toBe(false);
  });

  it("standard SpeechRecognition 있으면 true", async () => {
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
      MockSpeechRecognition;
    vi.resetModules();
    const m = await import("../voice-search");
    expect(m.isVoiceSearchSupported()).toBe(true);
  });

  it("webkit prefix 만 있어도 true", async () => {
    (
      window as unknown as { webkitSpeechRecognition: unknown }
    ).webkitSpeechRecognition = MockSpeechRecognition;
    vi.resetModules();
    const m = await import("../voice-search");
    expect(m.isVoiceSearchSupported()).toBe(true);
  });
});

describe("startVoiceRecognition — 옵션 매핑", () => {
  beforeEach(() => {
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
      MockSpeechRecognition;
  });

  it("기본 lang 은 'ko-KR', interimResults 활성", async () => {
    vi.resetModules();
    const m = await import("../voice-search");
    const handle = m.startVoiceRecognition({
      onResult: vi.fn(),
      onError: vi.fn(),
      onEnd: vi.fn(),
    });
    const inst = MockSpeechRecognition.instances[0];
    expect(inst).toBeDefined();
    expect(inst.lang).toBe("ko-KR");
    expect(inst.interimResults).toBe(true);
    expect(inst.continuous).toBe(false);
    expect(inst.startCalls).toBe(1);
    expect(typeof handle.stop).toBe("function");
  });

  it("lang 옵션 'en-US' 가 instance 에 반영", async () => {
    vi.resetModules();
    const m = await import("../voice-search");
    m.startVoiceRecognition({
      lang: "en-US",
      onResult: vi.fn(),
      onError: vi.fn(),
      onEnd: vi.fn(),
    });
    const inst = MockSpeechRecognition.instances[0];
    expect(inst.lang).toBe("en-US");
  });

  it("onResult — interim transcript 흐름 (final=false)", async () => {
    vi.resetModules();
    const m = await import("../voice-search");
    const onResult = vi.fn();
    m.startVoiceRecognition({
      onResult,
      onError: vi.fn(),
      onEnd: vi.fn(),
    });
    const inst = MockSpeechRecognition.instances[0];
    inst.fireResult([{ isFinal: false, transcript: "박찬" }]);
    expect(onResult).toHaveBeenCalledWith("박찬", false);

    inst.fireResult([{ isFinal: true, transcript: "박찬욱" }]);
    expect(onResult).toHaveBeenLastCalledWith("박찬욱", true);
  });

  it("onError — error code 전달, onEnd 별도 호출", async () => {
    vi.resetModules();
    const m = await import("../voice-search");
    const onError = vi.fn();
    const onEnd = vi.fn();
    m.startVoiceRecognition({
      onResult: vi.fn(),
      onError,
      onEnd,
    });
    const inst = MockSpeechRecognition.instances[0];
    inst.fireError("not-allowed");
    expect(onError).toHaveBeenCalledWith("not-allowed");
    inst.fireEnd();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("stop() 호출 시 instance.stop() 호출됨", async () => {
    vi.resetModules();
    const m = await import("../voice-search");
    const handle = m.startVoiceRecognition({
      onResult: vi.fn(),
      onError: vi.fn(),
      onEnd: vi.fn(),
    });
    const inst = MockSpeechRecognition.instances[0];
    expect(inst.stopCalls).toBe(0);
    handle.stop();
    expect(inst.stopCalls).toBe(1);
  });

  it("start() throw 시 onError + onEnd 자동 호출", async () => {
    // throw 하는 ctor mock
    class ThrowingMock extends MockSpeechRecognition {
      constructor() {
        super();
        this.shouldThrowOnStart = true;
      }
    }
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
      ThrowingMock;
    vi.resetModules();
    const m = await import("../voice-search");
    const onError = vi.fn();
    const onEnd = vi.fn();
    m.startVoiceRecognition({
      onResult: vi.fn(),
      onError,
      onEnd,
    });
    expect(onError).toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("ctor 부재 시 throw — 호출자가 isVoiceSearchSupported 가드 필요", async () => {
    delete (window as unknown as { SpeechRecognition?: unknown })
      .SpeechRecognition;
    delete (window as unknown as { webkitSpeechRecognition?: unknown })
      .webkitSpeechRecognition;
    vi.resetModules();
    const m = await import("../voice-search");
    expect(() =>
      m.startVoiceRecognition({
        onResult: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      }),
    ).toThrow();
  });
});
