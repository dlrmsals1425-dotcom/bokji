"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "./Logo";
import { setSettings, useSettings } from "@/lib/client/storage";

const NAV = [
  { href: "/check", label: "맞춤 찾기" },
  { href: "/results", label: "내 결과" },
  { href: "/search", label: "검색" },
  { href: "/about", label: "데이터·판정 기준" },
];

export function SiteHeader() {
  const path = usePathname();
  const settings = useSettings();
  const large = settings?.large ?? false;
  return (
    <header className="site-header">
      <div className="wrap">
        <Link href="/" className="logo" aria-label="복지나침반 홈">
          <LogoMark />
          복지나침반
        </Link>
        <nav className="header-nav" aria-label="주 메뉴">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm toggle"
            aria-pressed={large}
            onClick={() => setSettings({ large: !large })}
            data-testid="large-text"
          >
            <span aria-hidden="true">가+</span> 큰 글씨
          </button>
          <button
            type="button"
            className="btn btn-locked btn-sm hide-sm"
            disabled
            title="로그인은 정밀 매칭·저장·알림·신청 지원과 함께 준비 중입니다. 지금은 로그인 없이 모든 검색·추천을 쓸 수 있어요."
          >
            🔒 로그인 준비 중
          </button>
        </div>
      </div>
    </header>
  );
}
