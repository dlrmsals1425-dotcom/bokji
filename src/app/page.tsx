import Link from "next/link";
import meta from "../../public/bundles/v1/meta.json";
import { HeroArt } from "@/components/HeroArt";
import { Icon, type IconName } from "@/components/Icon";
import { ResumeBanner } from "@/components/ResumeBanner";
import { PresetButtons } from "@/components/PresetButtons";
import { HomeSearch } from "@/components/HomeSearch";
import { MODE_ENTRY } from "@/lib/client/mode";

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
              <em>내 조건</em>으로, 또는
              <br />
              <em>부모님 대신</em> 복지를 찾아 드려요
            </h1>
            <p className="lead">
              중앙정부·시도·시군구·공공기관 서비스 {n(c.uniquePrograms)}개 가운데, 직접 신청해야 받을 수 있는 것을 이유와 함께 알려 드립니다.
              30·40대에게는 본인보다 부모님 돌봄·장애 관련 지원을 대신 알아보는 길이 더 유용할 때가 많아요.
            </p>
            <HomeSearch />
            <p className="hero-keys">
              <span>많이 찾는 말</span>
              <Link href="/search?q=기초연금">기초연금</Link>
              <Link href="/search?q=노인맞춤돌봄">노인맞춤돌봄</Link>
              <Link href="/search?q=장기요양">장기요양</Link>
              <Link href="/search?q=돌봄">돌봄</Link>
            </p>
            <div className="path-choice" role="group" aria-label="찾기 대상 고르기">
              <Link href={MODE_ENTRY.self.href} className="path-card" data-testid="start-self">
                <span className="path-ic" aria-hidden="true">
                  <Icon name="users" size={28} strokeWidth={1.7} />
                </span>
                <span className="path-t">{MODE_ENTRY.self.title}</span>
                <span className="path-d">{MODE_ENTRY.self.desc}</span>
                <span className="path-go">
                  시작하기 <Icon name="arrowRight" size={18} strokeWidth={2.2} />
                </span>
              </Link>
              <Link href={MODE_ENTRY.parent.href} className="path-card path-parent" data-testid={MODE_ENTRY.parent.testId}>
                <span className="path-ic" aria-hidden="true">
                  <Icon name="heart" size={28} strokeWidth={1.7} />
                </span>
                <span className="path-t">{MODE_ENTRY.parent.title}</span>
                <span className="path-d">{MODE_ENTRY.parent.desc}</span>
                <span className="path-go">
                  대신 알아보기 <Icon name="arrowRight" size={18} strokeWidth={2.2} />
                </span>
              </Link>
            </div>
            <p className="small muted" style={{ marginTop: "0.75rem" }}>
              한 화면 질문 12개 안팎 · 약 2분 · 사는 곳만 필수, 나머지는 &lsquo;모름&rsquo;이어도 돼요
            </p>
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
              <p>
                입력 없이 결과 화면을 미리 볼 수 있어요. 실제 개인 정보가 아닌 예시이며, &lsquo;부모님 돌보기&rsquo;는 자녀가 대신 알아보는 경로입니다.
              </p>
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
              <h3>상황 먼저 알려주기</h3>
              <p>사는 곳과 나이·가구·소득·지원 등 아는 만큼만. 모르는 것은 결과 화면에서 꼭 필요한 것만 다시 물어요.</p>
            </li>
            <li>
              <span className="n">2</span>
              <h3>맞지 않는 혜택은 빼기</h3>
              <p>정부24·복지로의 지원 대상 조건과 답을 이 기기에서 비교해, 상황과 다른 혜택은 이유와 함께 접어 둡니다.</p>
            </li>
            <li>
              <span className="n">3</span>
              <h3>먼저 신청할 것 확인</h3>
              <p>가장 관련 깊은 5가지와 어디서·어떻게 신청하는지, 가족이 대신 낼 수 있는지도 안내합니다.</p>
            </li>
          </ol>
          <dl className="tiers3">
            <div>
              <dt className="status tier-eligible">받으실 수 있어요</dt>
              <dd>답하신 상황으로 공개된 조건이 모두 맞아요.</dd>
            </div>
            <div>
              <dt className="status tier-likely">신청할 때 확인</dt>
              <dd>어긋나는 조건은 없고, 원문의 세부 조건 한두 가지를 신청처에서 확인해요.</dd>
            </div>
            <div>
              <dt className="status">답하면 정해져요</dt>
              <dd>&lsquo;모름&rsquo;으로 둔 질문 하나에 답하면 바로 갈려요.</dd>
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
