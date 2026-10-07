import type { NextConfig } from "next";

// Painéis de outros projetos servidos dentro deste (rewrite): mesmo endereço e mesmo menu.
const TRAFEGO = "https://metricas-lancamentos-martin.vercel.app";
const PAGAMENTOS = (process.env.PAGAMENTOS_URL || "https://sistema-pagamentos-indol.vercel.app").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Aba "Tráfego": métricas dos lançamentos.
      { source: "/trafego", destination: `${TRAFEGO}/trafego` },
      { source: "/trafego/:path*", destination: `${TRAFEGO}/trafego/:path*` },
      // Aba "Pagamentos": painel do sistema de pagamentos (login próprio).
      { source: "/admin", destination: `${PAGAMENTOS}/admin` },
      { source: "/admin/:path*", destination: `${PAGAMENTOS}/admin/:path*` },
    ];
  },
};

export default nextConfig;
