import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: { default: "복지나침반 — 로그인 없이 찾는 맞춤 복지", template: "%s · 복지나침반" },
  description:
    "중앙정부·시도·시군구·공공기관 복지 서비스를 한곳에서. 12개 간단한 질문으로 조건 충족 / 가능성 있음 / 확인 필요로 나눠 이유와 함께 보여드립니다. 입력값은 서버로 보내지 않습니다.",
  robots: { index: false },
};

export const viewport: Viewport = {
  themeColor: "#1b3fbf",
  width: "device-width",
  initialScale: 1,
};

/** 큰 글씨 설정을 첫 페인트 전에 적용 (깜빡임 방지) */
const settingsBootstrap = `try{var s=JSON.parse(localStorage.getItem('bn.settings.v1')||'{}');if(s.large)document.documentElement.dataset.large='1'}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: settingsBootstrap }} />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        <a className="skip" href="#main">
          본문 바로가기
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
