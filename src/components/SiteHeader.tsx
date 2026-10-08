"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { setSettings, useSettings } from "@/lib/client/storage";
import { Icon } from "./Icon";

const NAV = [
  { href: "/situation", label: "맞춤 찾기" },
  { href: "/results", label: "내 결과" },
  { href: "/search", label: "서비스 검색" },
  { href: "/about", label: "데이터·판정 기준" },
];

/** 하트 나침반 심볼 (푸터 등 작은 표시). 장식이므로 대체 텍스트 없음 — 옆에 '복지나침반' 글자가 함께 나옴 */
export function LogoMark() {
  // eslint-disable-next-line @next/next/no-img-element -- 벡터 로고: 최적화 불필요, rem 크기로 '글자 크게'와 함께 커짐
  return <img className="logo-symbol" src="/brand/logo-symbol.svg" alt="" aria-hidden="true" width={31} height={28} />;
}

export function SiteHeader() {
  const path = usePathname();
  const settings = useSettings();
  const large = settings?.large ?? false;
  const nav = (cls: string) => (
    <nav className={cls} aria-label={cls === "mnav" ? "주 메뉴(모바일)" : "주 메뉴"}>
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}>
          {n.label}
        </Link>
      ))}
    </nav>
  );
  return (
    <>
      <div className="util">
        <div className="wrap">
          <span className="util-note">
            <Icon name="shieldCheck" size={15} />
            공공데이터로 만든 복지 안내 서비스 · 로그인 없이 이용
          </span>
          <span className="util-right hide-sm">상담 보건복지상담센터 129</span>
        </div>
      </div>
      <header className="site-header">
        <div className="wrap">
          <Link href="/" className="logo" aria-label="복지나침반 홈">
            {/* eslint-disable-next-line @next/next/no-img-element -- 벡터 로고(글자는 윤곽선), rem 높이로 '글자 크게'와 함께 커짐 */}
            <img className="logo-img" src="/brand/logo-e2.svg" alt="복지나침반" width={138} height={32} />
          </Link>
          {nav("header-nav")}
          <div className="header-actions">
            <button type="button" className="btn btn-sm toggle" aria-pressed={large} onClick={() => setSettings({ large: !large })} data-testid="large-text">
              {large ? "글자 보통" : "글자 크게"}
            </button>
          </div>
        </div>
        {nav("mnav")}
      </header>
    </>
  );
}
