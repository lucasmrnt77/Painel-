"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const ABAS = [
  { href: "/", rotulo: "Visão geral" },
  { href: "/inscricoes", rotulo: "Inscrições" },
  { href: "/membros", rotulo: "Membros do grupo" },
  { href: "/eventos", rotulo: "Eventos Sendflow" },
  { href: "/lancamentos", rotulo: "Lançamentos" },
];

export function Abas() {
  const caminho = usePathname();
  const l = useSearchParams().get("l");
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto">
      {ABAS.map((a) => {
        const ativa = a.href === "/" ? caminho === "/" : caminho.startsWith(a.href);
        return (
          <Link
            key={a.href}
            href={l ? `${a.href}?l=${encodeURIComponent(l)}` : a.href}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              ativa
                ? "border-emerald-600 text-zinc-900 dark:text-zinc-50"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            {a.rotulo}
          </Link>
        );
      })}
    </nav>
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
