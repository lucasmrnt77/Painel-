import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Aba "Tráfego": servida por outro projeto (métricas dos lançamentos).
  async rewrites() {
    return [
      { source: "/trafego", destination: "https://metricas-lancamentos-martin.vercel.app/trafego" },
      { source: "/trafego/:path*", destination: "https://metricas-lancamentos-martin.vercel.app/trafego/:path*" },
    ];
  },
};

export default nextConfig;
