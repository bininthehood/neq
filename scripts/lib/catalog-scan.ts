/**
 * TMDB Daily Export 스트림 분류 — catalog-sync 의 순수 로직.
 *
 * 스크립트 본체(`scripts/tmdb-catalog-sync.ts`)는 import 시점에 env 검사와 main()
 * 실행이 걸려 있어 테스트가 불가능하다. 판정 로직만 여기로 분리해 셀프체크
 * (`catalog-scan.selfcheck.ts`) 로 검증한다.
 */

export type MediaType = "movie" | "tv";
export type Candidate = {
  tmdb_id: number;
  media_type: MediaType;
  popularity: number;
};

export type ScanResult = {
  scanned: number;
  owned: number;
  candidates: number;
  skipped: number;
  failed: number;
};

export type ScanOptions = {
  mediaType: MediaType;
  /** 미러 보유/예약 작품 키 (`media_type:tmdb_id`) */
  owned: Set<string>;
  popularityMin: number;
  /** 보유 작품의 popularity 갱신 대상이 쌓인다 */
  popUpdates: Candidate[];
  /**
   * 미보유 신규 후보. popularity 상위 `maxCandidates` 개로 유지된다.
   * 호출부가 movie/tv 스캔에 같은 배열을 넘겨 전역 상위를 얻는다.
   */
  newCandidates: Candidate[];
  /**
   * 후보 배열 상한. export 는 하한 통과분만 100만 행대라 전량 보관하면
   * 러너 메모리를 수십 MB 먹는다. 2배까지 모았다가 정렬 후 잘라 상한을 지킨다
   * (매 행 정렬 대신 amortized).
   */
  maxCandidates: number;
};

type ExportRow = { id: number; popularity?: number; adult?: boolean };

/** JSONL 한 줄을 분류해 결과 카운터를 갱신한다. */
export function consumeExportLine(
  line: string,
  opts: ScanOptions,
  result: ScanResult,
): void {
  let row: ExportRow;
  try {
    row = JSON.parse(line);
  } catch {
    result.failed += 1;
    return;
  }
  if (typeof row.id !== "number") {
    result.failed += 1;
    return;
  }
  result.scanned += 1;

  // 성인물은 미러 대상이 아니다. 컬럼으로 저장하지 않고 여기서 거른다.
  if (row.adult) {
    result.skipped += 1;
    return;
  }

  const popularity = typeof row.popularity === "number" ? row.popularity : 0;
  const key = `${opts.mediaType}:${row.id}`;

  if (opts.owned.has(key)) {
    // 보유 작품 — popularity 만 갱신 (행 수 불변). 하한을 적용하지 않는다:
    // 이미 들고 있는 작품의 popularity 가 떨어졌다고 갱신을 건너뛰면
    // 정렬 신호가 낡은 값으로 굳는다.
    opts.popUpdates.push({
      tmdb_id: row.id,
      media_type: opts.mediaType,
      popularity,
    });
    result.owned += 1;
    return;
  }

  if (popularity < opts.popularityMin) {
    result.skipped += 1;
    return;
  }

  opts.newCandidates.push({
    tmdb_id: row.id,
    media_type: opts.mediaType,
    popularity,
  });
  result.candidates += 1;

  if (opts.newCandidates.length >= opts.maxCandidates * 2) {
    opts.newCandidates.sort((a, b) => b.popularity - a.popularity);
    opts.newCandidates.length = opts.maxCandidates;
  }
}

/** gunzip 스트림을 줄 단위로 훑어 분류한다. */
export async function scanExportStream(
  stream: NodeJS.ReadableStream,
  opts: ScanOptions,
): Promise<ScanResult> {
  const result: ScanResult = {
    scanned: 0,
    owned: 0,
    candidates: 0,
    skipped: 0,
    failed: 0,
  };

  let buffer = "";
  for await (const chunk of stream) {
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (line) consumeExportLine(line, opts, result);
    }
  }
  const tail = buffer.trim();
  if (tail) consumeExportLine(tail, opts, result);

  return result;
}
