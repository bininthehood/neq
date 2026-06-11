import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침 — neq",
  description:
    "neq 는 익명 사용자 식별만 사용하며 개인 식별 정보를 수집하지 않아요.",
};

const LAST_UPDATED = "2026-06-05";

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-[15px] leading-7 text-neutral-100">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">
        개인정보처리방침
      </h1>
      <p className="mb-8 text-sm text-neutral-400">
        최종 갱신일: {LAST_UPDATED}
      </p>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">1. 한눈에 보기</h2>
        <ul className="ml-4 list-disc space-y-1">
          <li>회원가입 없음 — 익명 사용자 식별자만 사용해요.</li>
          <li>개인을 식별할 수 있는 정보 (이름·이메일·전화번호 등) 는 수집하지 않아요.</li>
          <li>광고·마케팅·제3자 트래킹 목적의 데이터 전송이 없어요.</li>
          <li>저장된 취향 데이터는 디바이스 reset 또는 앱 삭제로 즉시 폐기할 수 있어요.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">2. 수집하는 데이터</h2>
        <p className="mb-3">
          neq 는 서비스 운영과 추천 품질 개선을 위해 아래 범주의 데이터를 수집해요.
        </p>
        <h3 className="mb-1 mt-3 font-medium">2.1 익명 식별자 (Identifiers)</h3>
        <p className="mb-2 text-neutral-300">
          PostHog 분석 도구가 생성하는 익명 디바이스 ID (distinct_id). 사용자
          이름·이메일과 연결되지 않아요.
        </p>
        <h3 className="mb-1 mt-3 font-medium">2.2 사용 데이터 (Usage Data)</h3>
        <p className="mb-2 text-neutral-300">
          앱 안에서 발생하는 동작 이벤트 (추천 요청, 카드 스와이프, 작품 저장, 화면
          전환 등). 어떤 작품을 어떤 방식으로 탐색했는지의 패턴만 기록해요.
        </p>
        <h3 className="mb-1 mt-3 font-medium">2.3 사용자 콘텐츠 (User Content)</h3>
        <p className="mb-2 text-neutral-300">
          사용자가 직접 입력한 취향 데이터 — 선호 장르, 즐겨찾는 작품, 시청 리포트,
          취향 설문 응답. 디바이스 단위로 익명 저장되며 다른 사용자와 공유되지
          않아요.
        </p>
        <h3 className="mb-1 mt-3 font-medium">2.4 수집하지 않는 데이터</h3>
        <p className="mb-2 text-neutral-300">
          이름, 이메일, 전화번호, 주소, 결제 정보, 정확한 위치, 연락처, 사진,
          마이크/카메라 입력, 광고 ID — 모두 수집하지 않아요.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">3. 데이터를 사용하는 목적</h2>
        <ul className="ml-4 list-disc space-y-1 text-neutral-300">
          <li>매일 한 작품 큐레이션 추천을 사용자 취향에 맞게 생성</li>
          <li>저장·아카이브·시청 리포트 등 앱 기능 동작</li>
          <li>버그·크래시 진단과 서비스 안정성 개선</li>
          <li>추천 품질 측정과 알고리즘 개선 (집계 통계 기반)</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">4. 제3자 서비스 (처리위탁)</h2>
        <p className="mb-3 text-neutral-300">
          neq 는 아래 서비스에 데이터 처리를 위탁해요. 각 위탁사는 위탁받은 업무
          범위 내에서만 데이터를 처리하며, 자체 개인정보처리방침을 따라요. 본
          서비스는 위탁 외 별도 목적의 제3자 제공을 하지 않아요.
        </p>
        <ul className="ml-4 list-disc space-y-2 text-neutral-300">
          <li>
            <strong className="text-neutral-100">TMDB (The Movie Database)</strong> —
            영화·드라마 메타데이터 (포스터, 줄거리, 출연진 등) 제공. 사용자 데이터는
            전송하지 않아요. 본 제품은{" "}
            <strong className="text-neutral-100">Powered by TMDB</strong> 이며, TMDB
            API 를 사용하지만 TMDB 의 인증이나 검토를 받은 것은 아니에요.
          </li>
          <li>
            <strong className="text-neutral-100">PostHog</strong> — 익명 사용 이벤트
            분석 위탁.
          </li>
          <li>
            <strong className="text-neutral-100">Supabase</strong> — 익명 사용자
            데이터 (취향·저장) 보관 위탁. 디바이스 단위 격리.
          </li>
          <li>
            <strong className="text-neutral-100">Vercel</strong> — 웹/API 서버 호스팅
            인프라 위탁.
          </li>
          <li>
            <strong className="text-neutral-100">OpenAI</strong> — 추천 생성용 LLM
            위탁. 요청 시 사용자 취향 요약과 후보 작품 목록만 전송. 익명 식별자는
            보내지 않아요.
          </li>
        </ul>
        <p className="mt-3 text-neutral-300">
          각 위탁사는 본 처리방침과 동등 또는 더 강한 수준의 개인정보 보호 의무를
          부담해요.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">5. 개인정보 국외 이전</h2>
        <p className="mb-3 text-neutral-300">
          위 위탁사의 데이터센터 일부는 국외에 위치해요. 국외 이전 항목은 아래
          표와 같아요.
        </p>
        <div className="overflow-x-auto">
          <table className="mb-3 w-full border-collapse text-sm text-neutral-300">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-100">
                <th className="py-2 pr-3 text-left font-medium">이전받는 자</th>
                <th className="py-2 pr-3 text-left font-medium">이전 국가</th>
                <th className="py-2 pr-3 text-left font-medium">이전 항목</th>
                <th className="py-2 pr-3 text-left font-medium">이전 방법</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-neutral-900">
                <td className="py-2 pr-3">PostHog Inc.</td>
                <td className="py-2 pr-3">미국</td>
                <td className="py-2 pr-3">익명 distinct_id, 사용 이벤트</td>
                <td className="py-2 pr-3">HTTPS 전송</td>
              </tr>
              <tr className="border-b border-neutral-900">
                <td className="py-2 pr-3">Supabase Inc.</td>
                <td className="py-2 pr-3">미국</td>
                <td className="py-2 pr-3">익명 사용자 콘텐츠 (취향·저장)</td>
                <td className="py-2 pr-3">HTTPS 전송</td>
              </tr>
              <tr className="border-b border-neutral-900">
                <td className="py-2 pr-3">Vercel Inc.</td>
                <td className="py-2 pr-3">미국</td>
                <td className="py-2 pr-3">서버 요청 로그</td>
                <td className="py-2 pr-3">HTTPS 전송</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">OpenAI L.L.C.</td>
                <td className="py-2 pr-3">미국</td>
                <td className="py-2 pr-3">취향 요약, 후보 작품 목록 (익명)</td>
                <td className="py-2 pr-3">HTTPS 전송</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-neutral-300">
          이전 일시는 서비스 이용 시점이며, 보유 기간은 각 위탁사의 정책 또는 본
          처리방침 § 6 의 보존 기간을 따라요. 국외 이전에 동의하지 않으시면 앱
          이용이 어려워요 — 그 경우 앱 삭제로 동의를 철회할 수 있어요.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">6. 데이터 보존 기간</h2>
        <ul className="ml-4 list-disc space-y-1 text-neutral-300">
          <li>사용자 콘텐츠 (취향·저장): 디바이스에 영구 보관 — reset/삭제 즉시 폐기</li>
          <li>분석 이벤트 (PostHog): 1년 후 자동 삭제</li>
          <li>서버 로그: 90일 후 자동 삭제</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">7. 사용자 권리</h2>
        <p className="mb-3 text-neutral-300">
          익명 사용자라 별도 인증 절차 없이 본인 디바이스 안에서 다음을 직접 할 수 있어요.
        </p>
        <ul className="ml-4 list-disc space-y-1 text-neutral-300">
          <li><strong>데이터 삭제</strong> — 프로필 → "모든 데이터 초기화" 또는 앱 삭제</li>
          <li><strong>데이터 접근</strong> — 앱 안에서 저장·취향·시청 리포트 모두 직접 조회 가능</li>
          <li><strong>수정</strong> — 취향 언제든 재설정 가능</li>
          <li><strong>처리정지 요구</strong> — 아래 연락처로 요청 시 처리 정지 가능</li>
        </ul>
        <p className="mt-3 text-neutral-300">
          분석 이벤트 (PostHog) 의 본인 데이터 삭제를 원하시면 아래 연락처로 디바이스
          ID 를 알려주세요. 30일 이내 처리해요. EU 거주자는 추가로 데이터 이동권,
          반대권, 처리제한권을 갖아요 — 동일 연락처로 요청 가능해요.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">8. 어린이 보호</h2>
        <p className="text-neutral-300">
          neq 는 만 14세 이상 사용자를 대상으로 해요. 만 14세 미만 사용자의 데이터는
          의도적으로 수집하지 않으며, 발견 시 즉시 삭제해요.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">9. 보안</h2>
        <p className="text-neutral-300">
          모든 데이터 전송은 HTTPS 로 암호화돼요. Supabase 의 익명 사용자 데이터는
          Row Level Security (RLS) 로 디바이스 단위 격리해요. 운영 데이터 접근은
          최소 인원으로 제한하며, 위탁사 (Supabase / Vercel 등) 의 데이터센터
          물리적 보안 표준을 준수해요. 그럼에도 인터넷 전송의 완전한 보안은 보장할
          수 없어요.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">10. 자동수집장치 안내</h2>
        <p className="mb-3 text-neutral-300">
          neq 는 서비스 운영과 분석을 위해 아래 자동수집장치를 사용해요.
        </p>
        <ul className="ml-4 list-disc space-y-2 text-neutral-300">
          <li>
            <strong className="text-neutral-100">웹 (PWA) — localStorage / sessionStorage</strong>
            : 익명 디바이스 ID, 온보딩 진행 상태, 취향·저장 데이터 보관
          </li>
          <li>
            <strong className="text-neutral-100">네이티브 앱 — AsyncStorage</strong>:
            동일 목적의 디바이스 안 데이터 보관
          </li>
          <li>
            <strong className="text-neutral-100">PostHog SDK</strong>: 익명 이벤트
            전송용 식별자 저장
          </li>
        </ul>
        <p className="mt-3 text-neutral-300">
          <strong>거부 방법</strong> — 브라우저 설정에서 사이트 데이터 차단 또는
          앱 삭제로 모든 자동수집장치 데이터가 제거돼요. 차단 시 추천·저장·취향
          기능이 동작하지 않을 수 있어요.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">11. 방침 변경</h2>
        <p className="text-neutral-300">
          본 방침의 중요한 변경 시 앱 안 공지와 본 페이지 상단의 최종 갱신일로 알려요.
          변경 후에도 서비스를 계속 사용하시는 경우 변경에 동의한 것으로 간주해요.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">12. 연락처 및 개인정보 보호책임자</h2>
        <div className="rounded border border-neutral-800 bg-neutral-900/50 p-4 text-neutral-300">
          <p className="mb-1">
            <strong className="text-neutral-100">개인정보 보호책임자</strong>
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li>성명: 운영자 [출시 직전 본명 또는 사업자명 기재]</li>
            <li>직책: 대표 / 운영자</li>
            <li>
              이메일:{" "}
              <a
                href="mailto:dusgod30@gmail.com"
                className="text-amber-400 underline-offset-2 hover:underline"
              >
                dusgod30@gmail.com
              </a>
            </li>
          </ul>
        </div>
        <p className="mt-3 text-neutral-300">
          개인정보 관련 일반 문의는 위 이메일로 보내주세요. 30일 이내 답변드려요.
          분쟁 발생 시 한국인터넷진흥원 (KISA) 의 개인정보침해신고센터 (privacy.kisa.or.kr,
          국번 없이 118) 에도 신고할 수 있어요.
        </p>
      </section>

      <hr className="my-8 border-neutral-800" />

      <p className="text-sm text-neutral-500">
        이 페이지는 한국어 본문이 정본이에요. 영문 번역은 참고용으로 제공될 수 있어요.
      </p>
    </main>
  );
}
