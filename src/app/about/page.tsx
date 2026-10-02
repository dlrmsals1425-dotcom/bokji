import type { Metadata } from "next";
import meta from "../../../public/bundles/v1/meta.json";
import { TierBadge } from "@/components/Badges";

export const metadata: Metadata = { title: "데이터·판정 기준" };

const n = (v: number) => v.toLocaleString("ko-KR");

export default function About() {
  const c = meta.counts;
  return (
    <div className="narrow" style={{ padding: "28px 0 48px" }}>
      <h1 style={{ fontSize: "clamp(1.5rem, 1.2rem + 1.2vw, 2.1rem)", fontWeight: 850 }}>데이터 출처와 판정 기준</h1>
      <p className="muted" style={{ marginTop: 8 }}>
        데이터 생성: {new Date(meta.generatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} (KST)
      </p>

      <section className="card pad" style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: "1.2rem" }}>담고 있는 서비스 {n(c.uniquePrograms)}개 (중복 병합 후)</h2>
        <table className="median-table" style={{ marginTop: 10 }}>
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
          </tbody>
        </table>
        <h3 style={{ fontSize: "1rem", marginTop: 18 }}>출처</h3>
        <ul className="small" style={{ paddingLeft: 18 }}>
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
        <p className="small muted" style={{ marginTop: 8 }}>
          신청 방법이 있는 서비스 {n(c.coverage.applyMethod)}개({Math.round((100 * c.coverage.applyMethod) / c.coverage.total)}%), 연락처가 있는 서비스 {n(c.coverage.contact)}개({Math.round((100 * c.coverage.contact) / c.coverage.total)}%).
          정보가 없으면 주소지 행정복지센터·시군구청과 ☎129·110으로 안내합니다.
        </p>
        <p className="small muted" style={{ marginTop: 8 }}>
          같은 사업이 여러 출처에 있으면 이름·기관 단계·지역을 대조해 하나로 합칩니다(교차 병합 {n(c.dedup.crossMerged.reduce((a, x) => a + x.count, 0))}건, 전국 사업의 지역 운영분 {n(c.dedup.absorbedAsLocalOps)}건).
          읍면동 단독 사업은 목록에서 제외하고, 읍면동은 신청처로만 안내합니다.
        </p>
      </section>

      <section className="card pad" style={{ marginTop: 14 }}>
        <h2 style={{ fontSize: "1.2rem" }}>판정 기준</h2>
        <div className="tier-explain" style={{ marginTop: 12 }}>
          <div className="row"><TierBadge tier="eligible" /><p>검수된 규칙의 조건을 입력값이 모두 충족할 때만 표시합니다.</p></div>
          <div className="row"><TierBadge tier="likely" /><p>충족한 조건이 있으나 입력하지 않았거나 묻지 않는 조건(재산, 질병 등)이 남은 경우. 자동 변환 규칙은 여기까지만 판정합니다.</p></div>
          <div className="row"><TierBadge tier="check" /><p>&lsquo;필요하다고 인정되는 사람&rsquo;처럼 상담으로 판단하거나 구조화된 조건이 없는 경우.</p></div>
        </div>
        <ul className="small" style={{ paddingLeft: 18, marginTop: 12 }}>
          <li>검수 규칙(1차): {n(c.rulesByReview.curated)}개 — 원문 근거 구절과 대조해 작성한 규칙(AI 보조)이며 최종 사람 검수 진행 중.</li>
          <li>API 지원조건: {n((c.rulesByReview as Record<string, number>).structured ?? 0)}개 — 공공서비스(혜택) API의 구조화된 지원조건 코드(나이·소득 구간·대상 특성·가구 유형)에서 변환. 전국 사업과 경기도(시범) 사업에만 &lsquo;조건 충족&rsquo;을 허용하고, 원문에 수급·장애 등 추가 요건이 보이면 &lsquo;가능성 있음&rsquo;으로 낮춥니다.</li>
          <li>자동 변환 규칙: {n(c.rulesByReview.auto)}개 — 복지로 분류 태그·대상 문구, 또는 시범 지역 밖의 API 지원조건. 최대 &lsquo;가능성 있음&rsquo;. 경기도 {n(c.pilot.autoRules)}개는 검수 대기열에 있습니다.</li>
          <li>조건이 맞지 않는 서비스는 기본으로 숨기고, 원하면 이유와 함께 볼 수 있습니다.</li>
        </ul>
      </section>

      <section className="card pad" style={{ marginTop: 14 }}>
        <h2 style={{ fontSize: "1.2rem" }}>개인정보 원칙</h2>
        <ul className="small" style={{ paddingLeft: 18, marginTop: 8 }}>
          <li>로그인·회원가입 없이 이용합니다. 주민등록번호는 어느 단계에서도 받지 않습니다.</li>
          <li>입력값은 서버로 보내지 않습니다. 지역별 서비스 묶음을 내려받아 이 기기 안에서 판정합니다.</li>
          <li>입력값은 이 브라우저에만 저장되며 &lsquo;이 기기에서 지우기&rsquo;로 언제든 삭제할 수 있습니다. 공용 기기 모드에서는 브라우저를 닫으면 사라집니다.</li>
          <li>장애·돌봄 같은 민감 정보는 선택 입력입니다.</li>
        </ul>
      </section>
    </div>
  );
}
