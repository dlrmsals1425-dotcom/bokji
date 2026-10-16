import Link from "next/link";
import { LogoMark } from "./SiteHeader";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="foot-top">
          <div>
            <span className="foot-brand">
              <LogoMark />
              복지나침반
            </span>
            <p style={{ marginTop: "0.625rem" }}>
              정부24·복지로 등 공공 데이터를 모아 보여 주는 안내 서비스입니다. 정부 공식 누리집이 아니며, 실제 지원 여부는 담당 기관의 심사로 결정됩니다.
            </p>
          </div>
          <div>
            <h2>복지 상담</h2>
            <p>
              <strong>보건복지상담센터 129</strong> (평일 9시~18시, 긴급 24시간)
              <br />
              <strong>정부민원안내 110</strong>
            </p>
          </div>
          <div>
            <h2>신청은 공식 창구에서</h2>
            <p>주소지 행정복지센터(주민센터), 복지로, 정부24에서 신청하세요.</p>
          </div>
        </div>
        <ul className="foot-links">
          <li>
            <Link href="/about#privacy">개인정보 원칙</Link>
          </li>
          <li>
            <Link href="/about">데이터 출처와 판정 기준</Link>
          </li>
          <li>
            <Link href="/search">서비스 검색</Link>
          </li>
        </ul>
        <p>복지 답변은 앱 서버로 보내지 않고 이 기기에서 판정합니다. 음성 입력을 사용하면 브라우저 제공업체의 서버로 음성이 전송될 수 있습니다. 주민등록번호는 받지 않습니다.</p>
      </div>
    </footer>
  );
}
