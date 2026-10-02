import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap stack">
        <p>
          <strong>복지나침반</strong>은 공공 데이터를 모아 보여주는 안내 서비스입니다. 최종 자격과 지원 여부는 담당 기관의 심사로
          결정됩니다. 신청은 복지로·정부24·주민센터 등 공식 창구에서 하세요.
        </p>
        <p>
          입력하신 정보는 서버로 보내지 않고 이 기기에서만 판정합니다. 주민등록번호는 받지 않습니다. 상담: 보건복지상담센터 ☎ 129 ·
          정부민원안내 ☎ 110 · <Link href="/about">데이터 출처와 판정 기준</Link>
        </p>
      </div>
    </footer>
  );
}
