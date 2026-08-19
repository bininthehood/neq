/**
 * catalog-scan 셀프체크 — `npx tsx scripts/lib/catalog-scan.selfcheck.ts`
 *
 * 2026-08-17 용량 사고의 원인이 "무엇을 받아들일지" 판정이 없었던 것이므로,
 * 그 판정을 여기서 고정한다. 외부 의존 없음 (네트워크·DB 미사용).
 */
import { strict as assert } from "node:assert";
import { Readable } from "node:stream";
import {
  consumeExportLine,
  scanExportStream,
  type Candidate,
  type ScanOptions,
  type ScanResult,
} from "./catalog-scan";

function emptyResult(): ScanResult {
  return { scanned: 0, owned: 0, candidates: 0, skipped: 0, failed: 0 };
}

function makeOpts(owned: string[] = []): {
  opts: ScanOptions;
  popUpdates: Candidate[];
  newCandidates: Candidate[];
} {
  const popUpdates: Candidate[] = [];
  const newCandidates: Candidate[] = [];
  return {
    opts: {
      mediaType: "movie",
      owned: new Set(owned),
      popularityMin: 1.0,
      popUpdates,
      newCandidates,
      maxCandidates: 1000,
    },
    popUpdates,
    newCandidates,
  };
}

// 1. 보유 작품은 popularity 하한과 무관하게 갱신 대상
{
  const { opts, popUpdates, newCandidates } = makeOpts(["movie:100"]);
  const r = emptyResult();
  consumeExportLine('{"id":100,"popularity":0.2}', opts, r);
  assert.equal(r.owned, 1, "보유 작품은 owned 로 집계");
  assert.equal(popUpdates.length, 1);
  assert.equal(popUpdates[0].popularity, 0.2, "하한 미만이어도 갱신");
  assert.equal(newCandidates.length, 0, "보유 작품은 신규 후보 아님");
}

// 2. 미보유 + 하한 이상 → 신규 후보
{
  const { opts, newCandidates } = makeOpts();
  const r = emptyResult();
  consumeExportLine('{"id":200,"popularity":5.5}', opts, r);
  assert.equal(r.candidates, 1);
  assert.deepEqual(newCandidates[0], {
    tmdb_id: 200,
    media_type: "movie",
    popularity: 5.5,
  });
}

// 3. 미보유 + 하한 미만 → 제외 (이게 없어서 140만 행이 쌓였다)
{
  const { opts, newCandidates } = makeOpts();
  const r = emptyResult();
  consumeExportLine('{"id":300,"popularity":0.4}', opts, r);
  assert.equal(r.skipped, 1);
  assert.equal(newCandidates.length, 0);
}

// 4. 성인물은 보유 여부와 무관하게 제외
{
  const { opts, popUpdates, newCandidates } = makeOpts(["movie:400"]);
  const r = emptyResult();
  consumeExportLine('{"id":400,"popularity":9.9,"adult":true}', opts, r);
  consumeExportLine('{"id":401,"popularity":9.9,"adult":true}', opts, r);
  assert.equal(r.skipped, 2);
  assert.equal(popUpdates.length, 0);
  assert.equal(newCandidates.length, 0);
}

// 5. popularity 누락 → 0 취급 → 신규는 제외
{
  const { opts, newCandidates } = makeOpts();
  const r = emptyResult();
  consumeExportLine('{"id":500}', opts, r);
  assert.equal(r.skipped, 1);
  assert.equal(newCandidates.length, 0);
}

// 6. 깨진 줄 / id 누락 → failed, 스캔 중단 없음
{
  const { opts } = makeOpts();
  const r = emptyResult();
  consumeExportLine("{not json", opts, r);
  consumeExportLine('{"popularity":9}', opts, r);
  assert.equal(r.failed, 2);
  assert.equal(r.scanned, 0);
}

// 7. 후보 상한 — 2배까지 모았다가 상위 K 만 남긴다 (메모리 bound)
{
  const { opts, newCandidates } = makeOpts();
  opts.maxCandidates = 3;
  const r = emptyResult();
  // popularity 1..10 을 오름차순으로 주입 — 상한 초과 시 상위만 남아야 한다
  for (let i = 1; i <= 10; i++) {
    consumeExportLine(`{"id":${1000 + i},"popularity":${i}}`, opts, r);
  }
  assert.equal(r.candidates, 10, "후보 카운트는 본 만큼 증가");
  assert.ok(
    newCandidates.length <= opts.maxCandidates * 2,
    `배열이 상한의 2배를 넘지 않음 (실제 ${newCandidates.length})`,
  );
  newCandidates.sort((a, b) => b.popularity - a.popularity);
  assert.deepEqual(
    newCandidates.slice(0, 3).map((c) => c.popularity),
    [10, 9, 8],
    "상위 popularity 가 살아남음",
  );
}

// 8. 스트림 — 청크가 줄 중간에서 잘려도 복원되고, 마지막 줄에 개행이 없어도 처리
// (tsx 가 cjs 로 내보내 최상위 await 을 못 쓰므로 함수로 감싼다)
async function streamCase(): Promise<void> {
  const { opts, popUpdates, newCandidates } = makeOpts(["movie:1"]);
  const chunks = [
    '{"id":1,"popula',
    'rity":3}\n{"id":2,"popularity":7}\n',
    '{"id":3,"popularity":0.1}\n{"id":4,"popularity":8}',
  ];
  const r = await scanExportStream(Readable.from(chunks), opts);
  assert.equal(r.scanned, 4);
  assert.equal(r.owned, 1, "id=1 은 보유");
  assert.equal(r.candidates, 2, "id=2, id=4");
  assert.equal(r.skipped, 1, "id=3 은 하한 미만");
  assert.equal(popUpdates.length, 1);
  assert.deepEqual(
    newCandidates.map((c) => c.tmdb_id).sort((a, b) => a - b),
    [2, 4],
    "개행 없는 마지막 줄도 처리",
  );
}

streamCase()
  .then(() => console.log("[catalog-scan.selfcheck] 8개 케이스 통과 ✅"))
  .catch((err) => {
    console.error("[catalog-scan.selfcheck] 실패:", err);
    process.exit(1);
  });
