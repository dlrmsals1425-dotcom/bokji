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

export function LogoMark() {
  return (
    <span className="logo-mark" aria-hidden="true">
      <Icon name="compass" size={20} strokeWidth={2} />
    </span>
  );
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
            <LogoMark />
            복지나침반
          </Link>
          {nav("header-nav")}
          <div className="header-actions">
            <button type="button" className="btn btn-sm toggle" aria-pressed={large} onClick={() => setSettings({ large: !large })} data-testid="large-text">
              {large ? "글자 보통" : "글자 크게"}
            </button>
            <button
              type="button"
              className="btn btn-quiet hide-sm"
              disabled
              title="로그인은 정밀 매칭·저장·알림·신청 지원과 함께 준비 중입니다. 지금은 로그인 없이 모든 검색·추천을 쓸 수 있어요."
            >
              로그인 준비 중
            </button>
          </div>
        </div>
        {nav("mnav")}
      </header>
    </>
  );
}
