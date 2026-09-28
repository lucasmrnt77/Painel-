import Link from "next/link";
import type { Resumo } from "@/lib/dados";
import { SeletorLancamento } from "./navegacao";

export function CabecalhoPagina({ titulo, resumos, atual, children }: { titulo: string; resumos: Resumo[]; atual: Resumo | null; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{titulo}</h1>
        {atual && (
          <p className="text-sm text-zinc-500">
            {atual.nome}
            {atual.ativo && <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">ativo</span>}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {children}
        <SeletorLancamento opcoes={resumos.map((r) => ({ slug: r.slug, nome: r.nome, ativo: r.ativo }))} atual={atual?.slug ?? null} />
      </div>
    </div>
  );
}

export function SemLancamento() {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
      <p className="font-medium">Nenhum lançamento cadastrado ainda</p>
      <p className="mt-1 text-sm text-zinc-500">Crie o primeiro e marque como ativo para começar a receber inscrições.</p>
      <Link href="/lancamentos" className="mt-4 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
        Criar lançamento
      </Link>
    </div>
  );
}
