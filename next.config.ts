import type { NextConfig } from "next";

// Painéis de outros projetos servidos dentro deste (rewrite): mesmo endereço e mesmo menu.
const TRAFEGO = "https://metricas-lancamentos-martin.vercel.app";
const PAGAMENTOS = (process.env.PAGAMENTOS_URL || "https://sistema-pagamentos-indol.vercel.app").replace(/\/+$/, "");
// Domínio dos links curtos (o mesmo projeto atende: link.traderdelite.net/<slug> → /l/<slug>).
const LINKS = (process.env.LINKS_DOMINIO || "link.traderdelite.net").replace(/^https?:\/\//, "").replace(/\/+$/, "");
const noDominioDosLinks = [{ type: "host" as const, value: LINKS }];

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      // Antes de tudo: no domínio dos links, qualquer /<slug> vira um link curto
      // (assim as páginas do painel não ficam acessíveis por esse domínio).
      beforeFiles: [
        { source: "/", has: noDominioDosLinks, destination: "/l" },
        { source: "/:slug", has: noDominioDosLinks, destination: "/l/:slug" },
      ],
      afterFiles: [
        // Aba "Tráfego": métricas dos lançamentos.
        { source: "/trafego", destination: `${TRAFEGO}/trafego` },
        { source: "/trafego/:path*", destination: `${TRAFEGO}/trafego/:path*` },
        // Aba "Pagamentos": painel do sistema de pagamentos (login próprio).
        { source: "/admin", destination: `${PAGAMENTOS}/admin` },
        { source: "/admin/:path*", destination: `${PAGAMENTOS}/admin/:path*` },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;
