import Link from "next/link";
import meta from "../../public/bundles/v1/meta.json";
import { TierBadge } from "@/components/Badges";
import { ResumeBanner } from "@/components/ResumeBanner";
import { PresetButtons } from "@/components/PresetButtons";

const n = (v: number) => v.toLocaleString("ko-KR");

export default function Home() {
  const c = meta.counts;
  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <span className="hero-tag">
              <span className="dot">로그인 없이</span> 이름·주민번호 없이 바로 찾기
            </span>
            <h1>
              흩어진 복지,
              <br />
              <span className="hl">내 조건</span>으로 한 번에
            </h1>
            <p className="hero-sub">
              중앙정부·시도·시군구·공공기관 서비스 {n(c.uniquePrograms)}개 가운데, 12개 간단한 질문으로 받을 수 있을 만한 것을 이유와 함께
              찾아드려요.
            </p>
            <div className="btn-row" style={{ marginTop: 26 }}>
              <Link href="/check" className="btn btn-primary btn-lg" data-testid="start">
                3분 만에 맞춤 찾기 →
              </Link>
              <Link href="/search" className="btn btn-ghost btn-lg">
                서비스 이름으로 찾기
              </Link>
            </div>
            <ul className="hero-points">
              <li>로그인·회원가입 없음</li>
              <li>모르는 항목은 &lsquo;모름&rsquo;</li>
              <li>입력값은 내 기기에만</li>
            </ul>
            <ResumeBanner />
          </div>
          <div className="card pad">
            <h2 style={{ fontSize: "1.15rem", fontWeight: 800 }}>결과는 세 가지로 나눠 보여드려요</h2>
            <div className="tier-explain" style={{ marginTop: 14 }}>
              <div className="row">
                <TierBadge tier="eligible" />
                <p>입력하신 정보로 검수된 자격 조건을 모두 충족해요.</p>
              </div>
              <div className="row">
                <TierBadge tier="likely" />
                <p>맞는 조건이 있지만, 확인이 더 필요한 조건이 남아 있어요.</p>
              </div>
              <div className="row">
                <TierBadge tier="check" />
                <p>상담·심사로 판단하거나 조건 정보가 부족해요. 신청처에서 확인하세요.</p>
              </div>
            </div>
            <p className="small muted" style={{ marginTop: 14 }}>
              모든 결과에 &lsquo;왜 그렇게 판단했는지&rsquo;와 원문 출처·기준일을 함께 표시합니다. 최종 자격은 담당 기관이 결정합니다.
            </p>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="ex-h" style={{ paddingBottom: 8 }}>
        <div className="wrap">
          <h2 id="ex-h">예시 상황으로 먼저 둘러보기</h2>
          <p className="muted" style={{ marginTop: 6 }}>
            입력 없이 한 번에 결과를 볼 수 있는 데모용 <strong>예시</strong>예요. 실제 개인 정보가 아니며, 결과 화면에서 내 상황으로 다시 입력할 수 있어요.
          </p>
          <PresetButtons />
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <form action="/search" className="card pad" role="search">
            <label htmlFor="home-q">
              <h2>이미 아는 서비스가 있나요?</h2>
            </label>
            <div className="search-box">
              <input id="home-q" name="q" type="search" placeholder="예: 기초연금, 에너지바우처, 산후조리" autoComplete="off" />
              <button type="submit" className="btn btn-primary">
                검색
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <h2>지금 담겨 있는 서비스</h2>
          <div className="grid-3" style={{ marginTop: 14 }}>
            <div className="card pad">
              <div className="stat">{n(c.byOrg.central)}</div>
              <p>
                <strong>중앙부처·청</strong> 전국 공통 서비스
              </p>
            </div>
            <div className="card pad">
              <div className="stat">{n(c.byOrg.metro + c.byOrg.local)}</div>
              <p>
                <strong>시도·시군구</strong> 자체 서비스 (전국 17개 시도)
              </p>
            </div>
            <div className="card pad">
              <div className="stat">{n(c.byOrg.public_inst)}</div>
              <p>
                <strong>공공기관</strong> 운영 서비스 (공단·센터 등)
              </p>
            </div>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>
            경기도는 시범 지역으로 규칙 검수를 먼저 진행합니다. 다른 지역도 검색은 모두 되지만, 대부분 &lsquo;가능성 있음&rsquo;·&lsquo;확인
            필요&rsquo;로 안내됩니다. <Link href="/about">데이터 출처와 기준일 보기</Link>
          </p>
        </div>
      </section>
    </>
  );
}
