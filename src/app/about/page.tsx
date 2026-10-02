import type { Metadata } from "next";
import meta from "../../../public/bundles/v1/meta.json";
import { TIER_PLAIN } from "@/lib/client/howto";

export const metadata: Metadata = { title: "데이터·판정 기준" };

const n = (v: number) => v.toLocaleString("ko-KR");

export default function About() {
  const c = meta.counts;
  return (
    <div className="narrow page">
      <h1 className="h1">데이터 출처와 판정 기준</h1>
      <p className="lead">
        데이터 생성: {new Date(meta.generatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} (KST)
      </p>

      <section>
        <h2 className="h2">담고 있는 서비스 {n(c.uniquePrograms)}개 (중복 병합 후)</h2>
        <table className="median-table" style={{ marginTop: "0.75rem" }}>
          <caption className="sr-only">기관 유형별 서비스 수</caption>
          <thead>
            <tr>
              <th scope="col">기관 유형</th>
              <th scope="col">서비스 수</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>중앙부처·청 (전국 공통)</td><td>{n(c.byOrg.central)}</td></tr>
            <tr><td>시·도</td><td>{n(c.byOrg.metro)}</td></tr>
            <tr><td>시군구</td><td>{n(c.byOrg.local)}</td></tr>
            <tr><td>공공기관 (공단·재단·지방 공기업 등)</td><td>{n(c.byOrg.public_inst)}</td></tr>
            <tr><td>교육청 (기본 결과에서는 숨김, 필터로 보기)</td><td>{n((c.byOrg as Record<string, number>).edu_office ?? 0)}</td></tr>
            <tr><td>└ 복지 외 분야: 농림축산어업 종사자 대상 (기본 숨김)</td><td>{n((c as { bySector?: Record<string, number> }).bySector?.agri ?? 0)}</td></tr>
            <tr><td>└ 복지 외 분야: 사업자·창업·소상공인 대상 (기본 숨김)</td><td>{n((c as { bySector?: Record<string, number> }).bySector?.business ?? 0)}</td></tr>
            <tr><td>└ 기관·시설 운영 지원: 경로당·어린이집·법인·운영기관 대상 (기본 숨김)</td><td>{n((c as { bySector?: Record<string, number> }).bySector?.operator ?? 0)}</td></tr>
          </tbody>
        </table>
        <h3 className="h3" style={{ marginTop: "2rem" }}>신청 유형</h3>
        <p className="body" style={{ marginTop: "0.5rem" }}>
          이 서비스는 <strong>내가 직접 신청해야 받는데 놓치기 쉬운 혜택</strong>을 찾는 데 집중합니다. 신청방법·접수방법 원문에
          &lsquo;별도 신청 없이&rsquo;·&lsquo;자동 지급&rsquo;·&lsquo;직권 신청&rsquo;·&lsquo;학교장 추천&rsquo;·&lsquo;시설 입소자&rsquo; 같은 표현이 있으면
          자동 제공·기관 선정으로 분류해 추천과 목록에서 빼고, 결과 맨 아래 <strong>&lsquo;자동으로 받는 혜택&rsquo;</strong>에 접어 둡니다. 애매하면
          &lsquo;직접 신청&rsquo;이나 &lsquo;신청 방법 확인&rsquo;으로 두어 목록에 그대로 보입니다.
        </p>
        <table className="median-table" style={{ marginTop: "0.75rem" }}>
          <caption className="sr-only">신청 유형별 서비스 수</caption>
          <thead>
            <tr>
              <th scope="col">신청 유형</th>
              <th scope="col">서비스 수</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>직접 신청 (본인·가족이 주민센터·복지로·기관에 신청)</td><td>{n(c.byApplyType.self)}</td></tr>
            <tr><td>신청 방법 확인 (원문에 신청방법이 없거나 애매 — 목록에 그대로 표시)</td><td>{n(c.byApplyType.unknown)}</td></tr>
            <tr><td>자동 제공 (자동 지급·연계, 직권 신청, 학교·어린이집이 처리)</td><td>{n(c.byApplyType.auto)}</td></tr>
            <tr><td>기관 추천·선정 (기관·학교장 추천, 시설·기관 대상)</td><td>{n(c.byApplyType.institution)}</td></tr>
          </tbody>
        </table>
        <h3 className="h3" style={{ marginTop: "2rem" }}>출처</h3>
        <ul className="bullets">
          <li>
            정부24 공공서비스(혜택) 정보 (행정안전부, 공공데이터포털 15113968) —{" "}
            {meta.gov24.status === "ok" ? `${n((meta.gov24 as { services?: number }).services ?? 0)}건 · ${meta.dataAsOf.gov24}` : "연동 준비 중"}
          </li>
          <li>
            복지로 중앙부처·지자체 복지서비스 (한국사회보장정보원 OpenAPI 15090532·15108347) — 목록 {n(c.bokjiroApi.list.central)}+{n(c.bokjiroApi.list.local)}건 · {meta.dataAsOf.bokjiro}
          </li>
          <li>보건복지부 통합돌봄 지방정부 서비스 메뉴판 — {n(c.raw.icare)}건 · {meta.dataAsOf.icare}</li>
          <li>복지로 기반 핵심 복지 100선 요약 — {n(c.raw.welfare100)}건</li>
        </ul>
        <p className="small muted" style={{ marginTop: "0.5rem" }}>
          신청 방법이 있는 서비스 {n(c.coverage.applyMethod)}개({Math.round((100 * c.coverage.applyMethod) / c.coverage.total)}%), 연락처가 있는 서비스 {n(c.coverage.contact)}개({Math.round((100 * c.coverage.contact) / c.coverage.total)}%).
          정보가 없으면 주소지 행정복지센터·시군구청과 ☎129·110으로 안내합니다.
        </p>
        <p className="small muted" style={{ marginTop: "0.5rem" }}>
          같은 사업이 여러 출처에 있으면 이름·기관 단계·지역을 대조해 하나로 합칩니다(교차 병합 {n(c.dedup.crossMerged.reduce((a, x) => a + x.count, 0))}건, 전국 사업의 지역 운영분 {n(c.dedup.absorbedAsLocalOps)}건).
          읍면동 단독 사업은 목록에서 제외하고, 읍면동은 신청처로만 안내합니다.
        </p>
      </section>

      <section>
        <h2 className="h2">판정 기준</h2>
        <dl className="summary">
          <dt>조건 충족</dt>
          <dd>{TIER_PLAIN.eligible} 검수된 규칙의 조건을 입력값이 모두 충족할 때만 표시합니다.</dd>
          <dt>가능성 있음</dt>
          <dd>{TIER_PLAIN.likely} 입력하지 않았거나 묻지 않는 조건(재산, 질병 등)이 남은 경우이며, 자동 변환 규칙은 여기까지만 판정합니다.</dd>
          <dt>확인 필요</dt>
          <dd>{TIER_PLAIN.check} &lsquo;필요하다고 인정되는 사람&rsquo;처럼 상담으로 판단하거나 구조화된 조건이 없는 경우입니다.</dd>
        </dl>
        <ul className="bullets" style={{ marginTop: "1rem" }}>
          <li>검수 규칙(1차): {n(c.rulesByReview.curated)}개 — 원문 근거 구절과 대조해 작성한 규칙(AI 보조)이며 최종 사람 검수 진행 중.</li>
          <li>API 지원조건: {n((c.rulesByReview as Record<string, number>).structured ?? 0)}개 — 공공서비스(혜택) API의 구조화된 지원조건 코드(나이·소득 구간·대상 특성·가구 유형)에서 변환. 전국 사업과 경기도(시범) 사업에만 &lsquo;조건 충족&rsquo;을 허용하고, 원문에 수급·장애 등 추가 요건이 보이면 &lsquo;가능성 있음&rsquo;으로 낮춥니다.</li>
          <li>자동 변환 규칙: {n(c.rulesByReview.auto)}개 — 복지로 분류 태그·대상 문구, 또는 시범 지역 밖의 API 지원조건. 최대 &lsquo;가능성 있음&rsquo;. 경기도 {n(c.pilot.autoRules)}개는 검수 대기열에 있습니다.</li>
          <li>조건이 맞지 않는 서비스는 기본으로 숨기고, 원하면 이유와 함께 볼 수 있습니다.</li>
        </ul>
      </section>

      <section>
        <h2 className="h2">개인정보 원칙</h2>
        <ul className="bullets">
          <li>로그인·회원가입 없이 이용합니다. 주민등록번호는 어느 단계에서도 받지 않습니다.</li>
          <li>입력값은 서버로 보내지 않습니다. 지역별 서비스 묶음을 내려받아 이 기기 안에서 판정합니다.</li>
          <li>입력값은 이 브라우저에만 저장되며 &lsquo;이 기기에서 지우기&rsquo;로 언제든 삭제할 수 있습니다. 공용 기기 모드에서는 브라우저를 닫으면 사라집니다.</li>
          <li>장애·돌봄 같은 민감 정보는 선택 입력입니다.</li>
        </ul>
      </section>
    </div>
  );
}
