import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // /workspace 상위의 package-lock.json 을 루트로 오인하지 않도록 고정
  turbopack: { root: path.resolve(__dirname) },
  async headers() {
    return [
      {
        // 번들은 데이터 버전(v1) 단위로 교체 — 짧게 캐시하고 재검증
        source: "/bundles/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=600, stale-while-revalidate=86400" }],
      },
    ];
  },
};

export default nextConfig;
