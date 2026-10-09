"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Item = { href: string; rotulo: string; icone: keyof typeof ICONES; externo?: boolean };
type Grupo = { titulo?: string; itens: Item[] };

const MENU: Grupo[] = [
  {
    itens: [
      { href: "/", rotulo: "Visão geral", icone: "inicio" },
      { href: "/alertas", rotulo: "Alertas", icone: "sino" },
      { href: "/meta", rotulo: "Saúde na Meta", icone: "pulso" },
    ],
  },
  {
    titulo: "Lançamento",
    itens: [
      { href: "/inscricoes", rotulo: "Inscritos x grupo", icone: "pessoas" },
      { href: "/analise", rotulo: "Análise", icone: "grafico" },
    ],
  },
  {
    titulo: "Captação",
    itens: [
      { href: "/grupo", rotulo: "Grupo gratuito", icone: "chat" },
      { href: "/redirecionador", rotulo: "Redirecionador", icone: "setas" },
      { href: "/links", rotulo: "Links", icone: "link" },
    ],
  },
  {
    titulo: "Dados",
    itens: [
      { href: "/eventos", rotulo: "Sendflow e importação", icone: "camadas" },
      { href: "/lancamentos", rotulo: "Lançamentos", icone: "calendario" },
    ],
  },
  {
    titulo: "Outros painéis",
    itens: [
      { href: "/trafego", rotulo: "Tráfego", icone: "tendencia", externo: true },
      { href: "/admin", rotulo: "Pagamentos", icone: "cartao", externo: true },
    ],
  },
];

/* Ícones de traço simples (24×24), herdam a cor do texto */
const ICONES = {
  inicio: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  pessoas: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.5 3.5 5.2" /></>,
  grafico: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  chat: <><path d="M4 18.5 5.3 15A8 8 0 1 1 9 19z" /></>,
  setas: <><path d="M4 7h13l-3-3M20 17H7l3 3" /></>,
  link: <><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></>,
  camadas: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>,
  calendario: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  tendencia: <><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  cartao: <><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M2.5 10h19M6.5 15h4" /></>,
  pulso: <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />,
  sino: <><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  fechar: <path d="M6 6l12 12M18 6 6 18" />,
};

function Icone({ nome, className = "h-4 w-4" }: { nome: keyof typeof ICONES; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {ICONES[nome]}
    </svg>
  );
}

function Marca() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/40">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_2px_rgba(0,208,132,0.55)]" />
      </span>
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-tight text-zinc-100">Painel Sendflow</div>
        <div className="text-[11px] text-zinc-500">Trader de Elite</div>
      </div>
    </div>
  );
}

function ListaMenu({ aoNavegar, avisos = {} }: { aoNavegar?: () => void; avisos?: Record<string, number> }) {
  const caminho = usePathname();
  const l = useSearchParams().get("l");
  return (
    <nav className="space-y-5" aria-label="Menu do painel">
      {MENU.map((g, i) => (
        <div key={i}>
          {g.titulo && <div className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{g.titulo}</div>}
          <ul className="space-y-0.5">
            {g.itens.map((it) => {
              const ativa = it.href === "/" ? caminho === "/" : caminho.startsWith(it.href);
              const classe = `group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                ativa
                  ? "bg-emerald-500/10 font-medium text-emerald-400 ring-1 ring-inset ring-emerald-500/25"
                  : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100"
              }`;
              const conteudo = (
                <>
                  <Icone nome={it.icone} className={`h-4 w-4 shrink-0 ${ativa ? "text-emerald-400" : "text-zinc-500 group-hover:text-zinc-300"}`} />
                  <span className="truncate">{it.rotulo}</span>
                  {!!avisos[it.href] && (
                    <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold text-white" aria-label={`${avisos[it.href]} problema(s)`}>
                      {avisos[it.href]}
                    </span>
                  )}
                  {it.externo && <span className="ml-auto text-[10px] text-zinc-600 group-hover:text-zinc-400">↗</span>}
                </>
              );
              return (
                <li key={it.href}>
                  {it.externo ? (
                    // Outros projetos (rewrite em next.config.ts): <a> simples, não <Link>
                    <a href={it.href} className={classe} onClick={aoNavegar}>{conteudo}</a>
                  ) : (
                    <Link href={l ? `${it.href}?l=${encodeURIComponent(l)}` : it.href} className={classe} onClick={aoNavegar} aria-current={ativa ? "page" : undefined}>
                      {conteudo}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Menu lateral fixo no computador; no celular, barra no topo com o menu em gaveta. */
export function MenuLateral({ sair, avisos }: { sair: React.ReactNode; avisos?: Record<string, number> }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      {/* Computador */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-zinc-800 bg-zinc-950 lg:flex">
        <div className="px-5 pb-4 pt-5"><Marca /></div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <ListaMenu avisos={avisos} />
        </div>
        <div className="border-t border-zinc-800 px-5 py-3">{sair}</div>
      </aside>

      {/* Celular */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur lg:hidden">
        <Marca />
        <button type="button" onClick={() => setAberto(true)} aria-label="Abrir menu" className="relative rounded-lg p-2 text-zinc-300 hover:bg-zinc-800">
          <Icone nome="menu" className="h-5 w-5" />
          {Object.values(avisos ?? {}).some(Boolean) && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-rose-500" />}
        </button>
      </header>
      {aberto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-black/60" onClick={() => setAberto(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-zinc-800 bg-zinc-950">
            <div className="flex items-center justify-between px-5 pb-4 pt-5">
              <Marca />
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar menu" className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800">
                <Icone nome="fechar" className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-4">
              <ListaMenu aoNavegar={() => setAberto(false)} avisos={avisos} />
            </div>
            <div className="border-t border-zinc-800 px-5 py-3">{sair}</div>
          </aside>
        </div>
      )}
    </>
  );
}

export function SeletorLancamento({ opcoes, atual }: { opcoes: { slug: string; nome: string; ativo: boolean }[]; atual: string | null }) {
  const router = useRouter();
  const caminho = usePathname();
  if (opcoes.length === 0) return null;
  return (
    <select
      aria-label="Lançamento"
      value={atual ?? ""}
      onChange={(e) => router.push(`${caminho}?l=${encodeURIComponent(e.target.value)}`)}
      className="max-w-[60vw] rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
    >
      {opcoes.map((o) => (
        <option key={o.slug} value={o.slug}>
          {o.nome}{o.ativo ? " · ativo" : ""}
        </option>
      ))}
    </select>
  );
}
