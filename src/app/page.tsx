import Link from "next/link";
import meta from "../../public/bundles/v1/meta.json";
import { Icon } from "@/components/Icon";
import { ResumeBanner } from "@/components/ResumeBanner";
import { PresetButtons } from "@/components/PresetButtons";
import { TIER_PLAIN } from "@/lib/client/howto";

const n = (v: number) => v.toLocaleString("ko-KR");

export default function Home() {
  const c = meta.counts;
  return (
    <div className="page">
      <div className="wrap layout">
        <div>
          <h1 className="h1">내 조건으로 받을 수 있는 복지 서비스 찾기</h1>
          <p className="lead">사는 곳과 몇 가지 상황을 알려 주시면, 직접 신청해야 받을 수 있는 복지 서비스를 찾아 드립니다.</p>
          <p className="body">이 서비스로 할 수 있는 일:</p>
          <ul className="bullets">
            <li>중앙정부·시도·시군구·공공기관의 복지 서비스 {n(c.uniquePrograms)}개 가운데 내 상황에 맞는 것 찾기</li>
            <li>왜 해당하는지, 어디서 어떻게 신청하는지, 무엇을 가져가야 하는지 확인하기</li>
            <li>결과를 인쇄하거나 가족에게 보내기</li>
          </ul>
          <p style={{ margin: "2rem 0 0.75rem" }}>
            <Link href="/check" className="btn btn-primary btn-lg" data-testid="start">
              지금 시작하기 <Icon name="arrowRight" size={22} strokeWidth={2.2} />
            </Link>
          </p>
          <p className="small muted">질문 12개, 약 3분 걸립니다. 로그인하지 않으며, 모르는 항목은 &lsquo;모름&rsquo;으로 넘어가도 됩니다.</p>
          <ResumeBanner />

          <h2 className="h2">시작하기 전에</h2>
          <p className="body">다음을 알고 있으면 더 정확하게 찾을 수 있습니다.</p>
          <ul className="bullets">
            <li>주민등록상 주소(시·군·구)</li>
            <li>함께 사는 가구원 수</li>
            <li>지금 받고 있는 지원(기초연금, 기초생활수급 등)</li>
            <li>대략적인 가구 소득</li>
          </ul>

          <h2 className="h2" id="ex-h">
            예시로 먼저 보기
          </h2>
          <p className="body">입력 없이 결과 화면을 미리 볼 수 있습니다. 실제 개인 정보가 아닌 예시 상황이며, 결과 화면에서 내 상황으로 다시 입력할 수 있습니다.</p>
          <PresetButtons />

          <h2 className="h2">결과는 이렇게 알려 드립니다</h2>
          <dl className="summary">
            <dt>조건 충족</dt>
            <dd>{TIER_PLAIN.eligible}</dd>
            <dt>가능성 있음</dt>
            <dd>{TIER_PLAIN.likely}</dd>
            <dt>확인 필요</dt>
            <dd>{TIER_PLAIN.check}</dd>
          </dl>
          <p className="small muted" style={{ marginTop: "0.75rem" }}>
            모든 결과에 판단 이유와 원문 출처·기준일을 함께 적습니다. 최종 결정은 담당 기관이 합니다.
          </p>

          <form action="/search" role="search" style={{ marginTop: "3rem" }}>
            <h2 className="h2" style={{ marginTop: 0 }}>
              <label htmlFor="home-q">이미 아는 서비스가 있나요?</label>
            </h2>
            <div className="search-box">
              <input id="home-q" name="q" type="search" className="input" placeholder="예: 기초연금, 에너지바우처, 산후조리" autoComplete="off" />
              <button type="submit" className="btn btn-primary">
                검색
              </button>
            </div>
          </form>
        </div>

        <aside className="side" aria-label="도움말">
          <section>
            <h2>도움이 필요하신가요?</h2>
            <p>
              보건복지상담센터 <strong>129</strong>
              <br />
              <span className="muted">평일 9시~18시, 긴급 상황은 24시간</span>
            </p>
          </section>
          <section>
            <h2>개인정보</h2>
            <p>입력한 내용은 서버로 보내지 않고 이 기기에서만 판정합니다. 주민등록번호는 묻지 않습니다.</p>
          </section>
          <section>
            <h2>담고 있는 서비스</h2>
            <table className="median-table">
              <caption className="sr-only">기관 유형별 서비스 수</caption>
              <tbody>
                <tr>
                  <th scope="row">중앙부처·청</th>
                  <td>{n(c.byOrg.central)}</td>
                </tr>
                <tr>
                  <th scope="row">시도·시군구</th>
                  <td>{n(c.byOrg.metro + c.byOrg.local)}</td>
                </tr>
                <tr>
                  <th scope="row">공공기관</th>
                  <td>{n(c.byOrg.public_inst)}</td>
                </tr>
              </tbody>
            </table>
            <p className="small muted">
              경기도는 시범 지역으로 자격 규칙을 먼저 검수합니다. 다른 지역은 대부분 &lsquo;가능성 있음&rsquo;·&lsquo;확인 필요&rsquo;로 안내됩니다.{" "}
              <Link href="/about">데이터 출처와 기준일</Link>
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
