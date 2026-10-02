import Link from "next/link";
import meta from "../../public/bundles/v1/meta.json";
import { HeroArt } from "@/components/HeroArt";
import { Icon, type IconName } from "@/components/Icon";
import { ResumeBanner } from "@/components/ResumeBanner";
import { PresetButtons } from "@/components/PresetButtons";
import { TIER_PLAIN } from "@/lib/client/howto";

const n = (v: number) => v.toLocaleString("ko-KR");

/** 대상별 바로가기 → 검색 필터 */
const QUICK: { label: string; icon: IconName; href: string }[] = [
  { label: "임신·출산", icon: "stroller", href: "/search?life=pregnancy" },
  { label: "영유아", icon: "baby", href: "/search?life=infant" },
  { label: "아동·청소년", icon: "backpack", href: "/search?life=child,teen" },
  { label: "청년", icon: "graduation", href: "/search?life=youth" },
  { label: "중장년", icon: "briefcase", href: "/search?life=middle" },
  { label: "어르신", icon: "senior", href: "/search?life=senior" },
  { label: "장애인", icon: "accessibility", href: "/search?house=disabled" },
  { label: "한부모·조손", icon: "family", href: "/search?house=singleparent" },
];

export default function Home() {
  const c = meta.counts;
  return (
    <>
      <section className="hero" aria-labelledby="hero-h">
        <div className="wrap hero-grid">
          <div>
            <p className="eyebrow">로그인·주민등록번호 없이</p>
            <h1 id="hero-h">
              <em>내 조건</em>으로 받을 수 있는
              <br />
              복지 서비스를 찾아 드려요
            </h1>
            <p className="lead">
              중앙정부·시도·시군구·공공기관 서비스 {n(c.uniquePrograms)}개 가운데, 직접 신청해야 받을 수 있는 것을 이유와 함께 알려 드립니다.
            </p>
            <form action="/search" role="search" className="hero-search">
              <label htmlFor="home-q" className="sr-only">
                서비스 이름으로 찾기
              </label>
              <input id="home-q" name="q" type="search" placeholder="서비스 이름이나 낱말로 찾기 (예: 기초연금)" autoComplete="off" />
              <button type="submit" aria-label="검색">
                <Icon name="search" size={22} strokeWidth={2.2} />
              </button>
            </form>
            <p className="hero-keys">
              <span>많이 찾는 말</span>
              <Link href="/search?q=기초연금">기초연금</Link>
              <Link href="/search?q=에너지바우처">에너지바우처</Link>
              <Link href="/search?q=월세">월세</Link>
              <Link href="/search?q=돌봄">돌봄</Link>
            </p>
            <div className="hero-cta">
              <Link href="/check" className="btn btn-primary btn-lg" data-testid="start">
                맞춤 찾기 시작 <Icon name="arrowRight" size={20} strokeWidth={2.2} />
              </Link>
              <span className="small muted">질문 12개 · 약 3분 · 모르는 항목은 &lsquo;모름&rsquo;</span>
            </div>
            <ResumeBanner />
          </div>
          <HeroArt />
        </div>
      </section>

      <section className="band" aria-labelledby="quick-h">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <h2 className="h2" id="quick-h">
                대상별 바로가기
              </h2>
              <p>해당하는 대상을 고르면 관련 서비스를 모아 보여 드립니다.</p>
            </div>
            <Link href="/search">전체 서비스 검색</Link>
          </div>
          <ul className="quick">
            {QUICK.map((q) => (
              <li key={q.label}>
                <Link href={q.href}>
                  <span className="q-ic" aria-hidden="true">
                    <Icon name={q.icon} size={30} strokeWidth={1.7} />
                  </span>
                  {q.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="band band-gray" aria-labelledby="ex-h">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <h2 className="h2" id="ex-h">
                예시 상황으로 먼저 보기
              </h2>
              <p>입력 없이 결과 화면을 미리 볼 수 있어요. 실제 개인 정보가 아닌 예시이며, 결과 화면에서 내 상황으로 다시 입력할 수 있습니다.</p>
            </div>
          </div>
          <PresetButtons />
        </div>
      </section>

      <section className="band" aria-labelledby="how-h">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <h2 className="h2" id="how-h">
                이렇게 찾아 드려요
              </h2>
              <p>입력한 내용은 서버로 보내지 않고 이 기기 안에서만 판정합니다.</p>
            </div>
          </div>
          <ol className="howto">
            <li>
              <span className="n">1</span>
              <h3>사는 곳과 상황 입력</h3>
              <p>지역, 나이, 가구, 받고 있는 지원 등 12가지. 모르면 건너뛰어도 됩니다.</p>
            </li>
            <li>
              <span className="n">2</span>
              <h3>공개된 조건과 비교</h3>
              <p>정부24·복지로의 지원 대상 조건과 입력 내용을 이 기기에서 비교합니다.</p>
            </li>
            <li>
              <span className="n">3</span>
              <h3>먼저 신청할 것 확인</h3>
              <p>내 상황과 가장 관련 깊은 5가지와 어디서·어떻게 신청하는지 알려 드립니다.</p>
            </li>
          </ol>
          <dl className="tiers3">
            <div>
              <dt className="status tier-eligible">조건 충족</dt>
              <dd>{TIER_PLAIN.eligible}</dd>
            </div>
            <div>
              <dt className="status tier-likely">가능성 있음</dt>
              <dd>{TIER_PLAIN.likely}</dd>
            </div>
            <div>
              <dt className="status">확인 필요</dt>
              <dd>{TIER_PLAIN.check}</dd>
            </div>
          </dl>
          <p className="facts-line">
            <span>
              중앙부처·청 <b>{n(c.byOrg.central)}</b>
            </span>
            <span>
              시도·시군구 <b>{n(c.byOrg.metro + c.byOrg.local)}</b>
            </span>
            <span>
              공공기관 <b>{n(c.byOrg.public_inst)}</b>
            </span>
            <span>
              경기도는 시범 지역으로 규칙을 먼저 검수합니다. <Link href="/about">데이터 출처와 기준일</Link>
            </span>
          </p>
        </div>
      </section>
    </>
  );
}
