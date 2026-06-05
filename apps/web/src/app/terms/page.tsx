import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "이용약관 — neq",
  description: "neq 의 서비스 이용약관 — 콘텐츠 출처, 사용자 책임, 면책 사항.",
};

const LAST_UPDATED = "2026-06-05";

export default function TermsOfServicePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-[15px] leading-7 text-neutral-100">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">이용약관</h1>
      <p className="mb-8 text-sm text-neutral-400">최종 갱신일: {LAST_UPDATED}</p>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">1. 서비스 소개</h2>
        <p className="text-neutral-300">
          neq (이하 "서비스") 는 알고리즘 기반 추천 대신 사용자 취향을 직접 입력
          받아 OTT 콘텐츠를 큐레이션하는 모바일 앱이에요. 본 약관은 서비스를
          이용하는 모든 사용자에게 적용돼요.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">2. 동의</h2>
        <p className="text-neutral-300">
          앱을 설치하고 사용하기 시작하면 본 약관과 개인정보처리방침에 동의한
          것으로 간주해요. 동의하지 않으면 앱을 사용하지 말아 주세요.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">3. 콘텐츠 출처</h2>
        <p className="mb-3 text-neutral-300">
          서비스에 노출되는 모든 영화·드라마·예능 메타데이터 (포스터, 줄거리, 출연진,
          평점 등) 는{" "}
          <strong className="text-neutral-100">
            TMDB (The Movie Database)
          </strong>{" "}
          의 공개 API 를 통해 제공받아요.
        </p>
        <ul className="ml-4 list-disc space-y-1 text-neutral-300">
          <li>
            본 서비스는 TMDB API 를 사용하지만 TMDB 의 인증이나 검토를 받은 것은
            아니에요.
          </li>
          <li>
            TMDB 의 데이터 라이선스 (CC BY-SA 4.0 / TMDB API Terms of Use) 를 준수해요.
          </li>
          <li>
            OTT 가용성 정보는 JustWatch 등 외부 데이터 제공자로부터 TMDB 를 거쳐
            수집된 것으로, 실제 OTT 서비스의 콘텐츠 변경과 시차가 있을 수 있어요.
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">4. 서비스 이용 규칙</h2>
        <p className="mb-3 text-neutral-300">
          서비스를 정상적으로 운영하기 위해 사용자는 아래 행위를 하지 말아 주세요.
        </p>
        <ul className="ml-4 list-disc space-y-1 text-neutral-300">
          <li>자동화 도구·스크립트·봇을 이용해 API 를 호출하거나 데이터를 대량 수집</li>
          <li>서비스의 보안 메커니즘 우회·해킹·역공학</li>
          <li>다른 사용자나 제3자의 권리 침해, 불법·유해 콘텐츠 게시</li>
          <li>서비스를 통해 얻은 데이터를 상업적으로 재판매·재배포</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">5. 지적재산권</h2>
        <p className="mb-2 text-neutral-300">
          서비스의 UI 디자인, 로고, 워드마크, 자체 제작 콘텐츠는 운영자의 자산이에요.
          TMDB 에서 제공되는 작품 메타데이터·이미지는 각 권리자의 자산이며 TMDB
          라이선스 조건에 따라 표시돼요.
        </p>
        <p className="text-neutral-300">
          사용자는 개인적·비상업적 용도로 서비스를 이용할 수 있어요.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">6. 면책 사항</h2>
        <ul className="ml-4 list-disc space-y-2 text-neutral-300">
          <li>
            서비스는 "있는 그대로" 제공돼요. 추천 결과의 정확성·완전성·시기적절성에
            대한 보증을 하지 않아요.
          </li>
          <li>
            OTT 가용성 정보의 정확성은 보증할 수 없어요. 실제 시청 가능 여부는
            해당 OTT 서비스에서 직접 확인해 주세요.
          </li>
          <li>
            서비스 중단·데이터 손실·기대 이익 손실에 대해 운영자는 법적으로 허용된
            범위 내에서 책임을 지지 않아요.
          </li>
          <li>
            본 서비스는 베타 단계에 있을 수 있으며, 기능·UI·약관이 사전 공지 없이
            변경될 수 있어요.
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">7. 서비스 변경·종료</h2>
        <p className="text-neutral-300">
          운영자는 사전 공지 후 서비스의 일부 또는 전부를 변경·중단·종료할 수 있어요.
          중대한 변경 시 앱 안 공지나 본 페이지 상단의 최종 갱신일로 알려요.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">8. 약관 변경</h2>
        <p className="text-neutral-300">
          본 약관의 중요한 변경 시 앱 안 공지로 알리고, 사용자가 변경 이후 서비스를
          계속 이용하는 경우 변경에 동의한 것으로 간주해요. 동의하지 않으면 앱을
          삭제해 주세요.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">9. 분쟁 해결</h2>
        <p className="text-neutral-300">
          본 약관과 관련된 분쟁은 대한민국 법령을 준거법으로 하며, 서울중앙지방법원을
          1심 관할 법원으로 해요.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">10. 연락처</h2>
        <p className="text-neutral-300">
          서비스 문의:{" "}
          <a
            href="mailto:dusgod30@gmail.com"
            className="text-amber-400 underline-offset-2 hover:underline"
          >
            dusgod30@gmail.com
          </a>
        </p>
      </section>

      <hr className="my-8 border-neutral-800" />

      <p className="text-sm text-neutral-500">
        이 페이지는 한국어 본문이 정본이에요. 영문 번역은 참고용으로 제공될 수 있어요.
      </p>
    </main>
  );
}
